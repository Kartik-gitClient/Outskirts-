import { randomUUID } from 'node:crypto';
import type { Plan, PlanStep, TaskType } from '@outskirts/schemas';
import type { PAL } from '@outskirts/pal';

export type WorkflowIntent =
  | 'REPORT_APPROVAL'
  | 'MICROTOOL_CODE'
  | 'PID_ANALYSIS'
  | 'SPREADSHEET_EXCEL'
  | 'PRESENTATION_DECK'
  | 'DIGITAL_TWIN'
  | 'KNOWLEDGE_QA'
  | 'VISUALIZATION'
  | 'CUSTOM_GOAL';

export interface PlanGenerationResult {
  intent: WorkflowIntent;
  plan: Plan;
  suggestedArtifactType: 'docx' | 'microtool' | 'drawing' | 'xlsx' | 'pptx' | 'html' | 'text';
}

/** Greetings / small talk: answered conversationally, never via retrieval. */
export function isSmallTalk(goal: string): boolean {
  const t = goal.trim().toLowerCase().replace(/[!.?,]+$/, '').trim();
  if (t.length > 60) return false;

  // Pure filler replies: "ok", "cool", "thanks", "sure", "bye"...
  if (/^(ok|okay|k|cool|nice|great|thanks|thank you|ty|bye|goodbye|good night|see you|got it|sure|yes|no|yep|nope)$/.test(t)) {
    return true;
  }

  // Greeting prefix — only small talk if the rest is just pleasantries,
  // never when a real instruction follows ("hi make me an excel file").
  const greeting = /^(hi|hey|hello|yo|sup|hiya|greetings|good (morning|afternoon|evening)|namaste|hola)\b/.exec(t);
  if (greeting) {
    const rest = t.slice(greeting[0].length).trim();
    if (rest.length === 0) return true;
    if (/^(there|all|everyone|buddy|bro|dear|team|folks)?\s*$/.test(rest)) return true;
    if (/^(how are you|how's it going|how are things|what's up|whats up|you good)\b/.test(rest)) return true;
    return false;
  }

  if (t.length < 30 && /\b(how are you|how's it going|how are things|what's up|whats up|you good)\b/.test(t)) return true;
  if (/^(ok|okay|cool|nice|great|thanks|thank you)\b/.test(t) && t.length <= 25 && !/\b(make|create|build|generate|produce|run|show|pull|extract|visuali[sz]e|simulate|trace|add|open|start)\b/.test(t)) {
    return true;
  }
  return false;
}

/**
 * Dynamic Agentic Planner (PDD Section 5 & TDD Section 5)
 * Decomposes natural language industrial goals into typed, acyclic step DAGs.
 */
export class DynamicAgentPlanner {
  constructor(private pal?: PAL) {}

