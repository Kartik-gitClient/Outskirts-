import { randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import {
  GuardAlert,
  PluginRecord,
  type PluginManifest,
  type Seq,
} from '@outskirts/schemas';
import { canonicalJsonStringify, sha256Hex } from '@outskirts/sovereignty';
import { verifyManifestSignature } from './manifest.js';

export interface AdmissionOptions {
  installedAt?: string;
  roleGates?: Array<'junior' | 'senior' | 'admin'>;
  autoEnable?: boolean;
}

export interface AdmissionResult {
  record: PluginRecord;
  admitted: boolean;
  alerts: GuardAlert[];
}

/**
 * Perform admission control on a PluginManifest against the pinned trust root.
 */
export function admitPlugin(
  manifest: PluginManifest,
  trustedRoots: Map<string, string | KeyObject> | Record<string, string | KeyObject>,
  options?: AdmissionOptions,
): AdmissionResult {
  const alerts: GuardAlert[] = [];
  const installedAt = options?.installedAt ?? new Date().toISOString();
  let seq = 1;

  // 1. Check trust root allowlist
  const pubKey =
    trustedRoots instanceof Map
      ? trustedRoots.get(manifest.keyId)
      : trustedRoots[manifest.keyId];

  const keyTrusted = pubKey !== undefined;
  if (!keyTrusted) {
    alerts.push(
      GuardAlert.parse({
        alertId: `alert-${randomUUID().slice(0, 8)}`,
        seq: seq++ as Seq,
        ts: installedAt,
        kind: 'key-untrusted',
        pluginId: manifest.id,
        pluginVersion: manifest.version,
        detail: `Signing key "${manifest.keyId}" is not in the pinned trust root allowlist`,
      }),
    );
  }

  // 2. Check signature validity
  let signatureValid = false;
  if (keyTrusted && pubKey) {
    signatureValid = verifyManifestSignature(manifest, pubKey);
    if (!signatureValid) {
      alerts.push(
        GuardAlert.parse({
          alertId: `alert-${randomUUID().slice(0, 8)}`,
          seq: seq++ as Seq,
          ts: installedAt,
          kind: 'signature-invalid',
          pluginId: manifest.id,
          pluginVersion: manifest.version,
          detail: 'Manifest signature does not match manifest body',
        }),
      );
    }
  }

  const admitted = keyTrusted && signatureValid;
  const manifestHash = sha256Hex(canonicalJsonStringify(manifest));

  const record = PluginRecord.parse({
    manifest,
    installedAt,
    signatureValid,
    keyTrusted,
    enabled: admitted && (options?.autoEnable ?? true),
    roleGates: options?.roleGates ?? ['admin'],
    manifestHash,
  });

  return { record, admitted, alerts };
}
