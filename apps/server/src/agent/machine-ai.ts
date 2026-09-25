import type { LlmClient } from './llm.js';

/** Everything the AI may know about a completed machine simulation. */
export interface SimFactSheet {
  tag: string;
  equipmentType: string;
  category: string;
  manufacturer?: string;
  service?: string;
  inputs: Record<string, number | string>;
  outputs: Array<{ name: string; value: number; unit: string }>;
  warnings: string[];
  correlation: string;
  source: string;
}

export interface AiExplanation {
  model: string;
  source: 'llm' | 'fallback';
  text: string;
}

function buildFacts(f: SimFactSheet): string {
  const lines: string[] = [];
  lines.push(
    `Equipment ${f.tag}: ${f.equipmentType} (${f.category})${f.manufacturer ? ` by ${f.manufacturer}` : ''}${f.service ? `, service: ${f.service}` : ''}`,
  );
  lines.push(`Operator inputs: ${Object.entries(f.inputs).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  lines.push('Computed outputs (deterministic physics):');
  for (const o of f.outputs) lines.push(`- ${o.name}: ${o.value} ${o.unit}`);
  if (f.warnings.length > 0) lines.push(`Active warnings: ${f.warnings.join(' | ')}`);
  lines.push(`Correlation: ${f.correlation} (${f.source})`);
  return lines.join('\n');
}

/**
 * Explain a completed run for the operator: what the numbers mean.
 * Requires a reachable model — there is no canned fallback. The gateway
 * surfaces a formal error when no model is online.
 */
export async function explainSimulation(facts: SimFactSheet, llm?: LlmClient): Promise<AiExplanation> {
  if (!llm) throw new Error('No inference model online. Enable a local model or configure the assist provider, then re-run the analysis.');
  const res = await llm.generate({
    taskId: `sim-${Date.now().toString(36)}`,
    stepId: 'interpret',
    taskType: 'document',
    system:
      'You are a senior plant engineer explaining a machine simulation to the console operator. Use ONLY the supplied computed values — never invent numbers. Plain text, 3-5 short lines, each starting with "- ". Cover: what the operating point means, notable margins or risks, and one actionable recommendation.',
    user: `Explain this simulation result:\n${buildFacts(facts)}`,
    maxTokens: 350,
    timeoutMs: 45000,
  });
  if (!res.ok || !res.text.trim()) {
    throw new Error('Analysis model unreachable. Verify the selected model is online, then retry.');
  }
  return { model: res.model ?? 'unknown', source: 'llm', text: res.text.trim() };
}

/**
 * Diagnose active warnings: likely cause, risk, next action.
 * Requires a reachable model — there is no canned fallback.
 */
export async function diagnoseWarnings(facts: SimFactSheet, llm?: LlmClient): Promise<AiExplanation> {
  if (!llm) throw new Error('No inference model online. Enable a local model or configure the assist provider, then re-run the diagnosis.');
  const res = await llm.generate({
    taskId: `sim-${Date.now().toString(36)}`,
    stepId: 'diagnose',
    taskType: 'document',
    system:
      'You are a reliability engineer diagnosing machine simulation warnings. Use ONLY the supplied computed values and warnings — never invent numbers. Plain text, max 6 short lines starting with "- ". For each warning: likely cause, operational risk if ignored, and the single next action (inspect / derate / resize / review SOP).',
    user: `Diagnose the active warnings in this simulation result:\n${buildFacts(facts)}`,
    maxTokens: 400,
    timeoutMs: 45000,
  });
  if (!res.ok || !res.text.trim()) {
    throw new Error('Diagnosis model unreachable. Verify the selected model is online, then retry.');
  }
  return { model: res.model ?? 'unknown', source: 'llm', text: res.text.trim() };
}
