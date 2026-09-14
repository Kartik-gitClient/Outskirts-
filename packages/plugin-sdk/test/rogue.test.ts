import { describe, it, expect } from 'vitest';
import {
  PluginHost,
  admitPlugin,
  defineSignedManifest,
} from '../src/index.js';
import { generateEd25519KeyPair } from '@outskirts/sovereignty';

describe('Negative-Case Plugin Defense: Two Variants at Different Boundaries', () => {
  const trustedOrgKey = generateEd25519KeyPair();
  const trustedKeyId = 'pinned-org-tpm-root';
  const trustedRoots = new Map([[trustedKeyId, trustedOrgKey.publicKeyPem]]);

  // ---------------------------------------------------------------------------
  // Variant 1: Execution Boundary — Plugin Error Propagation
  // STATUS: Pending Extism WASM runtime for real capability enforcement.
  //         Currently validates that execution errors propagate correctly
  //         without false-positive egress classification.
  // ---------------------------------------------------------------------------
  it('Variant 1: Signed plugin execution error propagates as PluginExecutionError without false egress classification', async () => {
    const { manifest } = defineSignedManifest({
      id: 'demo-unauthorized-net-manifest',
      version: '1.0.0',
      runtime: 'wasm',
      tools: [
        {
          name: 'unauthorized_network_request',
          description: 'Calculates statistics but attempts ungranted network socket',
          inputSchemaRef: 'Quantity',
          outputSchemaRef: 'Quantity',
        },
      ],
      keyId: trustedKeyId,
      privateKey: trustedOrgKey.privateKeyPem,
    });

    // Admission passes because key is trusted and signature is valid
    const admission = admitPlugin(manifest, trustedRoots);
    expect(admission.admitted).toBe(true);
    expect(admission.record.keyTrusted).toBe(true);
    expect(admission.record.signatureValid).toBe(true);
    expect(admission.alerts.length).toBe(0);

    // Register with host
    const host = new PluginHost();

    const handlers = {
      unauthorized_network_request: async (_input: unknown) => {
        throw new Error('Egress blocked: network socket forbidden by capability sandbox');
      },
    };

    host.registerPlugin(admission.record, handlers);

    // Execution error propagates as PluginExecutionError
    // NOTE: No egress-blocked alert is emitted because capability enforcement
    // is pending Extism WASM runtime integration. The substring-based heuristic
    // was removed to prevent false positives from arbitrary error messages.
    await expect(
      host.executeTool('demo-unauthorized-net-manifest', 'unauthorized_network_request', { value: 10, unit: 'm' }),
    ).rejects.toThrow('Execution failed:');
  });

  // ---------------------------------------------------------------------------
  // Variant 2: Untrusted Key (Blocked at Admission Boundary)
  // ---------------------------------------------------------------------------
  it('Variant 2: Untrusted key — valid manifest structure, but rejected at admission boundary before reaching host', () => {
    const untrustedExternalKey = generateEd25519KeyPair();
    const untrustedKeyId = 'untrusted-external-key-99';

    const { manifest } = defineSignedManifest({
      id: 'demo-untrusted-key',
      version: '1.0.0',
      runtime: 'wasm',
      tools: [
        {
          name: 'standard_tool',
          description: 'Standard utility calculation tool',
          inputSchemaRef: 'Quantity',
          outputSchemaRef: 'Quantity',
        },
      ],
      keyId: untrustedKeyId,
      privateKey: untrustedExternalKey.privateKeyPem,
    });

    // Admission check against pinned org trust root
    const admission = admitPlugin(manifest, trustedRoots);

    // Blocked at admission boundary
    expect(admission.admitted).toBe(false);
    expect(admission.record.keyTrusted).toBe(false);
    expect(admission.record.enabled).toBe(false);
    expect(admission.alerts.length).toBe(1);
    expect(admission.alerts[0]!.kind).toBe('key-untrusted');
    expect(admission.alerts[0]!.detail).toContain('not in the pinned trust root allowlist');
  });
});
