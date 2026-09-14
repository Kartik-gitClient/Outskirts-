import type {
  CalcResult,
  Citation,
  InspectionFinding,
} from '@outskirts/schemas';
import { DeterministicCritic, type CriticContext } from './deterministic.js';

export interface SeededEvaluationResult {
  arithmeticTested: number;
  arithmeticCaught: number;
  arithmeticCatchRate: number;
  citationTested: number;
  citationCaught: number;
  citationCatchRate: number;
  details: Array<{ id: string; category: 'arithmetic' | 'citation'; caught: boolean; description: string }>;
}

export function createBaseCorpusFixture() {
  const finding: InspectionFinding = {
    findingId: 'f-101',
    equipmentTag: 'P-101A',
    description: 'Elbow UT inspection',
    measuredValue: 4.8,
    measuredUnit: 'mm',
    limitValue: 4.2,
    limitUnit: 'mm',
    severity: 'minor',
  };

  const calcResult: CalcResult = {
    calcId: 'calc-01',
    tool: 'pipe-pressure-drop',
    correlation: 'Darcy-Weisbach / Swamee-Jain',
    reference: 'Crane TP 410',
    inputs: {
      length: { value: 120, unit: 'm' },
      diameter: { value: 0.154, unit: 'm' },
      roughness: { value: 0.000045, unit: 'm' },
      flow: { value: 180, unit: 'm**3/h' },
    },
    result: { value: 0.0435, unit: 'bar' },
    steps: [
      { ordinal: 1, description: 'Area', result: { value: 0.0186, unit: 'm**2' } },
      { ordinal: 2, description: 'Drop', result: { value: 0.0435, unit: 'bar' } },
    ],
    assumptions: [],
    validityWarnings: [],
  };

  const citation: Citation = {
    citationId: 'cite-01',
    chunkId: 'chunk-sop-402',
    documentId: 'doc-sop-402',
    quote: 'Thickness must exceed 4.2mm with 5.0 years remaining life.',
    decayAtCitation: 0.95,
    stateAtCitation: 'FRESH',
  };

  const baseDraft = [
    '# ENGINEERING APPROVAL NOTE: PIPING LINE P-101A',
    '## Inspection Findings',
    '- Measured Wall Thickness: 4.8 mm',
    '- Minimum Allowable Thickness: 4.2 mm',
    '- Remaining Life: 5.0 years',
    '## Hydraulic Verification',
    '- Frictional Drop: 0.0435 bar',
    '## Compliance and Governing Standards',
    '- Governing SOP: doc-sop-402 (Thickness must exceed 4.2mm with 5.0 years remaining life.)',
    '## Engineering Recommendation',
    'APPROVED for continued operation.',
  ].join('\n');

  return { finding, calcResult, citation, baseDraft };
}

/**
 * Evaluates the deterministic critic against 20 seeded arithmetic errors and 20 seeded citation errors.
 * Section 18 P2 exit criteria: catches 100% of seeded arithmetic and >= 90% of seeded citation errors.
 */
