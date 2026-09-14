import type { AuditEvent, ChainAnchor } from '@outskirts/schemas';
import { AuditChain } from './chain.js';
import { generateEd25519KeyPair, type Ed25519KeyPair } from './crypto.js';

export interface SyntheticChainResult {
  chain: AuditChain;
  events: readonly AuditEvent[];
  anchors: readonly ChainAnchor[];
  keyPair: Ed25519KeyPair;
  keyId: string;
}

export interface SyntheticChainOptions {
  eventCount?: number;
  anchorInterval?: number;
  keyId?: string;
  keyPair?: Ed25519KeyPair;
  taskPrefix?: string;
}

/**
 * Generate a synthetic audit chain with realistic events and periodic signed anchors.
 * Designed for benchmarking, CI verification, and tampering detection suites.
 */
export function generateSyntheticChain(
  options?: SyntheticChainOptions,
): SyntheticChainResult {
  const count = options?.eventCount ?? 1000;
  const interval = options?.anchorInterval ?? 500;
  const keyId = options?.keyId ?? 'tpm-key-primary-01';
  const keyPair = options?.keyPair ?? generateEd25519KeyPair();
  const taskPrefix = options?.taskPrefix ?? 'task-synth';

  const chain = new AuditChain();
  const kinds = [
    'pal.call',
    'tool.call',
    'file.op',
    'guard.alert',
    'mode.transition',
    'artifact.sign',
  ] as const;

  for (let i = 1; i <= count; i++) {
    const kind = kinds[(i - 1) % kinds.length]!;
    const taskId = `${taskPrefix}-${Math.floor((i - 1) / 100) + 1}`;
    const stepId = `step-${((i - 1) % 10) + 1}`;

    const payload: Record<string, unknown> = {
      index: i,
      category: 'synthetic-benchmark',
      details: {
        action: `simulated-${kind}`,
        param: i * 42,
        mode: i % 2 === 0 ? 'SOVEREIGN' : 'ASSIST',
        locality: 'loopback',
      },
    };

    chain.append(kind, payload, {
      taskId,
      stepId,
      actorId: 'system-agent',
      eventId: `evt-synth-${i}`,
      // Deterministic synthetic timestamps 1 second apart
      ts: new Date(1773388800000 + i * 1000).toISOString(),
    });

    // Anchor at interval boundaries
    if (i % interval === 0) {
      chain.createAnchor(keyId, keyPair.privateKeyPem, {
        anchorId: `anchor-synth-${Math.floor(i / interval)}`,
        signedAt: new Date(1773388800000 + i * 1000).toISOString(),
      });
    }
  }

  // Anchor any trailing events if count is not a multiple of interval
  if (count % interval !== 0) {
    const anchorNum = Math.floor(count / interval) + 1;
    chain.createAnchor(keyId, keyPair.privateKeyPem, {
      anchorId: `anchor-synth-${anchorNum}`,
      signedAt: new Date(1773388800000 + count * 1000).toISOString(),
    });
  }

  return {
    chain,
    events: chain.getEvents(),
    anchors: chain.getAnchors(),
    keyPair,
    keyId,
  };
}
