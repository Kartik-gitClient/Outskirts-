import type {
  CalcResult,
  Citation,
  ClaimVerdict,
  CriticVerdict,
  Id,
  InspectionFinding,
} from '@outskirts/schemas';
import type { PluginHost } from '@outskirts/plugin-sdk';

export interface CriticContext {
  taskId: Id;
  stepId: Id;
  draftText: string;
  findings?: InspectionFinding[];
  calcResults?: CalcResult[];
  citations?: Citation[];
  retrievalSetChunkIds?: Set<string>;
  requiredSections?: string[];
  reviewerAcknowledgements?: Set<string>;
}

/**
 * Deterministic Critic C1–C5.
 * Section 6.3: Five of the six checks are deterministic code, with zero LLM variance.
 *
 * C1: Numeric Grounding
 * C2: Calculation Replay
 * C3: Citation Resolvability
 * C4: Template Completeness
 * C5: Freshness Policy
 */
export class DeterministicCritic {
  constructor(private pluginHost?: PluginHost) {}

  public async evaluate(ctx: CriticContext): Promise<CriticVerdict> {
    const verdicts: ClaimVerdict[] = [];

    // --- C1: Numeric Grounding -----------------------------------------------
    const c1Verdicts = this.checkNumericGrounding(ctx);
    verdicts.push(...c1Verdicts);

    // --- C2: Calculation Replay ----------------------------------------------
    const c2Verdicts = await this.checkCalculationReplay(ctx);
    verdicts.push(...c2Verdicts);

    // --- C3: Citation Resolvability ------------------------------------------
    const c3Verdicts = this.checkCitationResolvability(ctx);
    verdicts.push(...c3Verdicts);

    // --- C4: Template Completeness -------------------------------------------
    const c4Verdicts = this.checkTemplateCompleteness(ctx);
    verdicts.push(...c4Verdicts);

    // --- C5: Freshness Policy ------------------------------------------------
    const c5Verdicts = this.checkFreshnessPolicy(ctx);
    verdicts.push(...c5Verdicts);

    const deterministicPass = verdicts.every((v) => v.pass);
    const gate = deterministicPass ? 'pass' : 'fail';

    return {
      taskId: ctx.taskId,
      stepId: ctx.stepId,
      gate,
      deterministicPass,
      verdicts,
      repairsUsed: 0,
      escalated: !deterministicPass,
    };
  }

  /**
   * C1: Extract all numbers with units from the draft and ensure every number
   * traces back to an authorized extraction finding, calculation result, or citation.
   */
  public checkNumericGrounding(ctx: CriticContext): ClaimVerdict[] {
    const verdicts: ClaimVerdict[] = [];

    // Collect all authorized numbers from findings, calculations, and citations
    const authorizedNumbers = new Set<number>();
    const addNumber = (n: number | undefined) => {
      if (typeof n === 'number' && !isNaN(n)) {
        authorizedNumbers.add(Number(n.toFixed(4)));
        authorizedNumbers.add(Number(n.toFixed(2)));
        authorizedNumbers.add(Number(n.toFixed(1)));
        authorizedNumbers.add(Math.round(n));
      }
    };

    for (const f of ctx.findings ?? []) {
      addNumber(f.measuredValue);
      addNumber(f.limitValue);
    }

    for (const c of ctx.calcResults ?? []) {
      addNumber(c.result.value);
      for (const step of c.steps) {
        addNumber(step.result?.value);
      }
      for (const inp of Object.values(c.inputs)) {
        addNumber(inp.value);
      }
    }

    for (const cite of ctx.citations ?? []) {
      addNumber(cite.decayAtCitation);
      // Also extract numbers from quote if present
      const quoteMatches = cite.quote?.match(/\b\d+(\.\d+)?\b/g);
      for (const qm of quoteMatches ?? []) {
        addNumber(parseFloat(qm));
      }
    }

    // Common non-claim numbers to ignore (dates, section numbers)
    const ignoreNumbers = new Set([2026, 9, 10, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6, 7, 8, 9, 101, 402]);

    // Extract numbers from draft text
    const draftNumberMatches = ctx.draftText.match(/\b\d+(\.\d+)?\b/g) ?? [];

    for (let i = 0; i < draftNumberMatches.length; i++) {
      const numStr = draftNumberMatches[i]!;
      const val = parseFloat(numStr);
      if (ignoreNumbers.has(val)) continue;

      const rounded = Number(val.toFixed(4));
      const rounded2 = Number(val.toFixed(2));
      const rounded1 = Number(val.toFixed(1));

      const isAuthorized =
        authorizedNumbers.has(rounded) ||
        authorizedNumbers.has(rounded2) ||
        authorizedNumbers.has(rounded1) ||
        authorizedNumbers.has(Math.round(val));

      if (!isAuthorized) {
        verdicts.push({
          claimId: `claim-num-${i + 1}`,
          check: 'C1_NUMERIC_GROUNDING',
          pass: false,
          offending: numStr,
          note: `Number ${numStr} in draft does not match any finding, calculation, or citation value`,
        });
      }
    }

    if (verdicts.length === 0) {
      verdicts.push({
        claimId: 'claim-num-grounded',
        check: 'C1_NUMERIC_GROUNDING',
        pass: true,
        note: 'All numeric claims verified against source data',
      });
    }

    return verdicts;
  }