export async function evaluateSeededCorpus(
  critic: DeterministicCritic,
): Promise<SeededEvaluationResult> {
  const { finding, calcResult, citation, baseDraft } = createBaseCorpusFixture();
  const details: SeededEvaluationResult['details'] = [];

  // ===========================================================================
  // 1. 20 Seeded Arithmetic Errors (Mutations of numbers in draft or calculation)
  // ===========================================================================
  const arithmeticMutations: Array<{ desc: string; draft: string; customCalc?: CalcResult }> = [
    { desc: 'Mutate measured thickness 4.8 to 3.1 mm', draft: baseDraft.replace('4.8 mm', '3.1 mm') },
    { desc: 'Mutate measured thickness 4.8 to 7.9 mm', draft: baseDraft.replace('4.8 mm', '7.9 mm') },
    { desc: 'Mutate minimum floor 4.2 to 2.1 mm', draft: baseDraft.replace('4.2 mm', '2.1 mm') },
    { desc: 'Mutate minimum floor 4.2 to 5.5 mm', draft: baseDraft.replace('4.2 mm', '5.5 mm') },
    { desc: 'Mutate remaining life 5.0 to 12.5 years', draft: baseDraft.replace('5.0 years', '12.5 years') },
    { desc: 'Mutate remaining life 5.0 to 0.5 years', draft: baseDraft.replace('5.0 years', '0.5 years') },
    { desc: 'Mutate pressure drop 0.0435 to 0.8500 bar', draft: baseDraft.replace('0.0435 bar', '0.8500 bar') },
    { desc: 'Mutate pressure drop 0.0435 to 0.0120 bar', draft: baseDraft.replace('0.0435 bar', '0.0120 bar') },
    { desc: 'Introduce hallucinated flow figure 250 m3/h', draft: baseDraft + '\nFlow measured at 250 m3/h' },
    { desc: 'Introduce hallucinated temperature 185 C', draft: baseDraft + '\nDesign temperature 185 C' },
    { desc: 'Introduce hallucinated test pressure 28.5 bar', draft: baseDraft + '\nHydrotest pressure 28.5 bar' },
    { desc: 'Introduce ungrounded corrosion rate 0.45 mm/yr', draft: baseDraft + '\nCorrosion rate 0.45 mm/yr' },
    { desc: 'Introduce ungrounded velocity 3.75 m/s', draft: baseDraft + '\nFluid velocity 3.75 m/s' },
    { desc: 'Introduce ungrounded Reynolds number 85000', draft: baseDraft + '\nReynolds 85000' },
    { desc: 'Introduce ungrounded diameter 0.250 m', draft: baseDraft + '\nDiameter 0.250 m' },
    { desc: 'Mutate calculation result in CalcResult object', draft: baseDraft, customCalc: { ...calcResult, result: { value: 0.125, unit: 'bar' } } },
    { desc: 'Mutate calculation intermediate area step in CalcResult', draft: baseDraft, customCalc: { ...calcResult, steps: [{ ordinal: 1, description: 'Area', result: { value: 0.0999, unit: 'm**2' } }, { ordinal: 2, description: 'Drop', result: { value: 0.9999, unit: 'bar' } }] } },
    { desc: 'Introduce hallucinated safety factor 4.5', draft: baseDraft + '\nSafety factor 4.5' },
    { desc: 'Introduce ungrounded nozzle thickness 2.8 mm', draft: baseDraft + '\nNozzle thickness 2.8 mm' },
    { desc: 'Introduce ungrounded flange rating 600 psi', draft: baseDraft + '\nFlange rating 600 psi' },
  ];

  let arithmeticCaught = 0;
  for (let i = 0; i < arithmeticMutations.length; i++) {
    const m = arithmeticMutations[i]!;
    const ctx: CriticContext = {
      taskId: `arith-${i + 1}`,
      stepId: 'step-critic',
      draftText: m.draft,
      findings: [finding],
      calcResults: [m.customCalc ?? calcResult],
      citations: [citation],
      retrievalSetChunkIds: new Set([citation.chunkId]),
    };

    const verdict = await critic.evaluate(ctx);
    // An error is caught if C1 or C2 failed
    const c1c2Failed = verdict.verdicts.some((v) => (!v.pass && (v.check === 'C1_NUMERIC_GROUNDING' || v.check === 'C2_CALCULATION_REPLAY')));
    if (c1c2Failed) {
      arithmeticCaught++;
    }
    details.push({
      id: `arithmetic-${i + 1}`,
      category: 'arithmetic',
      caught: c1c2Failed,
      description: m.desc,
    });
  }

  // ===========================================================================
  // 2. 20 Seeded Citation & Freshness Errors (Mutations of SOPs and chunks)
  // ===========================================================================
  const citationMutations: Array<{ desc: string; draft: string; citations: Citation[]; retrievalSet?: Set<string>; acks?: Set<string> }> = [
    { desc: 'Citation chunkId not in retrieval set', draft: baseDraft, citations: [{ ...citation, chunkId: 'unretrieved-chunk-99' }], retrievalSet: new Set(['chunk-sop-402']) },
    { desc: 'Hallucinated standard documentId doc-sop-unknown', draft: baseDraft.replace('doc-sop-402', 'doc-sop-unknown'), citations: [{ ...citation, documentId: 'doc-sop-unknown', chunkId: 'chunk-unknown' }], retrievalSet: new Set(['chunk-sop-402']) },
    { desc: 'Unacknowledged CRITICAL stale document', draft: baseDraft, citations: [{ ...citation, stateAtCitation: 'CRITICAL', decayAtCitation: 0.15 }] },
    { desc: 'Unacknowledged CRITICAL expired revision', draft: baseDraft, citations: [{ ...citation, citationId: 'cite-crit-2', stateAtCitation: 'CRITICAL', decayAtCitation: 0.05 }] },
    { desc: 'Citation omitted from draft text entirely', draft: baseDraft.replace(/doc-sop-402.*/, 'No standard cited.'), citations: [citation], retrievalSet: new Set(['chunk-sop-402']) },
    { desc: 'Empty retrieval set chunk id', draft: baseDraft, citations: [{ ...citation, chunkId: '' }], retrievalSet: new Set(['chunk-sop-402']) },
    { desc: 'Cited standard superseded in 2021 without reference', draft: baseDraft.replace('doc-sop-402', 'doc-superseded-2018'), citations: [{ ...citation, documentId: 'doc-superseded-2018', chunkId: 'chunk-2018' }], retrievalSet: new Set(['chunk-sop-402']) },
    { desc: 'Unacknowledged CRITICAL inspection procedure', draft: baseDraft, citations: [{ ...citation, citationId: 'cite-sop-crit-3', stateAtCitation: 'CRITICAL', decayAtCitation: 0.0 }] },
    { desc: 'Fabricated chunkId chunk-fake-01', draft: baseDraft, citations: [{ ...citation, chunkId: 'chunk-fake-01' }], retrievalSet: new Set(['chunk-real-01']) },
    { desc: 'Fabricated chunkId chunk-fake-02', draft: baseDraft, citations: [{ ...citation, chunkId: 'chunk-fake-02' }], retrievalSet: new Set(['chunk-real-01']) },
    { desc: 'Unacknowledged CRITICAL refinery safety directive', draft: baseDraft, citations: [{ ...citation, citationId: 'cite-safety-crit', stateAtCitation: 'CRITICAL', decayAtCitation: 0.10 }] },
    { desc: 'Citation documentId doc-api-570 missing from draft', draft: baseDraft, citations: [{ ...citation, documentId: 'doc-api-570', chunkId: 'chunk-sop-402' }] },
    { desc: 'Missing retrieval set presence for chunk-asme-b31-3', draft: baseDraft, citations: [{ ...citation, chunkId: 'chunk-asme-b31-3' }], retrievalSet: new Set(['chunk-sop-402']) },
    { desc: 'Unacknowledged CRITICAL equipment class standard', draft: baseDraft, citations: [{ ...citation, citationId: 'cite-eq-crit', stateAtCitation: 'CRITICAL', decayAtCitation: 0.08 }] },
    { desc: 'Hallucinated standard doc-iso-9001-fake', draft: baseDraft.replace('doc-sop-402', 'doc-iso-9001-fake'), citations: [{ ...citation, documentId: 'doc-iso-9001-fake', chunkId: 'chunk-iso' }], retrievalSet: new Set(['chunk-sop-402']) },
    { desc: 'Missing draft mention for doc-shell-dep', draft: baseDraft, citations: [{ ...citation, documentId: 'doc-shell-dep', chunkId: 'chunk-sop-402' }] },
    { desc: 'Unacknowledged CRITICAL emergency shutdown procedure', draft: baseDraft, citations: [{ ...citation, citationId: 'cite-esd-crit', stateAtCitation: 'CRITICAL', decayAtCitation: 0.02 }] },
    { desc: 'Unretrieved chunk-foreign-system', draft: baseDraft, citations: [{ ...citation, chunkId: 'chunk-foreign-system' }], retrievalSet: new Set(['chunk-sop-402']) },
    { desc: 'Unacknowledged CRITICAL hot tap inspection bulletin', draft: baseDraft, citations: [{ ...citation, citationId: 'cite-hottap-crit', stateAtCitation: 'CRITICAL', decayAtCitation: 0.12 }] },
    { desc: 'Unretrieved chunk-stale-piping', draft: baseDraft, citations: [{ ...citation, chunkId: 'chunk-stale-piping' }], retrievalSet: new Set(['chunk-sop-402']) },
  ];

  let citationCaught = 0;
  for (let i = 0; i < citationMutations.length; i++) {
    const m = citationMutations[i]!;
    const ctx: CriticContext = {
      taskId: `cite-${i + 1}`,
      stepId: 'step-critic',
      draftText: m.draft,
      findings: [finding],
      calcResults: [calcResult],
      citations: m.citations,
      retrievalSetChunkIds: m.retrievalSet ?? new Set(m.citations.map((c) => c.chunkId)),
      reviewerAcknowledgements: m.acks ?? new Set(),
    };

    const verdict = await critic.evaluate(ctx);
    // An error is caught if C3 or C5 failed
    const c3c5Failed = verdict.verdicts.some((v) => (!v.pass && (v.check === 'C3_CITATION_RESOLVABILITY' || v.check === 'C5_FRESHNESS_POLICY')));
    if (c3c5Failed) {
      citationCaught++;
    }
    details.push({
      id: `citation-${i + 1}`,
      category: 'citation',
      caught: c3c5Failed,
      description: m.desc,
    });
  }

  const arithmeticCatchRate = (arithmeticCaught / arithmeticMutations.length) * 100;
  const citationCatchRate = (citationCaught / citationMutations.length) * 100;

  return {
    arithmeticTested: arithmeticMutations.length,
    arithmeticCaught,
    arithmeticCatchRate,
    citationTested: citationMutations.length,
    citationCaught,
    citationCatchRate,
    details,
  };
}
