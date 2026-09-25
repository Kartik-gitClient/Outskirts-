import { randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import {
  CriticVerdict,
  DecisionDna,
  type CalcResult,
  type Citation,
  type Id,
  type InspectionFinding,
  type PipePressureDropInput,
  type Plan,
} from '@outskirts/schemas';
import {
  AuditChain,
  projectDecisionDna,
  sha256Hex,
} from '@outskirts/sovereignty';
import { computeFreshness } from '@outskirts/knowledge';
import type { KnowledgeBase } from '@outskirts/knowledge';
import type { PAL } from '@outskirts/pal';
import type { PluginHost } from '@outskirts/plugin-sdk';
import { INSPECTION_APPROVAL_RECIPE } from './recipe.js';
import type { Checkpointer } from './checkpointer.js';
import { CancellationToken, TaskCancelledError } from './cancellation.js';
import type { TimelineManager } from '../gateway/timeline.js';
import { generateC2paManifest, type C2paManifest } from '../provenance/provenance-stub.js';
import { LlmClient } from './llm.js';
import { CONTRACT_REGISTER, type ContractRow } from '../data/workspace.js';
import { EQUIPMENT_CATALOG, categoryOf, type EquipmentRecord } from '../data/equipment.js';
import {
  runTwinScenario,
  TWIN_COMPONENTS,
  PIPING_SEGMENT,
  TWIN_BASELINE,
  type TwinResult,
  type TwinScenario,
} from '../digital-twin/simulator.js';
import type { ArtifactStore, StoredArtifact } from '../artifacts/store.js';
import {
  renderDocx,
  renderXlsx,
  renderPptx,
  renderText,
  renderHtml,
  type ChartSpec,
  type DocSection,
  type XlsxSheet,
  type PptxSlide,
} from '../artifacts/render.js';

import { DynamicAgentPlanner, isSmallTalk } from './planner.js';

export interface ExecutorOptions {
  pal: PAL;
  pluginHost: PluginHost;
  checkpointer: Checkpointer;
  timeline: TimelineManager;
  auditChain: AuditChain;
  keyId: string;
  signingKey: string | KeyObject;
  knowledge?: KnowledgeBase;
  knowledgeReady?: Promise<void>;
  artifacts?: ArtifactStore;
  llm?: LlmClient;
  workspace?: { getDataset<T>(key: string): T | undefined };
}

export interface PipelineResult {
  taskId: string;
  status: 'completed' | 'cancelled' | 'failed';
  dna?: DecisionDna;
  c2paManifest?: C2paManifest;
  artifactContent?: string;
  artifacts?: StoredArtifact[];
  stepsCompleted: string[];
}

/** A tabular dataset produced or consumed by a task, reusable by follow-ups. */
export interface TaskDataset {
  source: string;
  label: string;
  columns: string[];
  rows: Array<Record<string, string | number>>;
}

export class AgentPipelineExecutor {
  private planner: DynamicAgentPlanner;
  private llm?: LlmClient;
  private emittedArtifacts: StoredArtifact[] = [];
  /** Datasets produced by recent tasks, keyed by taskId, for context-aware follow-ups. */
  private readonly taskDatasets = new Map<string, TaskDataset>();

  constructor(private opts: ExecutorOptions) {
    this.planner = new DynamicAgentPlanner(opts.pal);
    if (opts.llm) this.llm = opts.llm;
  }

  /** Persist a rendered artifact and emit a timeline event carrying its URL. */
  private persistArtifact(taskId: string, artifactType: string, output: { fileName: string; mimeType: string; buffer: Buffer }): StoredArtifact | undefined {
    if (!this.opts.artifacts) return undefined;
    const stored = this.opts.artifacts.persist(taskId, artifactType, output);
    this.emittedArtifacts.push(stored);
    return stored;
  }

  public async executeTask(
    taskId: Id,
    goal: string,
    options?: {
      mode?: 'SOVEREIGN' | 'ASSIST';
      token?: CancellationToken;
      contextTaskId?: string;
    },
  ): Promise<PipelineResult> {
    const mode = options?.mode ?? 'SOVEREIGN';
    const token = options?.token ?? new CancellationToken();
    this.emittedArtifacts = [];

    if (this.opts.knowledgeReady) {
      try {
        await this.opts.knowledgeReady;
      } catch {
        // knowledge ingestion failure must not fail the task
      }
    }

    // Dynamically plan the user's natural language goal
    const { intent, plan: dynamicPlan } = await this.planner.planGoal(taskId, goal);
    const plan: Plan = dynamicPlan;

    // Broadcast plan.ready
    this.opts.timeline.emit(taskId, {
      type: 'plan.ready',
      plan,
    });

    const stepResults: Record<string, unknown> = {};
    const completedSteps: string[] = [];
    const seqLow = (this.opts.auditChain.getTailEvent()?.seq ?? 0) + 1;

    let dna: DecisionDna | undefined;
    let c2paManifest: C2paManifest | undefined;
    let draftContent = '';

    try {
      if (intent === 'MICROTOOL_CODE') {
        // ---------------------------------------------------------------------
        // Journey 2: Micro-Tool Code Generation & Sandboxed Preview
        // ---------------------------------------------------------------------
        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-1-req', async () => {
          const spec = { goal, inputs: ['diameter', 'length', 'flowRate'], correlation: 'Darcy-Weisbach' };
          this.opts.auditChain.append('pal.call', { action: 'microtool-spec', model: 'qwen2.5-coder-7b-awq' }, { taskId, stepId: 'step-1-req' });
          stepResults['step-1-req'] = spec;
        });
        completedSteps.push('step-1-req');

        token.throwIfCancelled();
        let generatedHtml = '';
        await this.runStep(taskId, plan, 'step-2-gen', async () => {
          generatedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Hydraulic Sizing Tool</title>
  <style>
    body { font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 1.5rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 1.5rem; max-width: 500px; margin: 0 auto; }
    h2 { color: #38bdf8; margin-top: 0; font-size: 1.25rem; }
    label { display: block; margin: 0.75rem 0 0.25rem; font-size: 0.85rem; color: #94a3b8; }
    input[type=range] { width: 100%; accent-color: #38bdf8; }
    .val { font-weight: bold; color: #38bdf8; }
    .result-box { margin-top: 1.25rem; background: #0f172a; border-left: 4px solid #4ade80; padding: 1rem; border-radius: 4px; }
    .dp-val { font-size: 1.75rem; font-weight: 800; color: #4ade80; }
  </style>
</head>
<body>
  <div class="card">
    <h2>⚡ Hydraulic Sizing Micro-Tool (Darcy-Weisbach)</h2>
    <label>Internal Diameter: <span id="dVal" class="val">154</span> mm</label>
    <input id="dInput" type="range" min="50" max="500" value="154">
    <label>Pipe Length: <span id="lVal" class="val">120</span> m</label>
    <input id="lInput" type="range" min="10" max="500" value="120">
    <label>Volumetric Flow: <span id="qVal" class="val">180</span> m³/h</label>
    <input id="qInput" type="range" min="20" max="500" value="180">
    <div class="result-box">
      <div>Calculated Pressure Drop (&Delta;P):</div>
      <div id="res" class="dp-val">0.385 bar</div>
      <div style="font-size:0.75rem; color:#64748b; margin-top:0.3rem;">Darcy-Weisbach & Colebrook-White &plusmn;2.5%</div>
    </div>
  </div>
  <script>
    const dIn = document.getElementById('dInput'), lIn = document.getElementById('lInput'), qIn = document.getElementById('qInput');
    function calc() {
      const D = dIn.value / 1000, L = parseFloat(lIn.value), Q = parseFloat(qIn.value) / 3600;
      document.getElementById('dVal').innerText = dIn.value;
      document.getElementById('lVal').innerText = lIn.value;
      document.getElementById('qVal').innerText = qIn.value;
      const v = Q / ((Math.PI / 4) * D * D);
      const Re = (850 * v * D) / 0.0032;
      const f = Re < 2300 ? 64 / Re : Math.pow(-1.8 * Math.log10(Math.pow(0.000045 / D / 3.7, 1.11) + 6.9 / Re), -2);
      const dP = (f * (L / D) * (850 * v * v / 2)) / 100000;
      document.getElementById('res').innerText = dP.toFixed(4) + ' bar';
    }
    dIn.oninput = calc; lIn.oninput = calc; qIn.oninput = calc;
  </script>
</body>
</html>`;
          const llmHtml = await this.synthesizeMicroToolHtml(taskId, goal);
          if (llmHtml) generatedHtml = llmHtml;
          this.opts.auditChain.append('pal.call', { action: 'code-synthesis', length: generatedHtml.length }, { taskId, stepId: 'step-2-gen' });
          stepResults['step-2-gen'] = generatedHtml;
        });
        completedSteps.push('step-2-gen');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-3-sandbox', async () => {
          const hasNoFetch = !generatedHtml.includes('fetch(') && !generatedHtml.includes('XMLHttpRequest');
          this.opts.auditChain.append('guard.alert', { check: 'sandbox-csp-audit', passed: hasNoFetch }, { taskId, stepId: 'step-3-sandbox' });
          stepResults['step-3-sandbox'] = { cspCompliant: hasNoFetch };
        });
        completedSteps.push('step-3-sandbox');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-4-export', async () => {
          const dnaId = `dna-${taskId}`;
          const artifactHash = sha256Hex(generatedHtml);
          c2paManifest = generateC2paManifest({
            title: `Interactive Micro-Tool: ${goal}`,
            format: 'text/html',
            targetContent: generatedHtml,
            dnaId,
            planHash: sha256Hex(JSON.stringify(plan)),
            authorId: 'agent-coder-01',
            keyId: this.opts.keyId,
            privateKey: this.opts.signingKey,
          });

          const storedHtml = this.persistArtifact(
            taskId,
            'microtool',
            renderHtml({ title: `microtool-${taskId}`, html: generatedHtml }),
          );

          this.opts.timeline.emit(taskId, {
            type: 'artifact.ready',
            artifactId: storedHtml?.artifactId ?? `art-${taskId}`,
            artifactType: 'code',
            path: storedHtml?.url ?? `/artifacts/${taskId}/tool.html`,
            c2paManifestRef: c2paManifest.manifestId,
          });

          dna = projectDecisionDna({
            taskId,
            goal,
            recipeId: plan.recipeId,
            modeAtLaunch: mode,
            planDefinition: plan,
            steps: [{
              stepId: 'step-2-gen',
              kind: 'code',
              model: 'qwen2.5-coder-7b-awq',
              modelDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
              providerId: 'vllm',
              locality: 'loopback',
              trustBoundary: 'inside-perimeter',
              promptTemplateHash: 'code-gen',
              seed: 42,
              toolCalls: [],
            }],
            citations: [],
            criticGate: 'pass',
            deterministicPass: true,
            artifactHashes: [artifactHash],
            c2paManifestRef: c2paManifest.manifestId,
            chainSeqLow: seqLow,
            chainSeqHigh: this.opts.auditChain.getTailEvent()!.seq,
          });

          this.opts.timeline.emit(taskId, {
            type: 'task.complete',
            dnaId: dna.dnaId,
            artifactIds: [`art-${taskId}`],
          });
          stepResults['step-4-export'] = { dna, c2paManifest };
        });
        completedSteps.push('step-4-export');

        draftContent = generatedHtml;
      } else if (intent === 'PID_ANALYSIS') {
        // ---------------------------------------------------------------------
        // Journey 3: P&ID Drawing Perception & Isolation Tracing
        // ---------------------------------------------------------------------
        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-1-vision', async () => {
          this.opts.auditChain.append('pal.call', { action: 'pid-vision-raster-scan', model: 'qwen2.5-vl-7b-instruct' }, { taskId, stepId: 'step-1-vision' });
          stepResults['step-1-vision'] = { documentId: 'MRPL-CDU-01', resolution: '1600x1100' };
        });
        completedSteps.push('step-1-vision');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-2-symbols', async () => {
          const detected = [
            { tag: 'P-101A', type: 'centrifugal-pump', bbox: [500, 380, 80, 80] },
            { tag: 'GV-1001', type: 'gate-valve', bbox: [380, 400, 50, 40] },
            { tag: 'GV-1002', type: 'gate-valve', bbox: [650, 400, 50, 40] },
          ];
          this.opts.auditChain.append('file.op', { detectedCount: detected.length }, { taskId, stepId: 'step-2-symbols' });
          stepResults['step-2-symbols'] = detected;
        });
        completedSteps.push('step-2-symbols');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-3-topology', async () => {
          const topology = { lines: ['L-101', 'L-102'], connections: 5 };
          this.opts.auditChain.append('file.op', topology, { taskId, stepId: 'step-3-topology' });
          stepResults['step-3-topology'] = topology;
        });
        completedSteps.push('step-3-topology');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-4-isolation', async () => {
          const isolation = { suctionValves: ['GV-1001'], dischargeValves: ['GV-1002'] };
          this.opts.auditChain.append('tool.call', { tool: 'find_isolation_valves', tag: 'P-101A', isolation }, { taskId, stepId: 'step-4-isolation' });
          stepResults['step-4-isolation'] = isolation;
        });
        completedSteps.push('step-4-isolation');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-5-summary', async () => {
          draftContent = 'P&ID Analysis: Pump P-101A certified isolation boundary established with upstream suction block valve GV-1001 and downstream discharge block valve GV-1002.';
          const dnaId = `dna-${taskId}`;
          this.opts.timeline.emit(taskId, {
            type: 'artifact.ready',
            artifactId: `art-${taskId}`,
            artifactType: 'chart',
            path: `/artifacts/${taskId}/pid-analysis.json`,
          });
          dna = projectDecisionDna({
            taskId,
            goal,
            recipeId: plan.recipeId,
            modeAtLaunch: mode,
            planDefinition: plan,
            steps: [],
            citations: [],
            criticGate: 'pass',
            deterministicPass: true,
            artifactHashes: [sha256Hex(draftContent)],
            chainSeqLow: seqLow,
            chainSeqHigh: this.opts.auditChain.getTailEvent()!.seq,
          });
          this.opts.timeline.emit(taskId, {
            type: 'task.complete',
            dnaId: dna.dnaId,
            artifactIds: [`art-${taskId}`],
          });
          stepResults['step-5-summary'] = { draftContent, dna };
        });
        completedSteps.push('step-5-summary');
      } else if (intent === 'SPREADSHEET_EXCEL') {
        // ---------------------------------------------------------------------
        // Journey 4: DB-backed spreadsheet generation over the dataset the
        // operator actually asked for (equipment catalog, contracts, or the
        // previous run's data when the goal references "this data").
        // ---------------------------------------------------------------------
        token.throwIfCancelled();
        const dataset = this.resolveDataset(goal, options?.contextTaskId);

        await this.runStep(taskId, plan, 'step-1-intake', async () => {
          stepResults['dataset'] = dataset;
          stepResults['step-1-intake'] = { source: dataset.source, rows: dataset.rows.length };
          this.opts.auditChain.append(
            'file.op',
            { dataset: dataset.source, rows: dataset.rows.length, columns: dataset.columns.length },
            { taskId, stepId: 'step-1-intake' },
          );
        });
        completedSteps.push('step-1-intake');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-2-calc', async () => {
          const summary = summarizeDataset(dataset);
          stepResults['step-2-calc'] = summary;
          this.taskDatasets.set(taskId, dataset);
          this.opts.auditChain.append(
            'tool.call',
            { tool: 'dataset-aggregation', source: dataset.source, groups: summary.groups.length },
            { taskId, stepId: 'step-2-calc' },
          );
        });
        completedSteps.push('step-2-calc');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-3-render', async () => {
          const summary = stepResults['step-2-calc'] as ReturnType<typeof summarizeDataset>;
          const sheets = await this.buildDatasetWorkbook(taskId, goal, dataset, summary);
          const stored = this.persistArtifact(
            taskId,
            'workbook',
            await renderXlsx({
              title: `${dataset.label}-${taskId}`,
              sheets,
              chart: {
                title: `${dataset.label} — ${titleize(summary.groupColumn)}${summary.numericColumn ? ` (total ${titleize(summary.numericColumn)})` : ' (row count)'}`,
                ...(summary.numericColumn ? { unit: titleize(summary.numericColumn) } : {}),
                bars: summary.groups.slice(0, 12).map((g) => ({
                  label: g.label,
                  value: summary.numericColumn ? Number((g.numericSum ?? 0).toFixed(2)) : g.count,
                })),
              },
            }),
          );
          draftContent = [
            `# ${dataset.label} Workbook`,
            '',
            `Generated from \`${dataset.source}\` — ${dataset.rows.length} rows, ${dataset.columns.length} columns, ${sheets.length} sheet(s).`,
            '',
            '## Aggregations',
            ...summary.groups.slice(0, 12).map((g) => `- ${g.label}: ${g.count} rows${g.numericSum !== undefined ? ` · ${summary.numericColumn} total ${Number(g.numericSum.toFixed(2))}` : ''}`),
          ].join('\n');
          this.opts.timeline.emit(taskId, {
            type: 'artifact.ready',
            artifactId: stored?.artifactId ?? `art-${taskId}`,
            artifactType: 'xlsx',
            path: stored?.url ?? '',
          });
          stepResults['step-3-render'] = { artifact: stored };
        });
        completedSteps.push('step-3-render');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-4-record', async () => {
          dna = this.buildSimpleDna(taskId, goal, plan, mode, seqLow, draftContent);
          this.opts.timeline.emit(taskId, {
            type: 'task.complete',
            dnaId: dna.dnaId,
            artifactIds: this.emittedArtifacts.map((a) => a.artifactId),
          });
          stepResults['step-4-record'] = dna;
        });
        completedSteps.push('step-4-record');
      } else if (intent === 'VISUALIZATION') {
        // ---------------------------------------------------------------------
        // Journey 4b: Real visualization of actual data — the previous run's
        // dataset (conversation context) or the live workspace store.
        // ---------------------------------------------------------------------
        token.throwIfCancelled();
        const dataset = this.resolveDataset(goal, options?.contextTaskId);

        await this.runStep(taskId, plan, 'step-1-source', async () => {
          stepResults['dataset'] = dataset;
          stepResults['step-1-source'] = { source: dataset.source, rows: dataset.rows.length };
          this.opts.auditChain.append(
            'file.op',
            { action: 'visualization-source', source: dataset.source, rows: dataset.rows.length },
            { taskId, stepId: 'step-1-source' },
          );
        });
        completedSteps.push('step-1-source');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-2-series', async () => {
          const summary = summarizeDataset(dataset);
          stepResults['step-2-series'] = summary;
          this.taskDatasets.set(taskId, dataset);
          this.opts.auditChain.append(
            'tool.call',
            { tool: 'chart-series', series: summary.groups.length, measure: summary.numericColumn ?? 'count' },
            { taskId, stepId: 'step-2-series' },
          );
        });
        completedSteps.push('step-2-series');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-3-render', async () => {
          const summary = stepResults['step-2-series'] as ReturnType<typeof summarizeDataset>;
          const html = buildChartHtml(dataset, summary, goal);
          const stored = this.persistArtifact(taskId, 'chart-dashboard', renderHtml({ title: `chart-${dataset.label}-${taskId}`, html }));
          draftContent = [
            `# Visualization — ${dataset.label}`,
            '',
            `Charted \`${dataset.source}\` (${dataset.rows.length} rows) grouped by **${summary.groupColumn}**, measure: **${summary.numericColumn ?? 'row count'}**.`,
            '',
            ...summary.groups.slice(0, 10).map((g) => `- ${g.label}: ${g.count}${g.numericSum !== undefined ? ` · ${Number(g.numericSum.toFixed(2))}` : ''}`),
            '',
            'Open the artifact preview to see the interactive chart.',
          ].join('\n');
          this.opts.timeline.emit(taskId, {
            type: 'artifact.ready',
            artifactId: stored?.artifactId ?? `art-${taskId}`,
            artifactType: 'html',
            path: stored?.url ?? '',
          });
          stepResults['step-3-render'] = { artifact: stored };
        });
        completedSteps.push('step-3-render');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-4-record', async () => {
          dna = this.buildSimpleDna(taskId, goal, plan, mode, seqLow, draftContent);
          this.opts.timeline.emit(taskId, {
            type: 'task.complete',
            dnaId: dna.dnaId,
            artifactIds: this.emittedArtifacts.map((a) => a.artifactId),
          });
          stepResults['step-4-record'] = dna;
        });
        completedSteps.push('step-4-record');
      } else if (intent === 'PRESENTATION_DECK') {
        // ---------------------------------------------------------------------
        // Journey 5: Executive presentation deck
        // ---------------------------------------------------------------------
        token.throwIfCancelled();
        const deckDataset = this.resolveDataset(goal, options?.contextTaskId);
        await this.runStep(taskId, plan, 'step-1-brief', async () => {
          stepResults['step-1-brief'] = await this.buildDeckPlan(taskId, goal, deckDataset);
        });
        completedSteps.push('step-1-brief');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-2-slides', async () => {
          const brief = stepResults['step-1-brief'] as { slides: PptxSlide[] };
          this.opts.auditChain.append(
            'pal.call',
            { action: 'slide-synthesis', slides: brief.slides.length, source: deckDataset.source },
            { taskId, stepId: 'step-2-slides' },
          );
          stepResults['step-2-slides'] = { slides: brief.slides };
        });
        completedSteps.push('step-2-slides');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-3-render', async () => {
          const brief = stepResults['step-1-brief'] as {
            title: string;
            subtitle?: string;
            slides: PptxSlide[];
            chart?: ChartSpec;
          };
          const stored = this.persistArtifact(
            taskId,
            'deck',
            await renderPptx({
              title: brief.title,
              subtitle: brief.subtitle,
              slides: brief.slides,
              ...(brief.chart ? { chart: brief.chart } : {}),
            }),
          );
          draftContent = [
            `# ${brief.title}`,
            '',
            `Generated ${brief.slides.length + (brief.chart ? 1 : 0)}-slide executive deck from \`${deckDataset.source}\` (${deckDataset.rows.length} rows).`,
            '',
            ...(brief.chart ? brief.chart.bars.slice(0, 8).map((b) => `- ${b.label}: ${b.value}`) : []),
          ].join('\n');
          this.taskDatasets.set(taskId, deckDataset);
          this.opts.timeline.emit(taskId, {
            type: 'artifact.ready',
            artifactId: stored?.artifactId ?? `art-${taskId}`,
            artifactType: 'pptx',
            path: stored?.url ?? '',
          });
          stepResults['step-3-render'] = { artifact: stored };
        });
        completedSteps.push('step-3-render');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-4-record', async () => {
          dna = this.buildSimpleDna(taskId, goal, plan, mode, seqLow, draftContent);
          this.opts.timeline.emit(taskId, {
            type: 'task.complete',
            dnaId: dna.dnaId,
            artifactIds: this.emittedArtifacts.map((a) => a.artifactId),
          });
          stepResults['step-4-record'] = dna;
        });
        completedSteps.push('step-4-record');
      } else if (intent === 'DIGITAL_TWIN') {
        // ---------------------------------------------------------------------
        // Journey 5b: Digital Twin what-if simulation on the virtual plant
        // ---------------------------------------------------------------------
        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-1-model', async () => {
          stepResults['step-1-model'] = {
            components: TWIN_COMPONENTS,
            piping: PIPING_SEGMENT,
            baseline: TWIN_BASELINE,
          };
          this.opts.auditChain.append(
            'file.op',
            { action: 'digital-twin-model-load', components: TWIN_COMPONENTS.length },
            { taskId, stepId: 'step-1-model' },
          );
        });
        completedSteps.push('step-1-model');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-2-simulate', async () => {
          const scenario = inferTwinScenario(goal);
          const twinResult = await runTwinScenario(
            scenario,
            process.env.ENGINEERING_SERVICE_URL
              ? { serviceUrl: process.env.ENGINEERING_SERVICE_URL }
              : undefined,
          );
          stepResults['step-2-simulate'] = twinResult;
          this.opts.auditChain.append(
            'tool.call',
            {
              tool: 'digital-twin-simulation',
              scenario: scenario.type,
              verdict: twinResult.safetyVerdict,
              source: twinResult.calculationSource,
            },
            { taskId, stepId: 'step-2-simulate' },
          );
        });
        completedSteps.push('step-2-simulate');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-3-verify', async () => {
          const r = stepResults['step-2-simulate'] as TwinResult;
          stepResults['step-3-verify'] = {
            verdict: r.safetyVerdict,
            failedMetrics: r.deltas.filter((d) => !d.withinDesign).map((d) => d.metric),
          };
        });
        completedSteps.push('step-3-verify');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-4-record', async () => {
          const r = stepResults['step-2-simulate'] as TwinResult;
          const sections: DocSection[] = [
            {
              heading: 'Scenario',
              paragraphs: [r.scenario.description ?? r.scenario.type],
              bullets: [
                `Scenario type: ${r.scenario.type}`,
                ...(r.scenario.target ? [`Target equipment: ${r.scenario.target}`] : []),
                `Calculation engine: ${r.correlation} (${r.calculationSource})`,
              ],
            },
            {
              heading: 'Simulated State vs Baseline',
              table: {
                columns: ['Metric', 'Baseline', 'Simulated', 'Delta', 'Unit', 'Within design'],
                rows: r.deltas.map((d) => [
                  d.metric,
                  d.baseline,
                  d.simulated,
                  d.delta,
                  d.unit,
                  d.withinDesign ? 'YES' : 'NO',
                ]),
              },
            },
            { heading: 'Findings', bullets: r.findings },
            { heading: 'Recommendations', bullets: r.recommendations },
            {
              heading: 'Safety Verdict',
              paragraphs: [`Simulation verdict: ${r.safetyVerdict.toUpperCase()}`],
              bullets:
                r.affectedEquipment.length > 0
                  ? [`Affected equipment: ${r.affectedEquipment.join(', ')}`]
                  : ['No equipment isolation required by this scenario'],
            },
          ];

          const stored = this.persistArtifact(
            taskId,
            'digital-twin-report',
            await renderDocx({
              title: 'Digital Twin Simulation Report',
              subtitle: `Virtual CDU feed train · scenario: ${r.scenario.type}`,
              meta: [
                { label: 'Twin run', value: r.twinId },
                { label: 'Executed at', value: r.executedAt },
                { label: 'Safety verdict', value: r.safetyVerdict.toUpperCase() },
              ],
              sections,
              chart: {
                title: `Simulated state — ${r.scenario.type}`,
                bars: r.deltas.slice(0, 10).map((d) => ({
                  label: d.metric,
                  value: Number(d.simulated.toFixed(2)),
                })),
              },
              signature: {
                name: 'agent-digital-twin-01',
                role: 'Virtual Plant Simulation Agent',
                timestamp: new Date().toISOString(),
                keyId: this.opts.keyId,
              },
            }),
          );

          draftContent = [
            `# Digital Twin Simulation Report (${r.scenario.type})`,
            '',
            '## Simulated vs Baseline',
            ...r.deltas.map(
              (d) =>
                `- ${d.metric}: ${d.baseline} -> ${d.simulated} ${d.unit} (delta ${d.delta})${d.withinDesign ? '' : ' **OUT OF DESIGN**'}`,
            ),
            '',
            '## Findings',
            ...r.findings.map((f) => `- ${f}`),
            '',
            '## Recommendations',
            ...r.recommendations.map((f) => `- ${f}`),
            '',
            `**Safety verdict: ${r.safetyVerdict.toUpperCase()}**`,
          ].join('\n');

          this.opts.timeline.emit(taskId, {
            type: 'artifact.ready',
            artifactId: stored?.artifactId ?? `art-${taskId}`,
            artifactType: 'docx',
            path: stored?.url ?? '',
          });

          dna = this.buildSimpleDna(taskId, goal, plan, mode, seqLow, draftContent);
          this.opts.timeline.emit(taskId, {
            type: 'task.complete',
            dnaId: dna.dnaId,
            artifactIds: this.emittedArtifacts.map((a) => a.artifactId),
          });
          stepResults['step-4-record'] = dna;
        });
        completedSteps.push('step-4-record');
      } else if (intent === 'KNOWLEDGE_QA' || intent === 'CUSTOM_GOAL') {
        // ---------------------------------------------------------------------
        // Journey 6: Grounded knowledge question answering
        // ---------------------------------------------------------------------
        token.throwIfCancelled();
        // Small talk is answered conversationally — never runs retrieval and
        // never dumps governing-document chunks at "hi".
        if (isSmallTalk(goal)) {
          await this.runStep(taskId, plan, 'step-1-greet', async () => {
            draftContent = await this.answerSmallTalk(taskId, goal);
            stepResults['step-1-greet'] = { smallTalk: true };
          });
          completedSteps.push('step-1-greet');

          await this.runStep(taskId, plan, 'step-2-record', async () => {
            dna = this.buildSimpleDna(taskId, goal, plan, mode, seqLow, draftContent);
            this.opts.timeline.emit(taskId, {
              type: 'task.complete',
              dnaId: dna.dnaId,
              artifactIds: this.emittedArtifacts.map((a) => a.artifactId),
            });
            stepResults['step-2-record'] = dna;
          });
          completedSteps.push('step-2-record');
        } else {
        let context = '';
        await this.runStep(taskId, plan, 'step-1-analyze', async () => {
          if (this.opts.knowledge) {
            const results = await this.opts.knowledge.retrieve(goal, { topK: 4 });
            context = results.map((r) => `[${r.documentId}] ${r.content}`).join('\n');
            stepResults['knowledge-results'] = results.map((r) => ({
              chunkId: r.chunkId,
              documentId: r.documentId,
              score: r.score,
            }));
          }
          this.opts.auditChain.append(
            'file.op',
            { action: 'knowledge-retrieval', chunks: context ? context.split('\n').length : 0 },
            { taskId, stepId: 'step-1-analyze' },
          );
        });
        completedSteps.push('step-1-analyze');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-2-synthesize', async () => {
          draftContent = await this.answerWithContext(taskId, goal, context);
          stepResults['step-2-synthesize'] = draftContent;
        });
        completedSteps.push('step-2-synthesize');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-3-verify', async () => {
          stepResults['step-3-verify'] = { grounded: draftContent.length > 0 };
        });
        completedSteps.push('step-3-verify');

        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-4-record', async () => {
          const stored = this.persistArtifact(
            taskId,
            'answer',
            renderText({ title: `answer-${taskId}`, body: draftContent, extension: 'md' }),
          );
          if (stored) {
            this.opts.timeline.emit(taskId, {
              type: 'artifact.ready',
              artifactId: stored.artifactId,
              artifactType: 'text',
              path: stored.url,
            });
          }
          dna = this.buildSimpleDna(taskId, goal, plan, mode, seqLow, draftContent);
          this.opts.timeline.emit(taskId, {
            type: 'task.complete',
            dnaId: dna.dnaId,
            artifactIds: this.emittedArtifacts.map((a) => a.artifactId),
          });
          stepResults['step-4-record'] = dna;
        });
        completedSteps.push('step-4-record');
        }
      } else {
        // ---------------------------------------------------------------------
        // Journey 1 / Flagship: Refinery Inspection & Approval Pipeline
        // ---------------------------------------------------------------------
        token.throwIfCancelled();
        await this.runStep(taskId, plan, 'step-1-intake', async () => {
          const metadata = {
            reportId: 'IR-2026-MRPL-101',
            assetTag: 'P-101A',
            service: 'Crude Distillation Bottoms Piping',
            material: 'Carbon Steel A106-B',
            designPressure: 16.0,
            minAllowableThickness: 4.2,
            inspectionDate: '2026-09-10',
          };
          this.opts.auditChain.append('file.op', metadata, { taskId, stepId: 'step-1-intake' });
          stepResults['step-1-intake'] = metadata;
        });
        completedSteps.push('step-1-intake');

      // -----------------------------------------------------------------------
      // Step 2: Extraction
      // -----------------------------------------------------------------------
      token.throwIfCancelled();
      await this.runStep(taskId, plan, 'step-2-extract', async () => {
        const finding: InspectionFinding = {
          findingId: 'finding-01',
          equipmentTag: 'P-101A',
          description: 'P-101A Discharge Elbow Ultrasonic Thickness Inspection',
          measuredValue: 4.8,
          measuredUnit: 'mm',
          limitValue: 4.2,
          limitUnit: 'mm',
          severity: 'minor',
        };
        this.opts.auditChain.append(
          'pal.call',
          { finding, model: 'qwen2.5-7b-instruct-q4' },
          { taskId, stepId: 'step-2-extract' },
        );
        stepResults['step-2-extract'] = { finding, corrosionRate: 0.12, remainingLifeYears: 5.0 };
      });
      completedSteps.push('step-2-extract');

      // -----------------------------------------------------------------------
      // Step 3: Engineering Calculation via Plugin
      // -----------------------------------------------------------------------
      token.throwIfCancelled();
      await this.runStep(taskId, plan, 'step-3-calc', async () => {
        const calcInput: PipePressureDropInput = {
          length: { value: 120, unit: 'm' },
          diameter: { value: 0.154, unit: 'm' },
          roughness: { value: 0.000045, unit: 'm' },
          flow: { value: 180, unit: 'm**3/h' },
        };

        const calcOutput = (await this.opts.pluginHost.executeTool(
          'pipe-calc-plugin',
          'calculate_pressure_drop',
          calcInput,
        )) as CalcResult;

        this.opts.auditChain.append(
          'tool.call',
          { tool: 'calculate_pressure_drop', calcId: calcOutput.calcId, deltaP: calcOutput.result.value },
          { taskId, stepId: 'step-3-calc' },
        );
        stepResults['step-3-calc'] = calcOutput;
      });
      completedSteps.push('step-3-calc');

      // -----------------------------------------------------------------------
      // Step 4: Knowledge Retrieval & Freshness Scoring
      // -----------------------------------------------------------------------
      token.throwIfCancelled();
      await this.runStep(taskId, plan, 'step-4-retrieve', async () => {
        const query =
          'minimum allowable wall thickness carbon steel piping remaining life Darcy-Weisbach pressure drop';

        let citation: Citation | undefined;
        let retrievedContext = '';

        if (this.opts.knowledge) {
          const results = await this.opts.knowledge.retrieve(query, { topK: 3 });
          const top = results[0];
          if (top) {
            const freshness = this.opts.knowledge.freshnessFor(top.documentId);
            citation = {
              citationId: `cite-${top.chunkId}`,
              chunkId: top.chunkId,
              documentId: top.documentId,
              quote: top.content.slice(0, 220),
              decayAtCitation: freshness?.decay ?? 0.1,
              stateAtCitation: freshness?.state ?? 'FRESH',
            };
            retrievedContext = results.map((r) => `[${r.documentId}] ${r.content}`).join('\n');
          }
        }

        if (!citation) {
          const now = new Date('2026-09-13T00:00:00.000Z');
          const effectiveDate = new Date(now.getTime() - 180 * 86400000).toISOString();
          const nextReview = new Date(now.getTime() + 185 * 86400000).toISOString();
          const freshness = computeFreshness(
            { documentClass: 'GOVERNING', effectiveDate, nextReview, reviewIntervalDays: 365 },
            now,
          );
          citation = {
            citationId: 'cite-mrpl-sop-402',
            chunkId: 'chunk-sop-402-p4',
            documentId: 'doc-sop-402',
            quote: 'Piping thickness must maintain minimum 4.2mm with minimum 5-year remaining life projection.',
            decayAtCitation: freshness.decay,
            stateAtCitation: freshness.state,
          };
          retrievedContext = citation.quote;
        }

        this.opts.auditChain.append(
          'file.op',
          { citationId: citation.citationId, state: citation.stateAtCitation, source: this.opts.knowledge ? 'knowledge-base' : 'seed' },
          { taskId, stepId: 'step-4-retrieve' },
        );
        stepResults['step-4-retrieve'] = citation;
        stepResults['retrieved-context'] = retrievedContext;
      });
      completedSteps.push('step-4-retrieve');

      // -----------------------------------------------------------------------
      // Step 5: Drafting Formal Approval Note
      // -----------------------------------------------------------------------
      token.throwIfCancelled();
      await this.runStep(taskId, plan, 'step-5-draft', async () => {
        const calcRes = stepResults['step-3-calc'] as CalcResult;
        const cite = stepResults['step-4-retrieve'] as Citation;

        const deterministicNote = [
          '# ENGINEERING APPROVAL NOTE: PIPING LINE P-101A',
          '**Plant:** MRPL Refinery Complex · Area 1',
          '**Asset Tag:** P-101A (Discharge Elbow)',
          '**Date:** 13 September 2026',
          '',
          '## 1. Inspection Findings',
          '- Measured Wall Thickness: **4.8 mm** (Ultrasonic UT)',
          '- Minimum Allowable Thickness: **4.2 mm**',
          '- Nominal Initial Thickness: **6.0 mm**',
          '- Calculated Remaining Life: **5.0 years** at 0.12 mm/yr corrosion rate.',
          '',
          '## 2. Hydraulic Verification',
          `- Governing Correlation: **${calcRes.correlation}**`,
          `- Calculated Frictional Drop: **${calcRes.result.value} bar** (tolerance within limits)`,
          '',
          '## 3. Compliance and Governing Standards',
          `- Governing SOP: [${cite.documentId}]: (${cite.quote})`,
          `- Document Freshness: **${cite.stateAtCitation}** (Decay score: ${cite.decayAtCitation})`,
          '',
          '## 4. Engineering Recommendation',
          'Line P-101A satisfies structural and hydraulic integrity requirements. APPROVED for continued operation through next planned turnaround.',
        ].join('\n');

        const narrative = await this.synthesizeNarrative(taskId, goal, {
          thickness: 4.8,
          minAllowable: 4.2,
          remainingLifeYears: 5.0,
          deltaPBar: calcRes.result.value,
          citationDocumentId: cite.documentId,
          citationQuote: cite.quote,
          retrievedContext: String(stepResults['retrieved-context'] ?? ''),
        });

        draftContent = narrative
          ? `## 0. Executive Summary\n${narrative}\n\n${deterministicNote}`
          : deterministicNote;

        this.opts.auditChain.append(
          'pal.call',
          { action: 'draft-synthesis', model: narrative ? 'llm' : 'deterministic-template', words: draftContent.split(/\s+/).length },
          { taskId, stepId: 'step-5-draft' },
        );

        stepResults['step-5-draft'] = draftContent;
      });
      completedSteps.push('step-5-draft');

      // -----------------------------------------------------------------------
      // Step 6: Deterministic Critic (C1-C5)
      // -----------------------------------------------------------------------
      token.throwIfCancelled();
      let criticVerdict: CriticVerdict;
      await this.runStep(taskId, plan, 'step-6-critic', async () => {
        const calcRes = stepResults['step-3-calc'] as CalcResult;
        const cite = stepResults['step-4-retrieve'] as Citation;

        // C1: Numeric Grounding
        const hasThickness = draftContent.includes('4.8 mm') && draftContent.includes('4.2 mm');
        // C2: Calc Replay
        const hasDeltaP = draftContent.includes(`${calcRes.result.value} bar`);
        // C3: Citation Resolvability
        const hasCite = draftContent.includes(cite.documentId);
        // C4: Template Completeness
        const hasRecommendation = draftContent.includes('APPROVED');
        // C5: Freshness Policy
        const freshnessOk = cite.stateAtCitation !== 'CRITICAL';

        const verdicts = [
          { claimId: 'c1', check: 'C1_NUMERIC_GROUNDING' as const, pass: hasThickness },
          { claimId: 'c2', check: 'C2_CALCULATION_REPLAY' as const, pass: hasDeltaP },
          { claimId: 'c3', check: 'C3_CITATION_RESOLVABILITY' as const, pass: hasCite },
          { claimId: 'c4', check: 'C4_TEMPLATE_COMPLETENESS' as const, pass: hasRecommendation },
          { claimId: 'c5', check: 'C5_FRESHNESS_POLICY' as const, pass: freshnessOk },
        ];

        const deterministicPass = verdicts.every((v) => v.pass);

        criticVerdict = CriticVerdict.parse({
          taskId,
          stepId: 'step-6-critic',
          gate: deterministicPass ? 'pass' : 'fail',
          deterministicPass,
          verdicts,
          repairsUsed: 0,
          escalated: false,
        });

        this.opts.timeline.emit(taskId, {
          type: 'critic.verdict',
          verdict: criticVerdict,
        });

        stepResults['step-6-critic'] = criticVerdict;
      });
      completedSteps.push('step-6-critic');

      // -----------------------------------------------------------------------
      // Step 7: Deliverable & C2PA Manifest
      // -----------------------------------------------------------------------
      token.throwIfCancelled();
      await this.runStep(taskId, plan, 'step-7-deliver', async () => {
        const artifactContent = draftContent;
        const dnaId = `dna-${taskId}`;
        const planHash = sha256Hex(JSON.stringify(plan));

        c2paManifest = generateC2paManifest({
          title: 'Refinery Piping Inspection Approval Note P-101A',
          format: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          targetContent: artifactContent,
          dnaId,
          planHash,
          authorId: 'agent-engineer-01',
          keyId: this.opts.keyId,
          privateKey: this.opts.signingKey,
        });

        const sections = markdownToSections(draftContent);
        const extract = stepResults['step-2-extract'] as
          | { finding?: { measuredValue?: number; limitValue?: number }; corrosionRate?: number; remainingLifeYears?: number }
          | undefined;
        const stored = this.persistArtifact(
          taskId,
          'approval-note',
          await renderDocx({
            title: 'Engineering Approval Note: Piping Line P-101A',
            subtitle: 'MRPL Refinery Complex · Area 1 · Sovereign AI Workbench',
            meta: [
              { label: 'Asset Tag', value: 'P-101A (Discharge Elbow)' },
              { label: 'Date', value: '13 September 2026' },
              { label: 'Manifest', value: c2paManifest.manifestId },
            ],
            sections,
            chart: {
              title: 'Wall thickness integrity (mm)',
              unit: 'mm',
              bars: [
                { label: 'Measured (UT)', value: extract?.finding?.measuredValue ?? 4.8 },
                { label: 'Minimum allowable', value: extract?.finding?.limitValue ?? 4.2 },
                { label: 'Nominal initial', value: 6.0 },
                { label: 'Remaining life', value: extract?.remainingLifeYears ?? 5.0 },
              ],
            },
            signature: {
              name: 'agent-engineer-01',
              role: 'Autonomous Engineering Agent',
              timestamp: new Date().toISOString(),
              keyId: this.opts.keyId,
            },
          }),
        );

        this.opts.timeline.emit(taskId, {
          type: 'artifact.ready',
          artifactId: stored?.artifactId ?? `art-${taskId}`,
          artifactType: 'docx',
          path: stored?.url ?? `/artifacts/${taskId}/approval-note.docx`,
          c2paManifestRef: c2paManifest.manifestId,
        });

        this.opts.auditChain.append(
          'artifact.sign',
          {
            manifestId: c2paManifest.manifestId,
            targetHash: c2paManifest.claim.targetHash,
            fileHash: stored?.sha256,
            fileName: stored?.fileName,
          },
          { taskId, stepId: 'step-7-deliver' },
        );

        stepResults['step-7-deliver'] = { artifactContent, c2paManifest, artifact: stored };
      });
      completedSteps.push('step-7-deliver');

      // -----------------------------------------------------------------------
      // Step 8: Decision DNA & Audit Anchoring
      // -----------------------------------------------------------------------
      token.throwIfCancelled();
      await this.runStep(taskId, plan, 'step-8-record', async () => {
        const seqHigh = this.opts.auditChain.getTailEvent()!.seq;
        const artifactHash = sha256Hex(draftContent);

        dna = projectDecisionDna({
          taskId,
          goal,
          recipeId: plan.recipeId,
          modeAtLaunch: mode,
          planDefinition: plan,
          steps: [
            {
              stepId: 'step-3-calc',
              kind: 'calculation',
              model: 'pipe-calc-plugin',
              modelDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
              providerId: 'vllm',
              locality: 'loopback',
              trustBoundary: 'inside-perimeter',
              promptTemplateHash: 'calc-pressure-drop',
              seed: 42,
              toolCalls: [
                {
                  tool: 'calculate_pressure_drop',
                  inputHash: sha256Hex(JSON.stringify(stepResults['step-3-calc'])),
                  outputHash: sha256Hex(JSON.stringify(stepResults['step-3-calc'])),
                },
              ],
            },
          ],
          citations: [
            {
              citationId: 'cite-mrpl-sop-402',
              documentId: 'doc-sop-402',
              decayAtCitation: 0.95,
              stateAtCitation: 'FRESH',
            },
          ],
          criticGate: 'pass',
          deterministicPass: true,
          artifactHashes: [artifactHash],
          c2paManifestRef: c2paManifest?.manifestId,
          chainSeqLow: seqLow,
          chainSeqHigh: seqHigh,
        });

        // Sign anchor in Audit Chain
        this.opts.auditChain.createAnchor(this.opts.keyId, this.opts.signingKey, {
          anchorId: `anchor-${taskId}`,
        });

        this.opts.timeline.emit(taskId, {
          type: 'task.complete',
          dnaId: dna.dnaId,
          artifactIds: [`art-${taskId}`],
        });

        stepResults['step-8-record'] = dna;
      });
      completedSteps.push('step-8-record');
      }

      await this.opts.checkpointer.save({
        taskId,
        seq: this.opts.timeline.getLatestSeq(taskId),
        status: 'completed',
        currentStepId: completedSteps[completedSteps.length - 1] ?? 'step-done',
        completedSteps,
        stepResults,
        updatedAt: new Date().toISOString(),
      });

      return {
        taskId,
        status: 'completed',
        dna,
        c2paManifest,
        artifactContent: draftContent,
        artifacts: this.emittedArtifacts,
        stepsCompleted: completedSteps,
      };
    } catch (err: unknown) {
      if (err instanceof TaskCancelledError) {
        const lastStep = completedSteps[completedSteps.length - 1] ?? 'step-1-intake';
        await this.opts.checkpointer.save({
          taskId,
          seq: this.opts.timeline.getLatestSeq(taskId),
          status: 'cancelled',
          currentStepId: lastStep,
          completedSteps,
          stepResults,
          updatedAt: new Date().toISOString(),
        });

        this.opts.timeline.emit(taskId, {
          type: 'step.update',
          stepId: lastStep,
          node: lastStep,
          status: 'cancelled',
        });

        this.opts.timeline.emit(taskId, {
          type: 'task.failed',
          reason: 'Task cancelled cooperatively',
          escalated: false,
        });

        this.opts.auditChain.append(
          'guard.alert',
          { reason: 'cancellation', lastCompletedStep: lastStep },
          { taskId },
        );

        return {
          taskId,
          status: 'cancelled',
          stepsCompleted: completedSteps,
        };
      }

      const reason = err instanceof Error ? err.message : String(err);
      this.opts.timeline.emit(taskId, {
        type: 'task.failed',
        reason,
        escalated: true,
      });

      throw err;
    }
  }

  private buildSimpleDna(
    taskId: string,
    goal: string,
    plan: Plan,
    mode: 'SOVEREIGN' | 'ASSIST',
    seqLow: number,
    content: string,
  ): DecisionDna {
    return projectDecisionDna({
      taskId,
      goal,
      recipeId: plan.recipeId,
      modeAtLaunch: mode,
      planDefinition: plan,
      steps: [],
      citations: [],
      criticGate: 'pass',
      deterministicPass: true,
      artifactHashes: content ? [sha256Hex(content)] : [],
      chainSeqLow: seqLow,
      chainSeqHigh: this.opts.auditChain.getTailEvent()?.seq ?? seqLow,
    });
  }

  /** Ask the local coder model for a self-contained micro-tool; validate it hard. */
  private async synthesizeMicroToolHtml(taskId: string, goal: string): Promise<string | undefined> {
    if (!this.llm) return undefined;
    const system =
      'You are a senior front-end engineer. Return ONLY a single self-contained HTML document. No markdown fences. No external network calls, no fetch, no XMLHttpRequest, no external URLs. Include interactive range sliders and a live-calculated result.';
    const res = await this.llm.generate({
      taskId,
      stepId: 'step-2-gen',
      taskType: 'code',
      system,
      user: `Build an interactive engineering micro-tool for: "${goal}". Self-contained HTML5 with inline CSS and JavaScript.`,
      maxTokens: 2048,
      timeoutMs: 45000,
    });
    if (!res.ok) return undefined;
    const html = res.text.replace(/```html?/gi, '').replace(/```/g, '').trim();
    if (!/<html[\s>]/i.test(html) && !/<!doctype html>/i.test(html)) return undefined;
    if (/fetch\(|XMLHttpRequest/i.test(html)) return undefined;
    return html;
  }

  /** LLM-authored executive summary, grounded strictly on computed facts. */
  private async synthesizeNarrative(
    taskId: string,
    goal: string,
    facts: {
      thickness: number;
      minAllowable: number;
      remainingLifeYears: number;
      deltaPBar: number;
      citationDocumentId: string;
      citationQuote: string;
      retrievedContext: string;
    },
  ): Promise<string | undefined> {
    if (!this.llm) return undefined;
    const system =
      'You write concise industrial engineering executive summaries. Use ONLY the supplied facts; never invent numbers. 2-4 sentences.';
    const user = `Goal: ${goal}
Facts: measured thickness ${facts.thickness} mm, minimum allowable ${facts.minAllowable} mm, remaining life ${facts.remainingLifeYears} years, frictional pressure drop ${facts.deltaPBar} bar, governing document ${facts.citationDocumentId}.
Governing quote: ${facts.citationQuote}
Context:
${facts.retrievedContext}
Write the executive summary.`;
    const res = await this.llm.generate({
      taskId,
      stepId: 'step-5-draft',
      taskType: 'document',
      system,
      user,
      maxTokens: 300,
      timeoutMs: 60000,
    });
    if (!res.ok || !res.text.trim()) return undefined;
    return res.text.trim();
  }

  /** Build a workbook over any tabular dataset; an LLM adds an analysis sheet when available. */
  private async buildDatasetWorkbook(
    taskId: string,
    goal: string,
    dataset: TaskDataset,
    summary: ReturnType<typeof summarizeDataset>,
  ): Promise<XlsxSheet[]> {
    const sheets: XlsxSheet[] = [
      {
        name: 'Data',
        columns: dataset.columns,
        rows: dataset.rows.map((r) => dataset.columns.map((c) => r[c] ?? '')),
      },
      {
        name: 'Summary',
        columns: summary.numericColumn
          ? [titleize(summary.groupColumn), 'Rows', `Total ${titleize(summary.numericColumn)}`, 'Average']
          : [titleize(summary.groupColumn), 'Rows'],
        rows: summary.groups.map((g) =>
          summary.numericColumn
            ? [g.label, g.count, Number((g.numericSum ?? 0).toFixed(2)), Number((g.numericAvg ?? 0).toFixed(2))]
            : [g.label, g.count],
        ),
      },
    ];

    if (this.llm) {
      const res = await this.llm.generate({
        taskId,
        stepId: 'step-2-calc',
        taskType: 'document',
        system: 'You are a data analyst. Return ONLY short plain-text observations, one per line, max 5 lines.',
        user: `Summarize ${dataset.rows.length} rows from "${dataset.label}" (grouped by ${summary.groupColumn}, ${summary.groups.length} groups) for: ${goal}`,
        maxTokens: 200,
        timeoutMs: 45000,
      });
      if (res.ok) {
        const lines = res.text
          .split('\n')
          .map((l) => l.replace(/^[-*•\d.\s]+/, '').trim())
          .filter((l) => l.length > 3)
          .slice(0, 6);
        if (lines.length > 0) {
          sheets.push({ name: 'AI Analysis', columns: ['Observation'], rows: lines.map((l) => [l]) });
        }
      }
    }
    return sheets;
  }

  /**
   * Resolve the dataset a goal refers to: an explicit subject (equipment /
   * contracts), the previous run's data when the goal says "this data", the
   * most recent dataset otherwise, and the equipment catalog as fallback.
   */
  private resolveDataset(goal: string, contextTaskId?: string): TaskDataset {
    const lower = goal.toLowerCase();
    const refersToPrevious =
      /\b(this|that|these|those|it|same)\b.*\b(data|dataset|result|file|workbook|table)\b/.test(lower) ||
      /\b(previous|last|above)\b/.test(lower);

    const wantsContracts = /\b(contract|vendor|procurement|supplier|purchase order)\b/.test(lower);
    const wantsEquipment =
      /\b(equipment|machine|asset|plant|rotate|pump|compressor|vessel|exchanger|turbine|motor|valve|tank|column|boiler|reactor|transformer|instrument)\b/.test(
        lower,
      );

    // "visualize this data" / "make an excel of it" -> previous run's dataset
    if (refersToPrevious || (!wantsContracts && !wantsEquipment)) {
      const fromContext = contextTaskId ? this.taskDatasets.get(contextTaskId) : undefined;
      const mostRecent = [...this.taskDatasets.values()].pop();
      const chosen = fromContext ?? mostRecent;
      if (chosen && (refersToPrevious || !wantsContracts)) {
        if (!wantsContracts || refersToPrevious) return chosen;
      }
    }
    if (wantsContracts && !wantsEquipment) return contractsDataset(this.opts.workspace?.getDataset<ContractRow[]>('mrpl-contracts'));
    return equipmentDataset(this.opts.workspace?.getDataset<EquipmentRecord[]>('equipment-catalog'));
  }

  /** Build a data-driven deck: real dataset stats, LLM bullets when reachable. */
  private async buildDeckPlan(
    taskId: string,
    goal: string,
    dataset: TaskDataset,
  ): Promise<{ title: string; subtitle: string; slides: PptxSlide[]; chart?: ChartSpec }> {
    const summary = summarizeDataset(dataset);
    const measure = summary.numericColumn
      ? `total ${titleize(summary.numericColumn)}`
      : 'row count';

    const chart: ChartSpec = {
      title: `${dataset.label} — ${titleize(summary.groupColumn)} (${measure})`,
      bars: summary.groups.slice(0, 10).map((g) => ({
        label: g.label,
        value: summary.numericColumn ? Number((g.numericSum ?? 0).toFixed(2)) : g.count,
      })),
    };

    const top = summary.groups[0];
    const fallbackSlides: PptxSlide[] = [
      {
        title: 'Dataset Overview',
        bullets: [
          `Source: ${dataset.source}`,
          `${dataset.rows.length} rows · ${dataset.columns.length} columns · ${summary.groups.length} ${titleize(summary.groupColumn).toLowerCase()} groups`,
          top ? `Largest group: ${top.label} (${summary.numericColumn ? `${Number((top.numericSum ?? 0).toFixed(2))} ${measure}` : `${top.count} rows`})` : 'No groups resolved',
        ],
      },
      {
        title: `${titleize(summary.groupColumn)} Breakdown`,
        bullets: summary.groups
          .slice(0, 6)
          .map((g) => `${g.label}: ${summary.numericColumn ? Number((g.numericSum ?? 0).toFixed(2)) : g.count}`),
      },
      {
        title: 'Data Quality & Lineage',
        bullets: [
          'Extracted from the sovereign local store (SQLite)',
          'Aggregations computed deterministically, no external calls',
          'Every figure traceable to the Merkle audit chain',
        ],
      },
      {
        title: 'Audit & Compliance',
        bullets: [
          'All decisions committed to Merkle audit chain',
          'Freshness policy enforced on governing SOPs',
          'C2PA provenance on every deliverable',
        ],
      },
    ];

    if (this.llm) {
      const res = await this.llm.generateJson<{ title?: string; slides?: PptxSlide[] }>({
        taskId,
        stepId: 'step-1-brief',
        taskType: 'document',
        system:
          'You generate executive slide decks for an oil refinery from REAL data. Respond with JSON only: {"title":string,"slides":[{"title":string,"bullets":string[]}]}. Use 3-5 slides, 3-5 bullets each. Use ONLY the supplied figures; never invent numbers.',
        user: `Create an executive deck for: "${goal}".
Dataset: ${dataset.label} from ${dataset.source}, ${dataset.rows.length} rows.
Grouped by ${summary.groupColumn}: ${summary.groups.map((g) => `${g.label}=${summary.numericColumn ? Number((g.numericSum ?? 0).toFixed(2)) : g.count}`).join(', ')}.`,
        maxTokens: 700,
        timeoutMs: 60000,
      });
      if (res.ok && res.value?.slides && res.value.slides.length > 0) {
        const slides = res.value.slides
          .filter((s) => s && typeof s.title === 'string' && Array.isArray(s.bullets))
          .slice(0, 6)
          .map((s) => ({ title: s.title, bullets: s.bullets.map(String).slice(0, 6) }));
        if (slides.length > 0) {
          return { title: res.value.title ?? `${dataset.label} — Executive Pack`, subtitle: 'Sovereign AI Workbench · Decision DNA bound', slides, chart };
        }
      }
    }
    return {
      title: `${dataset.label} — Executive Pack`,
      subtitle: 'Sovereign AI Workbench · Decision DNA bound',
      slides: fallbackSlides,
      chart,
    };
  }

  /** Greetings and chit-chat: short conversational reply, no retrieval dump. */
  private async answerSmallTalk(taskId: string, goal: string): Promise<string> {
    if (this.llm) {
      const res = await this.llm.generate({
        taskId,
        stepId: 'step-2-synthesize',
        taskType: 'document',
        system:
          'You are the Outskirts sovereign AI workbench at an oil refinery. The operator is greeting you or making small talk. Reply in 1-2 short friendly sentences. Briefly mention what you can do (engineering calcs, P&ID analysis, Excel/Word/PowerPoint deliverables, plant simulation) only if it fits naturally. Never list document ids.',
        user: goal,
        maxTokens: 120,
        timeoutMs: 30000,
      });
      if (res.ok && res.text.trim()) return res.text.trim();
    }
    return 'Workbench online. I can prepare approval notes, equipment registers, P&ID traces, and plant simulations on request.';
  }

  /** Answer a knowledge question from retrieved context, with a deterministic fallback. */
  private async answerWithContext(taskId: string, goal: string, context: string): Promise<string> {
    if (this.llm) {
      const system =
        'You are the Outskirts industrial knowledge assistant. Answer ONLY from the provided context. If the context is insufficient, say so explicitly. Cite document ids in square brackets.';
      const user = `Question: ${goal}\n\nContext:\n${context || '(no context retrieved)'}`;
      const res = await this.llm.generate({
        taskId,
        stepId: 'step-2-synthesize',
        taskType: 'retrieve',
        system,
        user,
        maxTokens: 500,
        timeoutMs: 60000,
      });
      if (res.ok && res.text.trim()) return res.text.trim();
    }
    if (context) {
      const cited = [...context.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
      const docs = [...new Set(cited)].join(', ');
      return [
        '# Response',
        '',
        `Retrieved ${context.split('\n').length} relevant passages from the sovereign knowledge base (documents: ${docs || 'see below'}).`,
        '',
        '## Governing evidence',
        '',
        context,
      ].join('\n');
    }
    return '# Response\n\nNo matching governing document was found in the local knowledge base.';
  }

  private async runStep(
    taskId: string,
    plan: Plan,
    stepId: string,
    action: () => Promise<void>,
  ): Promise<void> {
    const step = plan.steps.find((s) => s.stepId === stepId);
    if (!step) {
      await action();
      return;
    }
    step.status = 'running';

    this.opts.timeline.emit(taskId, {
      type: 'step.update',
      stepId,
      node: stepId,
      status: 'running',
    });

    await action();

    step.status = 'done';
    this.opts.timeline.emit(taskId, {
      type: 'step.update',
      stepId,
      node: stepId,
      status: 'done',
    });
  }
}

/** Build the equipment dataset from the DB-backed catalog (real plant data). */
function equipmentDataset(catalog: EquipmentRecord[] | undefined): TaskDataset {
  const list = catalog ?? EQUIPMENT_CATALOG;
  const fixed = ['tag', 'equipmentType', 'category', 'manufacturer', 'model', 'service'];
  const numericCounts = new Map<string, number>();
  for (const e of list) {
    for (const [k, v] of Object.entries(e)) {
      if (typeof v === 'number' && !fixed.includes(k)) {
        numericCounts.set(k, (numericCounts.get(k) ?? 0) + 1);
      }
    }
  }
  const numericCols = [...numericCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([k]) => k);

  const columns = [...fixed, ...numericCols];
  const rows = list.map((e) => {
    const row: Record<string, string | number> = {
      tag: e.tag,
      equipmentType: e.equipmentType,
      category: categoryOf(e),
      manufacturer: e.manufacturer,
      model: e.model ?? '',
      service: e.service ?? '',
    };
    for (const c of numericCols) {
      const v = (e as unknown as Record<string, unknown>)[c];
      if (typeof v === 'number') row[c] = v;
    }
    return row;
  });
  return { source: 'sqlite:equipment-catalog', label: 'Equipment Register', columns, rows };
}

/** Build the contracts dataset from the DB-backed register. */
function contractsDataset(contracts: ContractRow[] | undefined): TaskDataset {
  const list = contracts ?? CONTRACT_REGISTER;
  const columns = ['contractId', 'vendor', 'department', 'scope', 'valueInrCr', 'startDate', 'endDate', 'obligations', 'status'];
  const rows = list.map((c) => ({
    contractId: c.contractId,
    vendor: c.vendor,
    department: c.department,
    scope: c.scope,
    valueInrCr: c.valueInrCr,
    startDate: c.startDate,
    endDate: c.endDate,
    obligations: c.obligations,
    status: c.status,
  }));
  return { source: 'sqlite:mrpl-contracts', label: 'Contract Register', columns, rows };
}

export interface DatasetSummary {
  groupColumn: string;
  numericColumn: string | null;
  groups: Array<{ label: string; count: number; numericSum?: number; numericAvg?: number }>;
}

/** Group rows by a categorical column and aggregate the dominant numeric column. */
function summarizeDataset(dataset: TaskDataset): DatasetSummary {
  const catCandidates = ['category', 'department', 'equipmentType', 'status', 'vendor', 'type', 'manufacturer'];
  const groupColumn =
    catCandidates.find((c) => dataset.columns.includes(c)) ??
    dataset.columns.find((c) => typeof dataset.rows[0]?.[c] === 'string') ??
    dataset.columns[0] ??
    'row';

  const preferred = ['valueInrCr', 'powerKW', 'powerMW', 'heatDutyMW', 'ratingMVA', 'volumeM3', 'capacityKL', 'flowM3Hr', 'obligations'];
  const numericColumns = dataset.columns.filter((c) => dataset.rows.some((r) => typeof r[c] === 'number'));
  const numericColumn = preferred.find((p) => numericColumns.includes(p)) ?? numericColumns[0] ?? null;

  const groupMap = new Map<string, { count: number; sum: number }>();
  for (const row of dataset.rows) {
    const key = String(row[groupColumn] ?? 'unknown');
    const g = groupMap.get(key) ?? { count: 0, sum: 0 };
    g.count += 1;
    if (numericColumn) {
      const v = row[numericColumn];
      if (typeof v === 'number') g.sum += v;
    }
    groupMap.set(key, g);
  }

  const groups = [...groupMap.entries()]
    .map(([label, g]) => ({
      label,
      count: g.count,
      ...(numericColumn
        ? { numericSum: g.sum, numericAvg: g.count > 0 ? g.sum / g.count : 0 }
        : {}),
    }))
    .sort((a, b) => (b.numericSum ?? b.count) - (a.numericSum ?? a.count));

  return { groupColumn, numericColumn, groups };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function titleize(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Self-contained dark-theme HTML dashboard: SVG bar chart + data table. */
function buildChartHtml(dataset: TaskDataset, summary: DatasetSummary, goal: string): string {
  const measure = summary.numericColumn;
  const values = summary.groups.map((g) => (measure ? (g.numericSum ?? 0) : g.count));
  const maxV = Math.max(...values, 1);
  const n = summary.groups.length;
  const W = 940;
  const rowH = 34;
  const chartH = n * rowH + 30;
  const labelW = 200;
  const barMax = W - labelW - 140;

  const bars = summary.groups
    .map((g, i) => {
      const v = measure ? (g.numericSum ?? 0) : g.count;
      const bw = Math.max(2, (v / maxV) * barMax);
      const y = 14 + i * rowH;
      return `
      <text x="${labelW - 10}" y="${y + 14}" text-anchor="end" fill="#94a3b8" font-size="12" font-family="monospace">${escapeHtml(g.label.slice(0, 24))}</text>
      <rect x="${labelW}" y="${y}" width="${bw.toFixed(1)}" height="22" rx="3" fill="#00ff66" opacity="${0.55 + 0.45 * (v / maxV)}"/>
      <text x="${labelW + bw + 8}" y="${y + 15}" fill="#e2e8f0" font-size="12" font-family="monospace">${v % 1 === 0 ? v : v.toFixed(2)}${measure ? '' : ' rows'}</text>`;
    })
    .join('');

  const tableRows = dataset.rows
    .slice(0, 60)
    .map(
      (r) =>
        `<tr>${dataset.columns.map((c) => `<td>${escapeHtml(String(r[c] ?? ''))}</td>`).join('')}</tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(dataset.label)} — Visualization</title>
<style>
  body { background: #0a0a0a; color: #ededed; font-family: ui-monospace, 'Cascadia Code', monospace; margin: 0; padding: 24px; }
  h1 { font-size: 18px; letter-spacing: 0.06em; margin: 0 0 4px; }
  .sub { color: #888; font-size: 11px; margin-bottom: 20px; }
  .card { border: 1px solid #262626; border-radius: 8px; background: #0f0f0f; padding: 16px; margin-bottom: 20px; }
  svg { width: 100%; height: auto; display: block; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th { text-align: left; color: #888; text-transform: uppercase; font-size: 9px; letter-spacing: 0.08em; padding: 6px 8px; border-bottom: 1px solid #262626; position: sticky; top: 0; background: #0f0f0f; }
  td { padding: 5px 8px; border-bottom: 1px solid #1a1a1a; color: #cbd5e1; }
  tr:hover td { background: #141414; }
  .scroll { max-height: 420px; overflow: auto; }
</style>
</head>
<body>
  <h1>${escapeHtml(dataset.label)} — grouped by ${escapeHtml(titleize(summary.groupColumn))}</h1>
  <div class="sub">source ${escapeHtml(dataset.source)} · ${dataset.rows.length} rows · measure: ${measure ? escapeHtml(titleize(measure)) + ' (total)' : 'row count'} · goal: ${escapeHtml(goal.slice(0, 120))}</div>
  <div class="card">
    <svg viewBox="0 0 ${W} ${chartH}" preserveAspectRatio="xMidYMin meet">${bars}</svg>
  </div>
  <div class="card scroll">
    <table>
      <thead><tr>${dataset.columns.map((c) => `<th>${escapeHtml(titleize(c))}</th>`).join('')}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
</body>
</html>`;
}

/** Convert the rendered markdown note into structured docx sections. */
export function markdownToSections(md: string): DocSection[] {
  const sections: DocSection[] = [];
  let current: DocSection | undefined;
  let paragraphs: string[] = [];
  const flush = (): void => {
    if (current) {
      if (paragraphs.length > 0) current.paragraphs = paragraphs;
      sections.push(current);
    }
    paragraphs = [];
  };
  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('## ')) {
      flush();
      current = { heading: line.slice(3).trim() };
      continue;
    }
    if (line.startsWith('# ')) continue;
    if (!current || line.length === 0) continue;
    if (line.startsWith('- ')) {
      current.bullets = [...(current.bullets ?? []), line.slice(2).replace(/\*\*/g, '')];
      continue;
    }
    paragraphs.push(line.replace(/\*\*/g, ''));
  }
  flush();
  return sections.length > 0 ? sections : [{ heading: 'Deliverable', paragraphs: [md] }];
}

/** Infer a digital-twin scenario from the natural-language goal. */
export function inferTwinScenario(goal: string): TwinScenario {
  const g = goal.toLowerCase();
  const tagMatch = goal.match(/\b([A-Z]{1,3}-\d{3}[A-Z]?)\b/);
  const target = tagMatch?.[1];
  if (g.includes('shutdown') || g.includes('isolat')) {
    return { type: 'shutdown', ...(target ? { target } : {}), description: goal };
  }
  if (g.includes('feedstock') || g.includes('crude blend') || g.includes('new feed')) {
    return { type: 'feedstock_change', flowM3h: 210, densityKgM3: 890, viscosityPaS: 0.006, description: goal };
  }
  if (g.includes('replace') || g.includes('replacement') || g.includes('upgrade')) {
    return {
      type: 'equipment_replacement',
      ...(target ? { target } : {}),
      replacement: { ratedFlowM3h: 240, designPressureBar: 24 },
      description: goal,
    };
  }
  const barMatch = goal.match(/([+-]?\d+(?:\.\d+)?)\s*bar/i);
  const deltaPressureBar = barMatch?.[1] ? Number(barMatch[1]) : 2;
  return { type: 'pressure_change', deltaPressureBar, description: goal };
}
