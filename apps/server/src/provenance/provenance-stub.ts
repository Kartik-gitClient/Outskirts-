/**
 * Provenance manifest stub.
 *
 * This module generates a signed provenance record structurally modeled
 * on C2PA, but it does NOT use the official c2pa-rs / c2patool library
 * and therefore cannot be verified by standard C2PA-conformant readers.
 *
 * STATUS: STUB — pending integration of c2patool CLI or c2pa-rs native
 * bindings for standard-compliant JUMBF manifest generation.
 */
import { randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import {
  canonicalJsonStringify,
  sha256Hex,
  signEd25519,
  verifyEd25519,
} from '@outskirts/sovereignty';

export interface C2paManifest {
  manifestId: string;
  claimGenerator: string;
  title: string;
  format: string;
  instanceId: string;
  claim: {
    format: string;
    targetHash: string; // Hard binding to the deliverable artifact content hash
    assertions: Array<{
      label: string;
      data: Record<string, unknown>;
    }>;
  };
  signature: {
    keyId: string;
    algorithm: 'ed25519';
    sigHex: string;
    signedAt: string;
  };
}

export interface CreateC2paOptions {
  manifestId?: string;
  title: string;
  format: string;
  targetContent: string | Uint8Array;
  dnaId: string;
  planHash: string;
  authorId: string;
  keyId: string;
  privateKey: string | KeyObject;
  signedAt?: string;
}

/**
 * Generate a C2PA-conformant provenance manifest with hard binding to the content hash,
 * CAWG identity assertions, and Decision DNA lineage links.
 */
export function generateC2paManifest(options: CreateC2paOptions): C2paManifest {
  const manifestId = options.manifestId ?? `urn:c2pa:${randomUUID()}`;
  const instanceId = `urn:uuid:${randomUUID()}`;
  const signedAt = options.signedAt ?? new Date().toISOString();
  const targetHash = sha256Hex(options.targetContent);

  const claim = {
    format: options.format,
    targetHash,
    assertions: [
      {
        label: 'c2pa.actions',
        data: {
          actions: [
            {
              action: 'c2pa.created',
              when: signedAt,
              softwareAgent: 'Outskirts Sovereign AI Workbench v0.1.0',
            },
          ],
        },
      },
      {
        label: 'cawg.identity',
        data: {
          producingSystem: 'Outskirts Control Plane',
          actorId: options.authorId,
          boundary: 'inside-perimeter',
        },
      },
      {
        label: 'outskirts.decision_dna',
        data: {
          dnaId: options.dnaId,
          planHash: options.planHash,
        },
      },
    ],
  };

  const claimCanonical = canonicalJsonStringify(claim);
  const sigHex = signEd25519(claimCanonical, options.privateKey);

  return {
    manifestId,
    claimGenerator: 'Outskirts Sovereign AI Workbench v0.1.0 (provenance stub — pending c2pa-rs integration)',
    title: options.title,
    format: options.format,
    instanceId,
    claim,
    signature: {
      keyId: options.keyId,
      algorithm: 'ed25519',
      sigHex,
      signedAt,
    },
  };
}

/**
 * Verify a C2PA manifest's signature and hard binding against deliverable content.
 */
export function verifyC2paManifest(
  manifest: C2paManifest,
  content: string | Uint8Array,
  publicKey: string | KeyObject,
): { valid: boolean; reason?: string } {
  // 1. Verify hard content hash binding
  const computedHash = sha256Hex(content);
  if (computedHash !== manifest.claim.targetHash) {
    return {
      valid: false,
      reason: `Content hash mismatch: expected ${manifest.claim.targetHash}, got ${computedHash}`,
    };
  }

  // 2. Verify signature
  const claimCanonical = canonicalJsonStringify(manifest.claim);
  const sigValid = verifyEd25519(claimCanonical, manifest.signature.sigHex, publicKey);
  if (!sigValid) {
    return { valid: false, reason: 'Invalid Ed25519 manifest signature' };
  }

  return { valid: true };
}
