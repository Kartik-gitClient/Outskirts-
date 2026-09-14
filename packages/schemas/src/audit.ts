import { z } from 'zod';
import { Id, Iso8601, Seq, Sha256 } from './common.js';

/**
 * Audit chain and Decision DNA.
 *
 * A prev-hash chain detects modification but not truncation -- lop off the last
 * forty events and it still verifies. And an unsigned chain stored in the same
 * database the application writes to is tamper-evident only against attackers
 * who cannot reach the database. Both holes are closed here.
 */

export const AuditEventKind = z.enum([
  'pal.call',
  'tool.call',
  'file.op',
  'plugin.install',
  'plugin.enable',
  'guard.alert',
  'mode.transition',
  'rbac.refusal',
  'chain.verify',
  'human.override',
  'artifact.sign',
]);

export const AuditEvent = z.object({
  eventId: Id,
  seq: Seq,
  ts: Iso8601,
  kind: AuditEventKind,
  taskId: Id.optional(),
  stepId: Id.optional(),
  actorId: Id.optional(),
  /** Hash of the previous event in the chain. */
  prevHash: Sha256,
  /** Hash of this event's canonical payload. */
  payloadHash: Sha256,
  payload: z.record(z.string(), z.unknown()),
});

export const ChainAnchor = z.object({
  anchorId: Id,
  seqLow: Seq,
  seqHigh: Seq,
  /** Makes truncation of the tail detectable, which prevHash alone does not. */
  eventCount: z.number().int().nonnegative(),
  merkleRoot: Sha256,
  prevAnchorHash: Sha256,
  /** Chains the signatures, not merely the hashes. */
  prevAnchorSignature: z.string(),
  /** Ed25519 over the anchor body. Key lives in the OS keystore / TPM, outside the DB. */
  signature: z.string(),
  keyId: z.string().min(1),
  signedAt: Iso8601,
});

export const ChainVerifyResult = z.object({
  valid: z.boolean(),
  eventsWalked: z.number().int().nonnegative(),
  anchorsVerified: z.number().int().nonnegative(),
  brokenAtSeq: Seq.optional(),
  reason: z
    .enum(['hash-mismatch', 'signature-invalid', 'count-mismatch', 'anchor-gap', 'untrusted-key'])
    .optional(),
  checkedAt: Iso8601,
});

/**
 * The task-level projection of the chain.
 *
 * Expressed so that it maps onto in-toto's attestation model: the plan is a
 * layout, each step record is link metadata, and verification walks the same
 * chain. That means an auditor validates provenance with standard tooling
 * rather than a verifier we wrote and only we trust.
 */
export const DecisionDna = z.object({
  dnaId: Id,
  taskId: Id,
  goal: z.string(),
  recipeId: Id.optional(),
  modeAtLaunch: z.enum(['SOVEREIGN', 'ASSIST']),
  planHash: Sha256,
  steps: z.array(
    z.object({
      stepId: Id,
      kind: z.string(),
      model: z.string(),
      modelDigest: z.string(),
      providerId: z.string(),
      locality: z.string(),
      trustBoundary: z.string(),
      promptTemplateHash: z.string(),
      seed: z.number().int().nullable(),
      toolCalls: z.array(z.object({ tool: z.string(), inputHash: Sha256, outputHash: Sha256 })),
    }),
  ),
  citations: z.array(
    z.object({ citationId: Id, documentId: Id, decayAtCitation: z.number(), stateAtCitation: z.string() }),
  ),
  criticGate: z.enum(['pass', 'fail']),
  deterministicPass: z.boolean(),
  overrides: z.array(z.object({ actorId: Id, at: Iso8601, note: z.string() })).default([]),
  artifactHashes: z.array(Sha256),
  c2paManifestRef: z.string().optional(),
  chainSeqLow: Seq,
  chainSeqHigh: Seq,
});

export type AuditEventKind = z.infer<typeof AuditEventKind>;
export type AuditEvent = z.infer<typeof AuditEvent>;
export type ChainAnchor = z.infer<typeof ChainAnchor>;
export type ChainVerifyResult = z.infer<typeof ChainVerifyResult>;
export type DecisionDna = z.infer<typeof DecisionDna>;
