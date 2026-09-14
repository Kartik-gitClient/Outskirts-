import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OFFLINE_BUNDLE_MANIFEST,
  verifyOfflineBundle,
} from '../../../installer/bundle.js';

describe('Offline Installer Bundle & Disconnected Packaging (Section 18 P5)', () => {
  it('validates default offline bundle manifest for 100% disconnected sovereignty', () => {
    const res = verifyOfflineBundle(DEFAULT_OFFLINE_BUNDLE_MANIFEST);
    expect(res.valid).toBe(true);
    expect(res.offlineIntegrityVerified).toBe(true);
    expect(res.totalWeights).toBe(3);
    expect(res.totalContainers).toBe(3);
    expect(res.platformsSupported).toEqual(['linux-x64', 'windows-x64', 'darwin-arm64']);
    expect(res.diagnostics.length).toBe(0);
  });

  it('rejects bundle manifests missing target platform coverage', () => {
    const incomplete = {
      ...DEFAULT_OFFLINE_BUNDLE_MANIFEST,
      targetPlatforms: ['linux-x64' as const],
    };
    const res = verifyOfflineBundle(incomplete);
    expect(res.valid).toBe(false);
    expect(res.diagnostics).toContain(
      'Must support all 3 target platforms (linux-x64, windows-x64, darwin-arm64)',
    );
  });

  it('rejects bundle manifests with invalid container image digests', () => {
    const invalidDigest = {
      ...DEFAULT_OFFLINE_BUNDLE_MANIFEST,
      containerImages: [
        {
          imageName: 'mongo',
          tag: '8',
          digest: 'invalid-non-sha256',
          platform: 'linux/amd64' as const,
        },
      ],
    };
    const res = verifyOfflineBundle(invalidDigest);
    expect(res.valid).toBe(false);
    expect(res.diagnostics[0]).toMatch(/Invalid container image digest/);
  });

  it('rejects bundle manifests with zero model weights', () => {
    const noWeights = {
      ...DEFAULT_OFFLINE_BUNDLE_MANIFEST,
      modelWeights: [],
    };
    const res = verifyOfflineBundle(noWeights);
    expect(res.valid).toBe(false);
    expect(res.diagnostics).toContain('Missing model weights in offline manifest');
  });
});

