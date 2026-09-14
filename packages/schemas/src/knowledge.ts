import { z } from 'zod';
import { Id, Iso8601, Sha256 } from './common.js';

/**
 * Knowledge layer contracts, including the Freshness Engine.
 *
 * The engine is class-aware because the single largest conceptual error in the
 * v1.0 design was treating every document as decaying. An SOP decays. An
 * inspection report from 2019 is a record -- it is not stale, it is history,
 * and penalising it makes the workbench distrust its own primary evidence.
 */

export const DocumentClass = z.enum([
  /** SOP, standard, policy, work instruction. Full decay. */
  'GOVERNING',
  /** Inspection report, test certificate, minutes. Never decays. */
  'RECORD',
  /** Datasheet, as-issued drawing, vendor manual. Slow decay, caps at AGING. */
  'REFERENCE',
  /** No review-cycle metadata -- the common real case. Reduced weight, flagged. */
  'UNVERIFIED',
]);

export const FreshnessState = z.enum([
  'FRESH',
  'AGING',
  'STALE',
  'CRITICAL',
  'RECORD',
  'UNVERIFIED',
]);

/**
 * Decay coefficients per class: [progressWeight, overdueWeight].
 *
 * Tuned so that a document sitting exactly on its review date scores 0.70 --
 * AGING, not STALE. The v1.0 curve scored that case at 0.40, meaning a
 * document doing precisely what it was supposed to do fired warning banners.
 */
export const DECAY_COEFFICIENTS: Record<string, readonly [number, number]> = {
  GOVERNING: [0.3, 0.35],
  REFERENCE: [0.15, 0.2],
  RECORD: [0, 0],
  UNVERIFIED: [0, 0],
} as const;

export const FRESHNESS_THRESHOLDS = {
  FRESH: 0.75,
  AGING: 0.5,
  STALE: 0.25,
} as const;

/** Retrieval weight multiplier per state. CRITICAL is reduced, never excluded. */
export const RETRIEVAL_WEIGHT: Record<string, number> = {
  FRESH: 1.0,
  AGING: 1.0, // scaled by score at query time
  STALE: 1.0, // scaled by score at query time
  CRITICAL: 0.25,
  RECORD: 1.0,
  UNVERIFIED: 0.6,
} as const;

export const FreshnessSpine = z.object({
  fingerprint: Sha256.describe('SHA-256 of extracted text'),
  documentClass: DocumentClass,
  classificationSource: z.enum(['metadata', 'classifier', 'human']).default('classifier'),
  author: z.string().optional(),
  revision: z.string().optional(),
  effectiveDate: Iso8601.optional(),
  reviewIntervalDays: z.number().int().positive().optional(),
  nextReview: Iso8601.optional(),
  owner: z.string().optional(),
  /** Set for RECORD class: the point in time the record attests to. */
  asOfDate: Iso8601.optional(),
  supersededBy: Id.optional(),
  decay: z.number().min(0).max(1),
  state: FreshnessState,
});

export const DocumentRecord = z.object({
  documentId: Id,
  projectId: Id,
  filename: z.string(),
  mimeType: z.string(),
  sourcePath: z.string(),
  ingestedAt: Iso8601,
  freshness: FreshnessSpine,
  pageCount: z.number().int().nonnegative().optional(),
  extractionEngine: z.string().optional().describe('e.g. paddleocr-vl-1.6, docling-2.x'),
});

export const Chunk = z.object({
  chunkId: Id,
  documentId: Id,
  projectId: Id,
  text: z.string(),
  ordinal: z.number().int().nonnegative(),
  pageFrom: z.number().int().positive().optional(),
  pageTo: z.number().int().positive().optional(),
  /**
   * Recorded per chunk, and queries across a mismatched id are refused.
   *
   * Without this, swapping embedding models silently corrupts ranking rather
   * than failing -- vectors from one model are meaningless to queries from
   * another, and nothing about the output looks wrong.
   */
  embeddingModelId: z.string().min(1),
  dim: z.number().int().positive(),
});

/**
 * A citation carries the freshness state it had at citation time, not at read
 * time. That is what makes a Decision DNA record answerable months later.
 */
export const Citation = z.object({
  citationId: Id,
  chunkId: Id,
  documentId: Id,
  quote: z.string(),
  decayAtCitation: z.number().min(0).max(1),
  stateAtCitation: FreshnessState,
  acknowledgedBy: Id.optional().describe('Required when stateAtCitation is CRITICAL'),
  acknowledgedAt: Iso8601.optional(),
  /** Region on the source page, so the UI can highlight what was actually read. */
  bbox: z
    .object({ page: z.number().int().positive(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .optional(),
});

export type DocumentClass = z.infer<typeof DocumentClass>;
export type FreshnessState = z.infer<typeof FreshnessState>;
export type FreshnessSpine = z.infer<typeof FreshnessSpine>;
export type DocumentRecord = z.infer<typeof DocumentRecord>;
export type Chunk = z.infer<typeof Chunk>;
export type Citation = z.infer<typeof Citation>;
