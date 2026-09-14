import type { KeyObject } from 'node:crypto';
import {
  ChainVerifyResult,
  type AuditEvent,
  type ChainAnchor,
  type Seq,
} from '@outskirts/schemas';
import {
  hashPayload,
  hashEvent,
  hashAnchorBody,
  canonicalJsonStringify,
} from './canonical.js';
import { computeMerkleRoot, ZERO_HASH } from './merkle.js';
import { verifyEd25519 } from './crypto.js';

export type KeyLookup =
  | Map<string, string | KeyObject>
  | Record<string, string | KeyObject>
  | ((keyId: string) => (string | KeyObject) | undefined);

export interface VerifyChainOptions {
  checkedAt?: string;
  expectedEventCount?: number;
}

function resolveKey(
  lookup: KeyLookup,
  keyId: string,
): (string | KeyObject) | undefined {
  if (typeof lookup === 'function') {
    return lookup(keyId);
  }
  if (lookup instanceof Map) {
    return lookup.get(keyId);
  }
  return lookup[keyId];
}

/**
 * Verify an audit chain and its signed anchors.
 *
 * Checks:
 * 1. Monotonic event sequence starting at 1 with no gaps.
 * 2. Event payload hash integrity against canonical JSON representation.
 * 3. Event prevHash chaining from genesis ZERO_HASH to the tail.
 * 4. Anchor sequence continuity, event counts, and Merkle tree roots.
 * 5. Detection of tail truncation (events chopped after an anchor).
 * 6. Ed25519 anchor signatures verified against trusted keys.
 * 7. Cryptographic chaining of anchor hashes and signatures.
 */
