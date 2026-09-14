import { describe, it, expect } from 'vitest';
import { computeFreshness, stateForDecay, retrievalWeightFor, requiresAcknowledgement } from '../src/freshness.js';

/**
 * The state table from the design is the specification, so it is the test.
 *
 * The v1.0 curve scored a document sitting exactly on its review date at 0.40 --
 * STALE -- meaning a document doing precisely what it was supposed to do fired
 * warning banners at the user. That single row is why these boundaries are
 * pinned explicitly rather than spot-checked.
 */

const DAY = 86_400_000;
const NOW = new Date('2026-09-12T00:00:00.000Z');

/** Build an effectiveDate/nextReview pair that yields the requested p and o. */
function at(p: number, o: number, intervalDays = 365) {
  const effective = new Date(NOW.getTime() - p * intervalDays * DAY);
  const nextReview = new Date(NOW.getTime() - o * intervalDays * DAY);
  return {
    effectiveDate: effective.toISOString(),
    nextReview: nextReview.toISOString(),
    reviewIntervalDays: intervalDays,
  };
}

describe('GOVERNING decay curve', () => {
  const cases: Array<[string, number, number, number, string]> = [
    // label                          p     o     decay  state
    ['newly effective', 0, 0, 1.0, 'FRESH'],
    ['half-way through cycle', 0.5, 0, 0.85, 'FRESH'],
    ['exactly at the review date', 1.0, 0, 0.7, 'AGING'],
    ['half an interval overdue', 1.0, 0.5, 0.525, 'AGING'],
    ['one full interval overdue', 1.0, 1.0, 0.35, 'STALE'],
    ['two intervals overdue', 1.0, 2.0, 0.0, 'CRITICAL'],
  ];

  for (const [label, p, o, expectedDecay, expectedState] of cases) {
    it(`${label}: p=${p} o=${o} -> ${expectedDecay} ${expectedState}`, () => {
      const r = computeFreshness({ documentClass: 'GOVERNING', ...at(p, o) }, NOW);
      expect(r.decay).toBeCloseTo(expectedDecay, 5);
      expect(r.state).toBe(expectedState);
    });
  }

  it('a document on schedule is AGING, never STALE (the v1.0 regression)', () => {
    const r = computeFreshness({ documentClass: 'GOVERNING', ...at(1.0, 0) }, NOW);
    expect(r.state).toBe('AGING');
    expect(r.decay).toBeGreaterThan(0.5);
  });

  it('caps progress so the overdue term is not double-counted', () => {
    // p would be 3.0 uncapped; capped at 1.0 it must equal the p=1 case.
    const capped = computeFreshness({ documentClass: 'GOVERNING', ...at(3.0, 0) }, NOW);
    const atReview = computeFreshness({ documentClass: 'GOVERNING', ...at(1.0, 0) }, NOW);
    expect(capped.decay).toBeCloseTo(atReview.decay, 5);
  });

  it('never leaves the [0,1] interval however overdue', () => {
    const r = computeFreshness({ documentClass: 'GOVERNING', ...at(1, 99) }, NOW);
    expect(r.decay).toBe(0);
    expect(r.state).toBe('CRITICAL');
  });
});

describe('state boundaries', () => {
  it('pins each threshold at its inclusive lower edge', () => {
    expect(stateForDecay(1.0)).toBe('FRESH');
    expect(stateForDecay(0.75)).toBe('FRESH');
    expect(stateForDecay(0.7499)).toBe('AGING');
    expect(stateForDecay(0.5)).toBe('AGING');
    expect(stateForDecay(0.4999)).toBe('STALE');
    expect(stateForDecay(0.25)).toBe('STALE');
    expect(stateForDecay(0.2499)).toBe('CRITICAL');
    expect(stateForDecay(0)).toBe('CRITICAL');
  });
});

describe('RECORD class', () => {
  it('never decays, however old', () => {
    const r = computeFreshness(
      { documentClass: 'RECORD', ...at(1, 12), effectiveDate: '2009-01-01T00:00:00.000Z' },
      NOW,
    );
    expect(r.decay).toBe(1);
    expect(r.state).toBe('RECORD');
    expect(r.retrievalWeight).toBe(1);
    expect(r.requiresAcknowledgement).toBe(false);
  });

  it('is retrieved at full weight so the pipeline trusts its own evidence', () => {
    const r = computeFreshness({ documentClass: 'RECORD' }, NOW);
    expect(r.retrievalWeight).toBe(1);
  });
});

