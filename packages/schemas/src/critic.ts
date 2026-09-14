import { z } from 'zod';
import { Id } from './common.js';

/**
 * Critic contracts.
 *
 * Five of the six checks are deterministic code. Only C6 is a prompt, and it is
 * advisory. This split is what makes the catch rate defensible: a 7B model
 * critiquing a 7B model is the weakest possible verifier for exactly the two
 * error classes -- hallucinated figures and unsupported citations -- that do
 * the most damage in an approval note.
 */

export const CriticCheck = z.enum([
  /** Every number+unit in the draft matches a value in a source or calc transcript */
  'C1_NUMERIC_GROUNDING',
  /** Every calc call re-executed and compared; units checked; formula verified */
  'C2_CALCULATION_REPLAY',
  /** Every citation resolves to a chunk in this task's retrieval set */
  'C3_CITATION_RESOLVABILITY',
  /** All required template fields present; all plan steps represented */
  'C4_TEMPLATE_COMPLETENESS',
  /** No CRITICAL citation without recorded reviewer acknowledgement */
  'C5_FRESHNESS_POLICY',
  /** LLM coherence and completeness verdict -- advisory only */
  'C6_COHERENCE',
]);

export const ClaimVerdict = z.object({
  claimId: Id,
  check: CriticCheck,
  pass: z.boolean(),
  /** The offending token, quoted, when a check fails. Vague failures are useless. */
  offending: z.string().optional(),
  note: z.string().optional(),
  evidenceRef: z.string().optional().describe('chunkId or calc transcript id backing this'),
});

export const CriticVerdict = z.object({
  taskId: Id,
  stepId: Id,
  /** Gate = all of C1..C5 pass AND C6 is not a hard fail. */
  gate: z.enum(['pass', 'fail']),
  /**
   * Reported separately from the LLM-dependent figure, always.
   * Merging them into one headline number would be dishonest about which part
   * of the catch rate is mechanism and which part is judgement.
   */
  deterministicPass: z.boolean(),
  verdicts: z.array(ClaimVerdict),
  repairTarget: Id.optional().describe('Failing step to retry, with its downstream'),
  repairsUsed: z.number().int().nonnegative().default(0),
  escalated: z.boolean().default(false).describe('Budget exhausted; routed to review queue'),
});

export type CriticCheck = z.infer<typeof CriticCheck>;
export type ClaimVerdict = z.infer<typeof ClaimVerdict>;
export type CriticVerdict = z.infer<typeof CriticVerdict>;
