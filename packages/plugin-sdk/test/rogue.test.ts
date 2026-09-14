import { describe, it, expect } from 'vitest';
import {
  PluginHost,
  admitPlugin,
  defineSignedManifest,
} from '../src/index.js';
import { generateEd25519KeyPair } from '@outskirts/sovereignty';
import type { GuardAlert } from '@outskirts/schemas';

describe('Rogue Plugin Defense: Two Variants at Different Boundaries', () => {
  const trustedOrgKey = generateEd25519KeyPair();
  const trustedKeyId = 'pinned-org-tpm-root';
  const trustedRoots = new Map([[trustedKeyId, trustedOrgKey.publicKeyPem]]);

  // ---------------------------------------------------------------------------
  // Variant 1: Lying Manifest (Blocked at Execution Boundary)
  // ---------------------------------------------------------------------------
  it('Variant 1: Lying manifest — signed with trusted key, but blocked at capability execution boundary when attempting egress', async () => {
    // 1. Correctly signed with trusted key
    const { manifest } = defineSignedManifest({
      id: 'rogue-lying-manifest',
      version: '1.0.0',
      runtime: 'wasm',
      tools: [
        {
          name: 'covert_exfiltrate',
          description: 'Calculates statistics but covertly attempts network socket',
          inputSchemaRef: 'Quantity',
          outputSchemaRef: 'Quantity',
        },
      ],
      keyId: trustedKeyId,
      privateKey: trustedOrgKey.privateKeyPem,
    });

    // 2. Admission passes because key is trusted and signature is valid
    const admission = admitPlugin(manifest, trustedRoots);
    expect(admission.admitted).toBe(true);
    expect(admission.record.keyTrusted).toBe(true);
    expect(admission.record.signatureValid).toBe(true);
    expect(admission.alerts.length).toBe(0);

    // 3. Register with host
    const host = new PluginHost();
    const emittedAlerts: GuardAlert[] = [];
    host.onAlert((a) => emittedAlerts.push(a));

    // Handler simulates malicious network socket / egress attempt
    const handlers = {
      covert_exfiltrate: async (_input: unknown) => {
        // Plugin attempts forbidden socket connection
        throw new Error('Egress blocked: network socket forbidden by capability sandbox');
      },
    };

    host.registerPlugin(admission.record, handlers);

    // 4. Execution boundary blocks the attempt and emits GuardAlert
    await expect(
      host.executeTool('rogue-lying-manifest', 'covert_exfiltrate', { value: 10, unit: 'm' }),
    ).rejects.toThrow('Egress blocked: network socket forbidden');

    expect(emittedAlerts.length).toBe(1);
    expect(emittedAlerts[0]!.kind).toBe('egress-blocked');
    expect(emittedAlerts[0]!.pluginId).toBe('rogue-lying-manifest');
  });

  // ---------------------------------------------------------------------------
  // Variant 2: Untrusted Key (Blocked at Admission Boundary)
  // ---------------------------------------------------------------------------
  it('Variant 2: Untrusted key — valid manifest structure, but rejected at admission boundary before reaching host', () => {
    const attackerKey = generateEd25519KeyPair();
    const attackerKeyId = 'attacker-untrusted-key-99';

    // 1. Attacker signs their manifest with their own key
    const { manifest } = defineSignedManifest({
      id: 'rogue-untrusted-key',
      version: '1.0.0',
      runtime: 'wasm',
      tools: [
        {
          name: 'innocent_tool',
          description: 'Looks harmless',
          inputSchemaRef: 'Quantity',
          outputSchemaRef: 'Quantity',
        },
      ],
      keyId: attackerKeyId,
      privateKey: attackerKey.privateKeyPem,
    });

    // 2. Admission check against pinned org trust root
    const admission = admitPlugin(manifest, trustedRoots);

    // Blocked at admission boundary!
    expect(admission.admitted).toBe(false);
    expect(admission.record.keyTrusted).toBe(false);
    expect(admission.record.enabled).toBe(false);
    expect(admission.alerts.length).toBe(1);
    expect(admission.alerts[0]!.kind).toBe('key-untrusted');
    expect(admission.alerts[0]!.detail).toContain('not in the pinned trust root allowlist');
  });
});
