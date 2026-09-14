import { randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import {
  AuditEvent,
  ChainAnchor,
  type AuditEventKind,
  type Id,
  type Seq,
} from '@outskirts/schemas';
import {
  hashPayload,
  hashEvent,
  hashAnchorBody,
  canonicalJsonStringify,
} from './canonical.js';
import { computeMerkleRoot, ZERO_HASH } from './merkle.js';
import { signEd25519 } from './crypto.js';

export interface AppendMeta {
  taskId?: Id;
  stepId?: Id;
  actorId?: Id;
  ts?: string;
  eventId?: Id;
}

export interface CreateAnchorOptions {
  anchorId?: Id;
  signedAt?: string;
}

export class AuditChain {
  private events: AuditEvent[] = [];
  private anchors: ChainAnchor[] = [];
  private lastAnchoredSeq: number = 0;

  /**
   * Append an event to the audit chain.
   * Monotonically increases sequence, computes canonical payload hash,
   * and links prevHash to the previous event in the chain.
   */
  public append(
    kind: AuditEventKind,
    payload: Record<string, unknown>,
    meta?: AppendMeta,
  ): AuditEvent {
    const seq: Seq = this.events.length + 1;
    const eventId: Id = meta?.eventId ?? `evt-${seq}-${randomUUID().slice(0, 8)}`;
    const ts = meta?.ts ?? new Date().toISOString();
    const payloadHash = hashPayload(payload);

    let prevHash: string;
    if (this.events.length === 0) {
      prevHash = ZERO_HASH;
    } else {
      prevHash = hashEvent(this.events[this.events.length - 1]!);
    }

    const eventCandidate = {
      eventId,
      seq,
      ts,
      kind,
      taskId: meta?.taskId,
      stepId: meta?.stepId,
      actorId: meta?.actorId,
      prevHash,
      payloadHash,
      payload,
    };

    const validated = AuditEvent.parse(eventCandidate);
    this.events.push(validated);
    return validated;
  }

  /**
   * Create and sign a ChainAnchor covering all unanchored events up to the current tail.
   * Signs the anchor using Ed25519 and chains to the previous anchor.
   */
  public createAnchor(
    keyId: string,
    privateKey: string | KeyObject,
    options?: CreateAnchorOptions,
  ): ChainAnchor {
    const seqLow: Seq = this.lastAnchoredSeq + 1;
    const seqHigh: Seq = this.events.length;

    if (seqLow > seqHigh) {
      throw new Error('No unanchored events available to anchor');
    }

    const unanchoredEvents = this.events.slice(seqLow - 1, seqHigh);
    const eventCount = unanchoredEvents.length;
    const eventHashes = unanchoredEvents.map((e) => hashEvent(e));
    const merkleRoot = computeMerkleRoot(eventHashes);

    let prevAnchorHash = ZERO_HASH;
    let prevAnchorSignature = '';

    if (this.anchors.length > 0) {
      const lastAnchor = this.anchors[this.anchors.length - 1]!;
      prevAnchorHash = hashAnchorBody(lastAnchor);
      prevAnchorSignature = lastAnchor.signature;
    }

    const anchorId: Id = options?.anchorId ?? `anchor-${this.anchors.length + 1}-${randomUUID().slice(0, 8)}`;
    const signedAt = options?.signedAt ?? new Date().toISOString();

    const anchorBody = {
      anchorId,
      seqLow,
      seqHigh,
      eventCount,
      merkleRoot,
      prevAnchorHash,
      prevAnchorSignature,
      keyId,
      signedAt,
    };

    // Ed25519 signature over the canonical JSON representation of the anchor body
    const bodyCanonical = canonicalJsonStringify(anchorBody);
    const signature = signEd25519(bodyCanonical, privateKey);

    const anchor = ChainAnchor.parse({
      ...anchorBody,
      signature,
    });

    this.anchors.push(anchor);
    this.lastAnchoredSeq = seqHigh;
    return anchor;
  }

  public getEvents(): readonly AuditEvent[] {
    return this.events;
  }

  public getAnchors(): readonly ChainAnchor[] {
    return this.anchors;
  }

  public getTailEvent(): AuditEvent | undefined {
    return this.events[this.events.length - 1];
  }

  public getTailAnchor(): ChainAnchor | undefined {
    return this.anchors[this.anchors.length - 1];
  }
}
