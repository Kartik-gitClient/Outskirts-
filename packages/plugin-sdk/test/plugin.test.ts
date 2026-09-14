import { describe, it, expect } from 'vitest';
import {
  PluginHost,
  admitPlugin,
  createPipeCalcPlugin,
  defineSignedManifest,
} from '../src/index.js';
import { generateEd25519KeyPair } from '@outskirts/sovereignty';
import type { PipePressureDropInput, GuardAlert } from '@outskirts/schemas';

describe('Plugin SDK & Host', () => {
  const trustedOrgKey = generateEd25519KeyPair();
  const trustedKeyId = 'trusted-org-key-01';
  const trustedRoots = new Map([[trustedKeyId, trustedOrgKey.publicKeyPem]]);

  it('generates a valid signed manifest and verifies admission against trusted key', () => {
    const { manifest } = createPipeCalcPlugin(trustedKeyId, trustedOrgKey.privateKeyPem);
    expect(manifest.id).toBe('pipe-calc-plugin');
    expect(manifest.signature).toMatch(/^ed25519:[a-f0-9]+$/);

    const admission = admitPlugin(manifest, trustedRoots);
    expect(admission.admitted).toBe(true);
    expect(admission.record.keyTrusted).toBe(true);
    expect(admission.record.signatureValid).toBe(true);
    expect(admission.record.enabled).toBe(true);
    expect(admission.alerts.length).toBe(0);
  });

  it('refuses admission for an untrusted signing key', () => {
    const rogueKey = generateEd25519KeyPair();
    const rogueKeyId = 'untrusted-rogue-key';

    const { manifest } = createPipeCalcPlugin(rogueKeyId, rogueKey.privateKeyPem);
    const admission = admitPlugin(manifest, trustedRoots);

    expect(admission.admitted).toBe(false);
    expect(admission.record.keyTrusted).toBe(false);
    expect(admission.record.enabled).toBe(false);
    expect(admission.alerts.length).toBe(1);
    expect(admission.alerts[0]!.kind).toBe('key-untrusted');
  });

  it('refuses admission for a tampered manifest with corrupted signature', () => {
    const { manifest } = createPipeCalcPlugin(trustedKeyId, trustedOrgKey.privateKeyPem);

    // Corrupt signature
    const tamperedManifest = {
      ...manifest,
      signature: 'ed25519:' + '00'.repeat(32),
    };

    const admission = admitPlugin(tamperedManifest, trustedRoots);
    expect(admission.admitted).toBe(false);
    expect(admission.record.signatureValid).toBe(false);
    expect(admission.record.enabled).toBe(false);
    expect(admission.alerts.length).toBe(1);
    expect(admission.alerts[0]!.kind).toBe('signature-invalid');
  });

  it('executes first-party pipe calc tool within PluginHost and validates schema outputs', async () => {
    const { manifest, handlers } = createPipeCalcPlugin(trustedKeyId, trustedOrgKey.privateKeyPem);
    const admission = admitPlugin(manifest, trustedRoots);

    const host = new PluginHost();
    host.registerPlugin(admission.record, handlers);

    const input: PipePressureDropInput = {
      length: { value: 120, unit: 'm' },
      diameter: { value: 0.154, unit: 'm' }, // 6-inch pipe
      roughness: { value: 0.000045, unit: 'm' }, // commercial steel
      flow: { value: 180, unit: 'm**3/h' },
    };

    const result = (await host.executeTool(
      'pipe-calc-plugin',
      'calculate_pressure_drop',
      input,
    )) as {
      tool: string;
      correlation: string;
      result: { value: number; unit: string };
      steps: Array<{ ordinal: number; description: string; result?: { value: number; unit: string } }>;
    };

    expect(result.tool).toBe('pipe-pressure-drop');
    expect(result.correlation).toBe('Darcy-Weisbach / Swamee-Jain');
    expect(result.result.value).toBeGreaterThan(0);
    expect(result.result.unit).toBe('bar');
    expect(result.steps.length).toBe(5);
  });

  it('refuses execution if plugin is disabled', async () => {
    const { manifest, handlers } = createPipeCalcPlugin(trustedKeyId, trustedOrgKey.privateKeyPem);
    const admission = admitPlugin(manifest, trustedRoots);

    const host = new PluginHost();
    host.registerPlugin(admission.record, handlers);
    host.setEnabled('pipe-calc-plugin', false);

    const input: PipePressureDropInput = {
      length: { value: 50, unit: 'm' },
      diameter: { value: 0.1, unit: 'm' },
      roughness: { value: 0.000045, unit: 'm' },
      flow: { value: 50, unit: 'm**3/h' },
    };

    await expect(
      host.executeTool('pipe-calc-plugin', 'calculate_pressure_drop', input),
    ).rejects.toThrow('Plugin is disabled');
  });
});
