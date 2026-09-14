import { randomUUID } from 'node:crypto';
import type { Plan, PlanStep, TaskType } from '@outskirts/schemas';
import type { PAL } from '@outskirts/pal';

export type WorkflowIntent =
  | 'REPORT_APPROVAL'
  | 'MICROTOOL_CODE'
  | 'PID_ANALYSIS'
  | 'SPREADSHEET_EXCEL'
  | 'PRESENTATION_DECK'
  | 'KNOWLEDGE_QA'
  | 'CUSTOM_GOAL';

export interface PlanGenerationResult {
  intent: WorkflowIntent;
  plan: Plan;
  suggestedArtifactType: 'docx' | 'microtool' | 'drawing' | 'xlsx' | 'pptx' | 'text';
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

    // 1. Classify intent
    let intent: WorkflowIntent = 'REPORT_APPROVAL';
    let suggestedArtifactType: PlanGenerationResult['suggestedArtifactType'] = 'docx';

    if (
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
      lower.includes('micro') ||
      lower.includes('tool') ||
      lower.includes('calculator') ||
      lower.includes('flange') ||
      lower.includes('app') ||
      lower.includes('code')
    ) {
      intent = 'MICROTOOL_CODE';
      suggestedArtifactType = 'microtool';
    } else if (
      lower.includes('p&id') ||
      lower.includes('drawing') ||
      lower.includes('diagram') ||
      lower.includes('isolation') ||
      lower.includes('valve') ||
      lower.includes('topology')
    ) {
      intent = 'PID_ANALYSIS';
      suggestedArtifactType = 'drawing';
    } else if (lower.includes('excel') || lower.includes('spreadsheet') || lower.includes('workbook')) {
      intent = 'SPREADSHEET_EXCEL';
      suggestedArtifactType = 'xlsx';
    } else if (lower.includes('deck') || lower.includes('powerpoint') || lower.includes('presentation') || lower.includes('slides')) {
      intent = 'PRESENTATION_DECK';
      suggestedArtifactType = 'pptx';
    } else if (lower.includes('what') || lower.includes('how') || lower.includes('sop') || lower.includes('standard')) {
      intent = 'KNOWLEDGE_QA';
      suggestedArtifactType = 'text';
    }

    // 2. Build DAG steps based on intent
    let steps: PlanStep[] = [];

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