  public async planGoal(
    taskId: string,
    goal: string,
    _context?: { projectId?: string; files?: string[] },
  ): Promise<PlanGenerationResult> {
    const lower = goal.toLowerCase();

    // 1. Classify intent. CUSTOM_GOAL is the fallback: only an explicit
    // approval/report phrasing may enter the canned inspection journey.
    let intent: WorkflowIntent = 'CUSTOM_GOAL';
    let suggestedArtifactType: PlanGenerationResult['suggestedArtifactType'] = 'text';

    // A question with no action verb is answering, not authoring. Without this,
    // "what is the minimum wall thickness?" ran the full approval-note pipeline.
    const isQuestion =
      /^(what|how|why|which|who|where|when|is|are|do|does|can)\b/.test(lower.trim()) || lower.trim().endsWith('?');
    const isAction =
      /\b(produce|make|generate|create|build|write|compile|analyse|analyze|scan|run|simulate|draft|prepare|trace|visualize|visualise|plot|chart|graph|show)\b/.test(
        lower,
      );

    if (
      /\b(visuali[sz]e|visualisation|visualization|chart|graph|plot|dashboard)\b/.test(lower) ||
      (/\b(show|draw)\b/.test(lower) && /\b(data|trend|comparison|distribution)\b/.test(lower))
    ) {
      intent = 'VISUALIZATION';
      suggestedArtifactType = 'html';
    } else if (
      lower.includes('digital twin') ||
      lower.includes('simulate') ||
      lower.includes('simulation') ||
      lower.includes('what-if') ||
      lower.includes('what if') ||
      lower.includes('shutdown') ||
      lower.includes('feedstock') ||
      lower.includes('equipment replacement') ||
      lower.includes('scenario')
    ) {
      intent = 'DIGITAL_TWIN';
      suggestedArtifactType = 'docx';
    } else if (
      lower.includes('p&id') ||
      lower.includes('drawing') ||
      lower.includes('diagram') ||
      lower.includes('isolation') ||
      lower.includes('valve') ||
      lower.includes('topology') ||
      lower.includes('what feeds') ||
      lower.includes('what does')
    ) {
      intent = 'PID_ANALYSIS';
      suggestedArtifactType = 'drawing';
    } else if (isQuestion && !isAction) {
      intent = 'KNOWLEDGE_QA';
      suggestedArtifactType = 'text';
    } else if (
      lower.includes('report') ||
      lower.includes('approval') ||
      lower.includes('thickness') ||
      lower.includes('inspection') ||
      lower.includes('corrosion') ||
      lower.includes('darcy')
    ) {
      intent = 'REPORT_APPROVAL';
      suggestedArtifactType = 'docx';
    } else if (
      /micro-?tool|calculator|flange|sandbox tool|html tool|web app|mini app|single-page app/.test(lower) ||
      (/\btools?\b/.test(lower) && /\b(build|make|create|generate|design|interactive)\b/.test(lower)) ||
      (/\bapp\b/.test(lower) && /\b(build|make|create|generate|interactive|calculator|tool)\b/.test(lower)) ||
      /\bwrite code\b|\bgenerate code\b|\bcode for\b/.test(lower)
    ) {
      intent = 'MICROTOOL_CODE';
      suggestedArtifactType = 'microtool';
    } else if (lower.includes('excel') || lower.includes('spreadsheet') || lower.includes('workbook')) {
      intent = 'SPREADSHEET_EXCEL';
      suggestedArtifactType = 'xlsx';
    } else if (lower.includes('deck') || lower.includes('powerpoint') || lower.includes('presentation') || lower.includes('slides')) {
      intent = 'PRESENTATION_DECK';
      suggestedArtifactType = 'pptx';
    }

    // 2. Build DAG steps based on intent
    let steps: PlanStep[] = [];

    // Small talk gets a minimal 2-step plan — it must never run retrieval
    // or render a 4-step engineering pipeline for "hi".
    if (intent === 'KNOWLEDGE_QA' || intent === 'CUSTOM_GOAL') {
      if (isSmallTalk(goal)) {
        steps = [
          {
            stepId: 'step-1-greet',
            kind: 'document',
            description: 'Compose conversational response',
            dependsOn: [],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-2-record',
            kind: 'document',
            description: 'Record interaction in Merkle Audit Chain',
            dependsOn: ['step-1-greet'],
            plugins: [],
            status: 'pending',
          },
        ];
        return {
          intent,
          plan: {
            taskId,
            recipeId: `recipe-${intent.toLowerCase()}`,
            steps,
          },
          suggestedArtifactType: 'text',
        };
      }
    }

    switch (intent) {
      case 'REPORT_APPROVAL':
        steps = [
          {
            stepId: 'step-1-intake',
            kind: 'document',
            description: 'Acquire inspection report and extract operating parameters and ultrasonic scans',
            dependsOn: [],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-2-extract',
            kind: 'document',
            description: 'Extract minimum allowable thickness and corrosion rate figures',
            dependsOn: ['step-1-intake'],
            plugins: [],
            outputSchemaRef: 'InspectionFinding',
            status: 'pending',
          },
          {
            stepId: 'step-3-calc',
            kind: 'calculation',
            description: 'Execute Darcy-Weisbach frictional pressure drop calculation via sovereign physics plugin',
            dependsOn: ['step-2-extract'],
            plugins: ['pipe-calc-plugin'],
            outputSchemaRef: 'PipePressureDropResponse',
            status: 'pending',
          },
          {
            stepId: 'step-4-retrieve',
            kind: 'retrieve',
            description: 'Retrieve governing refinery standards and check SOP freshness decay',
            dependsOn: ['step-2-extract'],
            plugins: [],
            outputSchemaRef: 'Citation',
            status: 'pending',
          },
          {
            stepId: 'step-5-draft',
            kind: 'document',
            description: 'Synthesize formal approval note integrating findings, calculations, and citations',
            dependsOn: ['step-3-calc', 'step-4-retrieve'],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-6-critic',
            kind: 'document',
            description: 'Execute deterministic critic verification (C1 grounding, C2 calc replay, C3 citation, C4 format, C5 freshness)',
            dependsOn: ['step-5-draft'],
            plugins: [],
            outputSchemaRef: 'CriticVerdict',
            status: 'pending',
          },
          {
            stepId: 'step-7-deliver',
            kind: 'document',
            description: 'Render deliverable document (.docx) and bind C2PA provenance manifest',
            dependsOn: ['step-6-critic'],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-8-record',
            kind: 'document',
            description: 'Commit task lineage into Merkle Audit Chain and sign Decision DNA root',
            dependsOn: ['step-7-deliver'],
            plugins: [],
            outputSchemaRef: 'DecisionDna',
            status: 'pending',
          },
        ];
        break;

      case 'MICROTOOL_CODE':
        steps = [
          {
            stepId: 'step-1-req',
            kind: 'code',
            description: `Structure UI specification and physics equations for goal: "${goal}"`,
            dependsOn: [],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-2-gen',
            kind: 'code',
            description: 'Synthesize self-contained single-page HTML5/JS interactive application',
            dependsOn: ['step-1-req'],
            plugins: ['code-sandbox'],
            status: 'pending',
          },
          {
            stepId: 'step-3-sandbox',
            kind: 'code',
            description: 'Verify execution inside zero-privilege iframe sandbox with network disabled (CSP default-src none)',
            dependsOn: ['step-2-gen'],
            plugins: ['code-sandbox'],
            status: 'pending',
          },
          {
            stepId: 'step-4-export',
            kind: 'document',
            description: 'Generate watermarked export package with Decision DNA lineage record',
            dependsOn: ['step-3-sandbox'],
            plugins: [],
            outputSchemaRef: 'DecisionDna',
            status: 'pending',
          },
        ];
        break;

      case 'PID_ANALYSIS':
        steps = [
          {
            stepId: 'step-1-vision',
            kind: 'vision',
            description: 'Scan P&ID drawing raster using vision specialist model (Qwen2.5-VL)',
            dependsOn: [],
            plugins: [],
            outputSchemaRef: 'PidExtraction',
            status: 'pending',
          },
          {
            stepId: 'step-2-symbols',
            kind: 'document',
            description: 'Detect ISA-5.1 tags, instrument bubbles, and equipment bounding boxes',
            dependsOn: ['step-1-vision'],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-3-topology',
            kind: 'retrieve',
            description: 'Construct GraphRAG directed multigraph of piping lines and equipment connectivity',
            dependsOn: ['step-2-symbols'],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-4-isolation',
            kind: 'calculation',
            description: 'Resolve upstream and downstream block valves for isolation boundary',
            dependsOn: ['step-3-topology'],
            plugins: ['control-valve-calc-plugin'],
            status: 'pending',
          },
          {
            stepId: 'step-5-summary',
            kind: 'document',
            description: 'Synthesize P&ID audit summary and commit to audit chain',
            dependsOn: ['step-4-isolation'],
            plugins: [],
            outputSchemaRef: 'DecisionDna',
            status: 'pending',
          },
        ];
        break;

      case 'DIGITAL_TWIN':
        steps = [
          {
            stepId: 'step-1-model',
            kind: 'document',
            description: 'Load the virtual CDU feed-train model (equipment, piping, design envelopes)',
            dependsOn: [],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-2-simulate',
            kind: 'calculation',
            description: 'Execute the what-if scenario against the virtual plant and recompute hydraulics',
            dependsOn: ['step-1-model'],
            plugins: ['pipe-calc-plugin'],
            outputSchemaRef: 'PipePressureDropResponse',
            status: 'pending',
          },
          {
            stepId: 'step-3-verify',
            kind: 'document',
            description: 'Verify simulated state against design pressures and the pump operating envelope',
            dependsOn: ['step-2-simulate'],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-4-record',
            kind: 'document',
            description: 'Render digital twin simulation report and commit Decision DNA',
            dependsOn: ['step-3-verify'],
            plugins: [],
            outputSchemaRef: 'DecisionDna',
            status: 'pending',
          },
        ];
        break;

      case 'SPREADSHEET_EXCEL':
        steps = [
          {
            stepId: 'step-1-intake',
            kind: 'document',
            description: 'Parse raw data tables and operational parameters from workspace',
            dependsOn: [],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-2-calc',
            kind: 'calculation',
            description: 'Compute statistical aggregations and formula columns',
            dependsOn: ['step-1-intake'],
            plugins: ['pipe-calc-plugin'],
            status: 'pending',
          },
          {
            stepId: 'step-3-render',
            kind: 'document',
            description: 'Format multi-sheet Excel workbook with styled headers and formula cells (.xlsx)',
            dependsOn: ['step-2-calc'],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-4-record',
            kind: 'document',
            description: 'Sign artifact hash and record Decision DNA',
            dependsOn: ['step-3-render'],
            plugins: [],
            outputSchemaRef: 'DecisionDna',
            status: 'pending',
          },
        ];
        break;

      case 'PRESENTATION_DECK':
        steps = [
          {
            stepId: 'step-1-brief',
            kind: 'document',
            description: 'Extract executive key points, metrics, and audit findings',
            dependsOn: [],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-2-slides',
            kind: 'document',
            description: 'Synthesize slide hierarchy with bullet points, callouts, and speaker notes',
            dependsOn: ['step-1-brief'],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-3-render',
            kind: 'document',
            description: 'Materialize PowerPoint presentation (.pptx) with corporate template styling',
            dependsOn: ['step-2-slides'],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-4-record',
            kind: 'document',
            description: 'Attach watermark provenance and commit Decision DNA record',
            dependsOn: ['step-3-render'],
            plugins: [],
            outputSchemaRef: 'DecisionDna',
            status: 'pending',
          },
        ];
        break;

      case 'VISUALIZATION':
        steps = [
          {
            stepId: 'step-1-source',
            kind: 'retrieve',
            description: 'Resolve the dataset to visualize (previous run output or live workspace store)',
            dependsOn: [],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-2-series',
            kind: 'calculation',
            description: 'Compute chart series and aggregations from the resolved data rows',
            dependsOn: ['step-1-source'],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-3-render',
            kind: 'document',
            description: 'Render interactive chart dashboard artifact (self-contained HTML/SVG)',
            dependsOn: ['step-2-series'],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-4-record',
            kind: 'document',
            description: 'Sign artifact hash and record Decision DNA',
            dependsOn: ['step-3-render'],
            plugins: [],
            outputSchemaRef: 'DecisionDna',
            status: 'pending',
          },
        ];
        break;

      default:
        // Free-form / custom general agentic goal
        steps = [
          {
            stepId: 'step-1-analyze',
            kind: 'document',
            description: `Analyze goal requirements and retrieve context for: "${goal}"`,
            dependsOn: [],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-2-synthesize',
            kind: 'document',
            description: 'Execute sovereign specialist reasoning and synthesize response',
            dependsOn: ['step-1-analyze'],
            plugins: [],
            status: 'pending',
          },
          {
            stepId: 'step-3-verify',
            kind: 'document',
            description: 'Verify claims against internal knowledge base and freshness policy',
            dependsOn: ['step-2-synthesize'],
            plugins: [],
            outputSchemaRef: 'CriticVerdict',
            status: 'pending',
          },
          {
            stepId: 'step-4-record',
            kind: 'document',
            description: 'Record execution trace in Merkle Audit Chain',
            dependsOn: ['step-3-verify'],
            plugins: [],
            outputSchemaRef: 'DecisionDna',
            status: 'pending',
          },
        ];
        break;
    }

    return {
      intent,
      plan: {
        taskId,
        recipeId: `recipe-${intent.toLowerCase()}`,
        steps,
      },
      suggestedArtifactType,
    };
  }
}