export function verifyChain(
  events: readonly AuditEvent[],
  anchors: readonly ChainAnchor[],
  trustedKeys: KeyLookup,
  options?: VerifyChainOptions,
): ChainVerifyResult {
  const checkedAt = options?.checkedAt ?? new Date().toISOString();

  // 1. Walk events and verify sequential and cryptographic hash integrity
  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    const expectedSeq = i + 1;

    if (event.seq !== expectedSeq) {
      return ChainVerifyResult.parse({
        valid: false,
        eventsWalked: i,
        anchorsVerified: 0,
        brokenAtSeq: event.seq,
        reason: 'hash-mismatch',
        checkedAt,
      });
    }

    // Verify canonical payload hash
    const computedPayloadHash = hashPayload(event.payload);
    if (computedPayloadHash !== event.payloadHash) {
      return ChainVerifyResult.parse({
        valid: false,
        eventsWalked: i,
        anchorsVerified: 0,
        brokenAtSeq: event.seq,
        reason: 'hash-mismatch',
        checkedAt,
      });
    }

    // Verify prevHash
    if (i === 0) {
      if (event.prevHash !== ZERO_HASH) {
        return ChainVerifyResult.parse({
          valid: false,
          eventsWalked: 0,
          anchorsVerified: 0,
          brokenAtSeq: event.seq,
          reason: 'hash-mismatch',
          checkedAt,
        });
      }
    } else {
      const prevEvent = events[i - 1]!;
      const expectedPrevHash = hashEvent(prevEvent);
      if (event.prevHash !== expectedPrevHash) {
        return ChainVerifyResult.parse({
          valid: false,
          eventsWalked: i,
          anchorsVerified: 0,
          brokenAtSeq: event.seq,
          reason: 'hash-mismatch',
          checkedAt,
        });
      }
    }
  }

  // 2. Check expected event count if caller explicitly specified one
  if (
    options?.expectedEventCount !== undefined &&
    events.length !== options.expectedEventCount
  ) {
    return ChainVerifyResult.parse({
      valid: false,
      eventsWalked: events.length,
      anchorsVerified: 0,
      brokenAtSeq: (events.length + 1) as Seq,
      reason: 'count-mismatch',
      checkedAt,
    });
  }

  // 3. Walk and verify anchors
  for (let a = 0; a < anchors.length; a++) {
    const anchor = anchors[a]!;

    // A. Check trusted key
    const pubKey = resolveKey(trustedKeys, anchor.keyId);
    if (!pubKey) {
      return ChainVerifyResult.parse({
        valid: false,
        eventsWalked: events.length,
        anchorsVerified: a,
        brokenAtSeq: anchor.seqLow,
        reason: 'untrusted-key',
        checkedAt,
      });
    }

    // B. Check signature
    const anchorBody = {
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
    const bodyCanonical = canonicalJsonStringify(anchorBody);
    const signatureValid = verifyEd25519(bodyCanonical, anchor.signature, pubKey);
    if (!signatureValid) {
      return ChainVerifyResult.parse({
        valid: false,
        eventsWalked: events.length,
        anchorsVerified: a,
        brokenAtSeq: anchor.seqLow,
        reason: 'signature-invalid',
        checkedAt,
      });
    }

    // C. Check anchor chaining
    if (a === 0) {
      if (anchor.prevAnchorHash !== ZERO_HASH || anchor.prevAnchorSignature !== '') {
        return ChainVerifyResult.parse({
          valid: false,
          eventsWalked: events.length,
          anchorsVerified: a,
          brokenAtSeq: anchor.seqLow,
          reason: 'hash-mismatch',
          checkedAt,
        });
      }
    } else {
      const prevAnchor = anchors[a - 1]!;
      const expectedPrevAnchorHash = hashAnchorBody(prevAnchor);
      if (
        anchor.prevAnchorHash !== expectedPrevAnchorHash ||
        anchor.prevAnchorSignature !== prevAnchor.signature
      ) {
        return ChainVerifyResult.parse({
          valid: false,
          eventsWalked: events.length,
          anchorsVerified: a,
          brokenAtSeq: anchor.seqLow,
          reason: 'hash-mismatch',
          checkedAt,
        });
      }
    }

    // D. Check anchor sequence continuity
    if (a === 0) {
      if (anchor.seqLow !== 1) {
        return ChainVerifyResult.parse({
          valid: false,
          eventsWalked: events.length,
          anchorsVerified: a,
          brokenAtSeq: anchor.seqLow,
          reason: 'anchor-gap',
          checkedAt,
        });
      }
    } else {
      const prevAnchor = anchors[a - 1]!;
      if (anchor.seqLow !== prevAnchor.seqHigh + 1) {
        return ChainVerifyResult.parse({
          valid: false,
          eventsWalked: events.length,
          anchorsVerified: a,
          brokenAtSeq: anchor.seqLow,
          reason: 'anchor-gap',
          checkedAt,
        });
      }
    }

    // E. Check anchor event count consistency
    if (anchor.eventCount !== anchor.seqHigh - anchor.seqLow + 1) {
      return ChainVerifyResult.parse({
        valid: false,
        eventsWalked: events.length,
        anchorsVerified: a,
        brokenAtSeq: anchor.seqLow,
        reason: 'count-mismatch',
        checkedAt,
      });
    }

    // F. Check tail truncation: do events cover seqHigh?
    if (events.length < anchor.seqHigh) {
      return ChainVerifyResult.parse({
        valid: false,
        eventsWalked: events.length,
        anchorsVerified: a,
        brokenAtSeq: (events.length + 1) as Seq,
        reason: 'count-mismatch',
        checkedAt,
      });
    }

    // G. Verify Merkle root over the events in [seqLow, seqHigh]
    const coveredEvents = events.slice(anchor.seqLow - 1, anchor.seqHigh);
    const eventHashes = coveredEvents.map((e) => hashEvent(e));
    const computedMerkleRoot = computeMerkleRoot(eventHashes);

    if (computedMerkleRoot !== anchor.merkleRoot) {
      return ChainVerifyResult.parse({
        valid: false,
        eventsWalked: events.length,
        anchorsVerified: a,
        brokenAtSeq: anchor.seqLow,
        reason: 'hash-mismatch',
        checkedAt,
      });
    }
  }

  return ChainVerifyResult.parse({
    valid: true,
    eventsWalked: events.length,
    anchorsVerified: anchors.length,
    checkedAt,
  });
}
