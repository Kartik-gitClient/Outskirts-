import { createHash } from 'node:crypto';
import type { AuditEvent, ChainAnchor } from '@outskirts/schemas';

/**
 * Deterministically stringify any JSON value with sorted keys.
 * Ensures identical cryptographic hashes across platforms and runtimes.
 */
export function canonicalJsonStringify(val: unknown): string {
  if (val === null || val === undefined) {
    return 'null';
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return JSON.stringify(val);
  }
  if (typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val as Record<string, unknown>).sort();
    const pairs = keys.map(
      (k) => `${JSON.stringify(k)}:${canonicalJsonStringify((val as Record<string, unknown>)[k])}`,
    );
    return '{' + pairs.join(',') + '}';
  }
  return JSON.stringify(val);
}

/**
 * Compute SHA-256 lowercase hex digest.
 */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute SHA-256 hash of canonicalized event payload.
 */
export function hashPayload(payload: Record<string, unknown>): string {
  return sha256Hex(canonicalJsonStringify(payload));
}

/**
 * Compute SHA-256 hash of an AuditEvent envelope.
 * Used as prevHash for the subsequent event and leaf hash in Merkle trees.
 */
export function hashEvent(event: AuditEvent): string {
  const envelope = {
    eventId: event.eventId,
    seq: event.seq,
    ts: event.ts,
    kind: event.kind,
    taskId: event.taskId ?? null,
    stepId: event.stepId ?? null,
    actorId: event.actorId ?? null,
    prevHash: event.prevHash,
    payloadHash: event.payloadHash,
  };
  return sha256Hex(canonicalJsonStringify(envelope));
}

/**
 * Compute SHA-256 hash of anchor body (excluding the signature itself).
 */
export function hashAnchorBody(anchor: Omit<ChainAnchor, 'signature'>): string {
  const body = {
    anchorId: anchor.anchorId,
    seqLow: anchor.seqLow,
    seqHigh: anchor.seqHigh,
    eventCount: anchor.eventCount,
    merkleRoot: anchor.merkleRoot,
    prevAnchorHash: anchor.prevAnchorHash,
    prevAnchorSignature: anchor.prevAnchorSignature,
    keyId: anchor.keyId,
    signedAt: anchor.signedAt,
  };
  return sha256Hex(canonicalJsonStringify(body));
}
