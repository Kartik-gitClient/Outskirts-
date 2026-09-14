import {
  DECAY_COEFFICIENTS,
  FRESHNESS_THRESHOLDS,
  RETRIEVAL_WEIGHT,
  type DocumentClass,
  type FreshnessSpine,
  type FreshnessState,
} from '@outskirts/schemas';

/**
 * The Freshness Engine.
 *
 * Industrial knowledge decays on review cycles that the documents themselves
 * declare -- but only some documents. The engine is class-aware because the
 * single largest conceptual error available here is treating every document as
 * decaying: an SOP decays, while an inspection report from 2019 is a record.
 * It is not stale, it is history, and penalising it would make the workbench
 * distrust its own primary evidence.
 *
 * Nothing in this module reaches the network, the database or a model. It is a
 * pure function of a metadata spine and a clock, which is what lets the state
 * table below serve as the specification.
 */

const MS_PER_DAY = 86_400_000;

export interface FreshnessResult {
  decay: number;
  state: FreshnessState;
  /** Multiplier applied to a candidate's relevance score at retrieval time. */
  retrievalWeight: number;
  /** True when a reviewer must explicitly acknowledge before the gate can pass. */
  requiresAcknowledgement: boolean;
  /** Populated when the class or metadata forced the outcome, for the UI to explain. */
  reason?: string;
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Map a decay score to a state.
 *
 * Boundaries are inclusive at the lower end: 0.75 is FRESH, 0.50 is AGING,
 * 0.25 is STALE. The test suite pins every boundary explicitly, because an
 * off-by-one here silently changes which documents warn.
 */
export function stateForDecay(decay: number): FreshnessState {
  if (decay >= FRESHNESS_THRESHOLDS.FRESH) return 'FRESH';
  if (decay >= FRESHNESS_THRESHOLDS.AGING) return 'AGING';
  if (decay >= FRESHNESS_THRESHOLDS.STALE) return 'STALE';
  return 'CRITICAL';
}

/** A REFERENCE document cannot fall past AGING on age alone -- only supersession does that. */
function capReference(state: FreshnessState, superseded: boolean): FreshnessState {
  if (superseded) return state === 'CRITICAL' ? 'STALE' : state;
  return state === 'STALE' || state === 'CRITICAL' ? 'AGING' : state;
}

export function retrievalWeightFor(state: FreshnessState, decay: number): number {
  switch (state) {
    // Weighted by their own score, so a fresh SOP outranks an equally relevant aging one.
    case 'AGING':
    case 'STALE':
      return decay;
    default:
      return RETRIEVAL_WEIGHT[state] ?? 1;
  }
}

/**
 * CRITICAL sources stay retrievable and force a human decision instead.
 *
 * Excluding them -- the original design -- means the system answers from
 * nothing, or from a superseded document that happens to score better. An SOP
 * two review cycles overdue is still the governing procedure, and the safe
 * behaviour is to put it in front of a reviewer, not to hide it.
 */
export function requiresAcknowledgement(state: FreshnessState): boolean {
  return state === 'CRITICAL';
}

export interface ComputeInput {
  documentClass: DocumentClass;
  effectiveDate?: string | Date;
  reviewIntervalDays?: number;
  nextReview?: string | Date;
  supersededBy?: string;
}

/**
 * Compute decay and state for a document.
 *
 *   p = min(daysSince(effectiveDate) / reviewIntervalDays, 1)
 *   o = max(0, daysSince(nextReview) / reviewIntervalDays)
 *   decay = clamp(1 - wp*p - wo*o, 0, 1)
 *
 * `p` is capped deliberately: being deep into a review cycle is not the same
 * as being overdue, and letting p run past 1 would double-count the overdue
 * period once `o` starts climbing.
 */
export function computeFreshness(input: ComputeInput, now: Date = new Date()): FreshnessResult {
  const { documentClass, supersededBy } = input;

  if (documentClass === 'RECORD') {
    return {
      decay: 1,
      state: 'RECORD',
      retrievalWeight: RETRIEVAL_WEIGHT['RECORD'] ?? 1,
      requiresAcknowledgement: false,
      reason: 'Point-in-time record; records do not decay',
    };
  }

  const effective = input.effectiveDate ? new Date(input.effectiveDate) : undefined;
  const interval = input.reviewIntervalDays;

  // The common real case: a document with no declared review cycle. Retrievable
  // at reduced weight and flagged, never silently treated as fresh.
  if (!effective || Number.isNaN(effective.getTime()) || !interval || interval <= 0) {
    return {
      decay: RETRIEVAL_WEIGHT['UNVERIFIED'] ?? 0.6,
      state: 'UNVERIFIED',
      retrievalWeight: RETRIEVAL_WEIGHT['UNVERIFIED'] ?? 0.6,
      requiresAcknowledgement: false,
      reason: 'No review cycle declared; queued for classification',
    };
  }

  const nextReview = input.nextReview
    ? new Date(input.nextReview)
    : new Date(effective.getTime() + interval * MS_PER_DAY);

  const p = clamp(daysBetween(effective, now) / interval, 0, 1);
  const o = Math.max(0, daysBetween(nextReview, now) / interval);

  const coeffs = DECAY_COEFFICIENTS[documentClass] ?? DECAY_COEFFICIENTS['GOVERNING']!;
  const [wp, wo] = coeffs;
  const decay = clamp(1 - wp * p - wo * o, 0, 1);

  let state = stateForDecay(decay);
  let reason: string | undefined;

  if (documentClass === 'REFERENCE') {
    const capped = capReference(state, Boolean(supersededBy));
    if (capped !== state) {
      reason = supersededBy
        ? 'Reference document explicitly superseded'
        : 'Reference document; age alone caps at AGING';
      state = capped;
    }
  }

  return {
    decay,
    state,
    retrievalWeight: retrievalWeightFor(state, decay),
    requiresAcknowledgement: requiresAcknowledgement(state),
    ...(reason ? { reason } : {}),
  };
}

/** Convenience: build the persisted spine fields from a computed result. */
export function applyFreshness(
  spine: Omit<FreshnessSpine, 'decay' | 'state'>,
  now: Date = new Date(),
): FreshnessSpine {
  const result = computeFreshness(
    {
      documentClass: spine.documentClass,
      ...(spine.effectiveDate ? { effectiveDate: spine.effectiveDate } : {}),
      ...(spine.reviewIntervalDays ? { reviewIntervalDays: spine.reviewIntervalDays } : {}),
      ...(spine.nextReview ? { nextReview: spine.nextReview } : {}),
      ...(spine.supersededBy ? { supersededBy: spine.supersededBy } : {}),
    },
    now,
  );
  return { ...spine, decay: result.decay, state: result.state };
}