describe('REFERENCE class', () => {
  it('decays more slowly than GOVERNING', () => {
    const ref = computeFreshness({ documentClass: 'REFERENCE', ...at(1, 0) }, NOW);
    const gov = computeFreshness({ documentClass: 'GOVERNING', ...at(1, 0) }, NOW);
    expect(ref.decay).toBeGreaterThan(gov.decay);
  });

  it('caps at AGING on age alone', () => {
    const r = computeFreshness({ documentClass: 'REFERENCE', ...at(1, 5) }, NOW);
    expect(r.state).toBe('AGING');
    expect(r.reason).toMatch(/caps at AGING/);
  });

  it('falls to STALE once explicitly superseded', () => {
    const r = computeFreshness(
      { documentClass: 'REFERENCE', ...at(1, 5), supersededBy: 'doc-newer' },
      NOW,
    );
    expect(r.state).toBe('STALE');
    expect(r.reason).toMatch(/superseded/);
  });
});

describe('UNVERIFIED class -- the common real case', () => {
  it('flags documents with no declared review cycle', () => {
    const r = computeFreshness({ documentClass: 'GOVERNING' }, NOW);
    expect(r.state).toBe('UNVERIFIED');
    expect(r.reason).toMatch(/No review cycle/);
  });

  it('is retrievable at reduced weight, never silently fresh', () => {
    const r = computeFreshness({ documentClass: 'GOVERNING', effectiveDate: NOW.toISOString() }, NOW);
    expect(r.state).toBe('UNVERIFIED');
    expect(r.retrievalWeight).toBeCloseTo(0.6, 5);
    expect(r.retrievalWeight).toBeGreaterThan(0);
  });

  it('treats a nonsense effectiveDate as unverified rather than throwing', () => {
    const r = computeFreshness(
      { documentClass: 'GOVERNING', effectiveDate: 'not-a-date', reviewIntervalDays: 365 },
      NOW,
    );
    expect(r.state).toBe('UNVERIFIED');
  });
});

describe('enforcement policy', () => {
  it('keeps CRITICAL retrievable rather than excluding it', () => {
    const r = computeFreshness({ documentClass: 'GOVERNING', ...at(1, 2) }, NOW);
    expect(r.state).toBe('CRITICAL');
    // The safety property: an overdue SOP is still the governing procedure.
    expect(r.retrievalWeight).toBeGreaterThan(0);
    expect(r.retrievalWeight).toBeCloseTo(0.25, 5);
  });

  it('forces a human decision on CRITICAL, and only on CRITICAL', () => {
    expect(requiresAcknowledgement('CRITICAL')).toBe(true);
    for (const s of ['FRESH', 'AGING', 'STALE', 'RECORD', 'UNVERIFIED'] as const) {
      expect(requiresAcknowledgement(s)).toBe(false);
    }
  });

  it('weights AGING and STALE by their own score, so fresher outranks staler', () => {
    expect(retrievalWeightFor('AGING', 0.62)).toBeCloseTo(0.62, 5);
    expect(retrievalWeightFor('STALE', 0.31)).toBeCloseTo(0.31, 5);
    expect(retrievalWeightFor('FRESH', 0.9)).toBe(1);
  });

  it('ranks a fresh SOP above an equally relevant stale one', () => {
    const fresh = computeFreshness({ documentClass: 'GOVERNING', ...at(0.2, 0) }, NOW);
    const stale = computeFreshness({ documentClass: 'GOVERNING', ...at(1, 1) }, NOW);
    const relevance = 0.8;
    expect(relevance * fresh.retrievalWeight).toBeGreaterThan(relevance * stale.retrievalWeight);
  });
});

describe('derived nextReview', () => {
  it('derives nextReview from effectiveDate + interval when absent', () => {
    const effectiveDate = new Date(NOW.getTime() - 365 * DAY).toISOString();
    const derived = computeFreshness(
      { documentClass: 'GOVERNING', effectiveDate, reviewIntervalDays: 365 },
      NOW,
    );
    const explicit = computeFreshness(
      { documentClass: 'GOVERNING', effectiveDate, reviewIntervalDays: 365, nextReview: NOW.toISOString() },
      NOW,
    );
    expect(derived.decay).toBeCloseTo(explicit.decay, 5);
    expect(derived.state).toBe('AGING');
  });
});