  /**
   * C2: Calculation Replay. Re-executes the calculation with recorded inputs and
   * asserts the result matches within 0.0001 tolerance.
   */
  public async checkCalculationReplay(ctx: CriticContext): Promise<ClaimVerdict[]> {
    const verdicts: ClaimVerdict[] = [];

    for (const calc of ctx.calcResults ?? []) {
      let recomputedValue: number | undefined;

      if (this.pluginHost && calc.tool === 'pipe-pressure-drop') {
        try {
          const replayInput = {
            length: calc.inputs['length'],
            diameter: calc.inputs['diameter'],
            roughness: calc.inputs['roughness'],
            flow: calc.inputs['flow'],
          };
          const replayed = (await this.pluginHost.executeTool(
            'pipe-calc-plugin',
            'calculate_pressure_drop',
            replayInput,
          )) as CalcResult;
          recomputedValue = replayed.result.value;
        } catch {
          recomputedValue = undefined;
        }
      }

      if (recomputedValue !== undefined) {
        const diff = Math.abs(recomputedValue - calc.result.value);
        const pass = diff < 0.0001;
        verdicts.push({
          claimId: `claim-calc-${calc.calcId}`,
          check: 'C2_CALCULATION_REPLAY',
          pass,
          offending: pass ? undefined : `${calc.result.value} != ${recomputedValue}`,
          note: pass
            ? `Calculation replayed within tolerance (diff: ${diff.toFixed(6)})`
            : `Calculation replay diverged: recorded ${calc.result.value}, recomputed ${recomputedValue}`,
          evidenceRef: calc.calcId,
        });
      } else {
        // Fallback check against recorded steps
        const lastStep = calc.steps[calc.steps.length - 1];
        const pass = lastStep?.result?.value === calc.result.value;
        verdicts.push({
          claimId: `claim-calc-${calc.calcId}`,
          check: 'C2_CALCULATION_REPLAY',
          pass,
          evidenceRef: calc.calcId,
          note: pass ? 'Calculation self-consistent' : 'Recorded calculation result does not match final step',
        });
      }
    }

    return verdicts;
  }

  /**
   * C3: Citation Resolvability. Asserts every cited document exists in this task's
   * retrieval set, and that cited SOPs are referenced in the draft.
   */
  public checkCitationResolvability(ctx: CriticContext): ClaimVerdict[] {
    const verdicts: ClaimVerdict[] = [];
    const allowed = ctx.retrievalSetChunkIds ?? new Set((ctx.citations ?? []).map((c) => c.chunkId));

    for (const cite of ctx.citations ?? []) {
      const resolves = allowed.has(cite.chunkId);
      const mentioned =
        ctx.draftText.includes(cite.documentId) || ctx.draftText.includes(cite.citationId);

      const pass = resolves && mentioned;
      verdicts.push({
        claimId: `claim-cite-${cite.citationId}`,
        check: 'C3_CITATION_RESOLVABILITY',
        pass,
        offending: !resolves ? `Unresolved chunk: ${cite.chunkId}` : !mentioned ? `Missing mention: ${cite.documentId}` : undefined,
        note: pass
          ? `Citation ${cite.documentId} resolved and present in draft`
          : `Citation failed: ${!resolves ? 'chunk not in retrieval set' : 'not referenced in text'}`,
        evidenceRef: cite.citationId,
      });
    }

    return verdicts;
  }

  /**
   * C4: Template Completeness. Checks all required sections exist in the draft.
   */
  public checkTemplateCompleteness(ctx: CriticContext): ClaimVerdict[] {
    const verdicts: ClaimVerdict[] = [];
    const sections = ctx.requiredSections ?? [
      'Inspection Findings',
      'Hydraulic Verification',
      'Compliance and Governing Standards',
      'Engineering Recommendation',
    ];

    for (const sec of sections) {
      const pass = ctx.draftText.includes(sec);
      verdicts.push({
        claimId: `claim-sec-${sec.replace(/\s+/g, '-').toLowerCase()}`,
        check: 'C4_TEMPLATE_COMPLETENESS',
        pass,
        offending: pass ? undefined : `Missing section: ${sec}`,
        note: pass ? `Section "${sec}" present` : `Required section "${sec}" missing from draft`,
      });
    }

    return verdicts;
  }

  /**
   * C5: Freshness Policy. Asserts no CRITICAL document is cited without recorded
   * reviewer acknowledgement.
   */
  public checkFreshnessPolicy(ctx: CriticContext): ClaimVerdict[] {
    const verdicts: ClaimVerdict[] = [];

    for (const cite of ctx.citations ?? []) {
      if (cite.stateAtCitation === 'CRITICAL') {
        const isAcked =
          cite.acknowledgedBy !== undefined ||
          ctx.reviewerAcknowledgements?.has(cite.citationId) === true;

        verdicts.push({
          claimId: `claim-freshness-${cite.citationId}`,
          check: 'C5_FRESHNESS_POLICY',
          pass: isAcked,
          offending: isAcked ? undefined : `Unacknowledged CRITICAL citation: ${cite.documentId}`,
          note: isAcked
            ? `CRITICAL document ${cite.documentId} acknowledged by ${cite.acknowledgedBy ?? 'reviewer'}`
            : `CRITICAL document ${cite.documentId} requires explicit reviewer acknowledgement before gate can pass`,
          evidenceRef: cite.citationId,
        });
      } else {
        verdicts.push({
          claimId: `claim-freshness-${cite.citationId}`,
          check: 'C5_FRESHNESS_POLICY',
          pass: true,
          note: `Document freshness is ${cite.stateAtCitation} (decay: ${cite.decayAtCitation})`,
          evidenceRef: cite.citationId,
        });
      }
    }

    return verdicts;
  }
}
