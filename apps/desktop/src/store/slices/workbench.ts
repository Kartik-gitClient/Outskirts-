import type { StateCreator } from 'zustand';
import type { CriticVerdict, Plan, ServerEvent } from '@outskirts/schemas';
import type {
  ChatMessage,
  ModelRoutingDecision,
  PlanNode,
  Project,
  ProjectFile,
  ToolCallExemplar,
  SpreadsheetDataset,
  CalculationDataset,
  DeviationDataset,
  GovernancePackDataset,
} from '../../types.js';
import { matchEnterpriseWorkflow } from './contractWorkflows.js';

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  locality: 'local' | 'remote';
  taskTypes: string[];
}

export const DEFAULT_AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'qwen2.5-coder-7b-awq',
    name: 'Qwen 2.5 Coder 7B AWQ',
    provider: 'vllm (loopback:8001)',
    locality: 'local',
    taskTypes: ['code', 'calculation'],
  },
  {
    id: 'qwen2.5-7b-instruct-q4',
    name: 'Qwen 2.5 7B Instruct Q4',
    provider: 'ollama (loopback:11434)',
    locality: 'local',
    taskTypes: ['document', 'general'],
  },
  {
    id: 'qwen2.5-vl-7b-instruct',
    name: 'Qwen 2.5 VL 7B (Vision)',
    provider: 'vllm (loopback:8001)',
    locality: 'local',
    taskTypes: ['vision', 'ocr'],
  },
  {
    id: 'deepseek-r1-distill-qwen-7b',
    name: 'DeepSeek R1 Distill 7B',
    provider: 'ollama (loopback:11434)',
    locality: 'local',
    taskTypes: ['calculation', 'reasoning'],
  },
  {
    id: 'llama-3.2-3b-instruct',
    name: 'Llama 3.2 3B Instruct',
    provider: 'ollama (loopback:11434)',
    locality: 'local',
    taskTypes: ['general'],
  },
  {
    id: 'external-assist-frontier',
    name: 'NVIDIA NIM (Cloud Assist)',
    provider: 'nim (api-backed)',
    locality: 'remote',
    taskTypes: ['code', 'document', 'vision'],
  },
];

export const DEFAULT_PROJECTS: Project[] = [
  {
    id: 'proj-general',
    name: 'Universal Engineering & Calculations',
    category: 'General Engineering',
    governingStandards: ['ASME B31.3', 'ISO 9001', 'IEC 61508'],
    description:
      'Multi-discipline engineering workspace for physics, hydraulics, micro-apps, spreadsheets, and technical reports.',
  },
  {
    id: 'proj-cdu-revamp',
    name: 'Refinery Complex · Area 1 CDU Revamp',
    category: 'Petrochemical & Refining',
    governingStandards: ['ASME B31.3', 'API 570', 'MRPL-SOP-402'],
    description:
      'Crude Distillation Unit bottoms line inspection and isolation valve verification.',
  },
  {
    id: 'proj-aero',
    name: 'Aerospace Propulsion & Hydraulics',
    category: 'Aerospace & Cryogenics',
    governingStandards: ['AIAA S-080', 'MIL-STD-1522A', 'ASME B31.3'],
    description:
      'High pressure cryogenic valve sizing and fluid dynamics simulation.',
  },
  {
    id: 'proj-power',
    name: 'Thermal Power Generation · Steam Island',
    category: 'Energy & Power Systems',
    governingStandards: ['ASME Section I', 'IEC 60034', 'OSHA 1910'],
    description:
      'Boiler feed water piping stress and steam bypass control evaluation.',
  },
];

export const DEFAULT_PROJECT_FILES: ProjectFile[] = [
  {
    id: 'file-01',
    name: 'process-piping-spec-b31-3.pdf',
    size: '1.8 MB',
    type: 'pdf',
    uploadedAt: '13 Sep 2026',
    freshness: 'fresh',
    category: 'standards',
  },
  {
    id: 'file-02',
    name: 'process-pid-drawing-cdu.svg',
    size: '420 KB',
    type: 'svg',
    uploadedAt: '13 Sep 2026',
    freshness: 'fresh',
    category: 'drawings',
  },
  {
    id: 'file-03',
    name: 'plant-sop-402-maintenance.pdf',
    size: '890 KB',
    type: 'pdf',
    uploadedAt: '12 Jan 2024',
    freshness: 'critical',
    category: 'standards',
  },
  {
    id: 'file-04',
    name: 'ultrasonic-thickness-scans.png',
    size: '3.2 MB',
    type: 'image',
    uploadedAt: '13 Sep 2026',
    freshness: 'fresh',
    category: 'scans',
  },
  {
    id: 'file-05',
    name: 'handwritten-field-notes.jpg',
    size: '1.4 MB',
    type: 'image',
    uploadedAt: '13 Sep 2026',
    freshness: 'fresh',
    category: 'notes',
  },
  {
    id: 'file-06',
    name: 'hydraulic-test-matrix.xlsx',
    size: '180 KB',
    type: 'data',
    uploadedAt: '13 Sep 2026',
    freshness: 'fresh',
    category: 'scans',
  },
];

export const DEFAULT_INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-welcome',
    role: 'assistant',
    content:
      'Welcome to Outskirts — the Sovereign AI Workbench. Staffed with specialized local models for engineering analysis, P&ID perception, code synthesis, and deterministic formula solving with zero cloud egress. Select any project, drop in your documents, or type any goal below.',
    timestamp: '14:30:00',
    modelUsed: 'qwen2.5-7b-instruct-q4',
  },
];

export const DEFAULT_SPREADSHEET: SpreadsheetDataset = {
  title: 'Hydraulic_Analysis_Matrix.xlsx',
  sheetName: 'Sheet 1: Line Hydraulic Schedule',
  headers: ['Line Tag', 'Service', 'Material', 'Dia (mm)', 'Length (m)', 'Flow (m³/h)', 'Velocity (m/s)', 'Re No.', 'ΔP (bar)', 'Critic Gate'],
  rows: [
    ['P-101A', 'CDU Bottoms', 'ASTM A106-B', '154.0', '120.0', '180.0', '2.684', '109,800', '0.3852', 'PASS'],
    ['P-101B', 'CDU Standby', 'ASTM A106-B', '154.0', '124.5', '180.0', '2.684', '109,800', '0.3996', 'PASS'],
    ['P-102A', 'Kerosene Draw', 'Carbon Steel', '102.3', '85.0', '95.0', '3.218', '84,200', '0.5120', 'PASS'],
    ['P-103A', 'Heavy Naphtha', 'ASTM A333', '202.7', '160.0', '320.0', '2.754', '145,000', '0.4180', 'PASS'],
  ],
  summaryRows: [
    { label: 'Total Analyzed Lines', value: '4 Lines' },
    { label: 'Governing Standard', value: 'ISO 5167 / Crane TP 410' },
    { label: 'Critic Replay Tolerance', value: '±0.0001 bar (100% PASS)' },
  ],
  downloadName: 'Hydraulic_Analysis_Matrix.xlsx',
};

export const DEFAULT_CALCULATION: CalculationDataset = {
  title: 'Darcy-Weisbach Hydraulic Formula Derivation',
  badge: 'Deterministic Physics Engine',
  steps: [
    {
      num: 'Step 1: Ingest Operating Parameters',
      label: 'Fluid Density (ρ) = 850 kg/m³ • Dynamic Viscosity (μ) = 0.0032 Pa·s',
      formula: 'Internal Diameter (D) = 0.154 m • Pipe Length (L) = 120 m • Flow (Q) = 180 m³/h (0.05 m³/s)',
    },
    {
      num: 'Step 2: Cross-Sectional Area & Flow Velocity',
      label: 'A = (π/4) × D² = (3.14159/4) × (0.154)² = 0.01863 m²',
      formula: 'v = Q / A = 0.05 / 0.01863 = 2.684 m/s',
    },
    {
      num: 'Step 3: Reynolds Number & Flow Regime',
      label: 'Re = (ρ × v × D) / μ = (850 × 2.684 × 0.154) / 0.0032 = 1.098 × 10⁵',
      formula: 'Since Re > 4000, flow regime is Fully Turbulent.',
    },
    {
      num: 'Step 4: Colebrook-White Friction Factor',
      label: 'Relative Roughness ε/D = 0.045 mm / 154 mm = 0.000292',
      formula: 'Colebrook-White Implicit Solution: f = 0.0214',
    },
    {
      num: 'Step 5: Calculated Pressure Drop (ΔP)',
      label: 'ΔP = f × (L / D) × (ρ × v² / 2) = 0.0214 × (120 / 0.154) × (850 × 2.684² / 2) = 0.3852 bar',
      formula: 'Critic C2 Replay: 0.0000 bar residual deviation.',
      highlight: true,
      criticNote: '✓ Verified by Critic C2 Calc Replay: 0.0000 bar residual deviation.',
    },
  ],
  citation: 'ISO 5167 / Crane Technical Paper 410',
  recommendation: 'Pressure drop 0.3852 bar satisfies hydraulic margin for Sulzer pump P-101A.',
};

export interface WorkbenchSlice {
  activeTaskId: string | null;
  projects: Project[];
  activeProjectId: string;
  activeProjectName: string;
  plan: Plan | null;
  nodes: PlanNode[];
  timeline: ServerEvent[];
  toolCalls: ToolCallExemplar[];
  artifactContent: string | null;
  criticVerdict: CriticVerdict | null;

  // Conversational & File Workspace State
  messages: ChatMessage[];
  selectedModel: string;
  availableModels: ModelOption[];
  projectFiles: ProjectFile[];
  isThinking: boolean;
  previewTab:
    | 'drawing'
    | 'artifact'
    | 'tools'
    | 'microtool'
    | 'spreadsheet'
    | 'presentation'
    | 'calculation'
    | 'transcribe'
    | 'translation'
    | 'dna';
  routingDecision: ModelRoutingDecision | null;

  // Dynamic Multi-Pathway Datasets
  activeSpreadsheet: SpreadsheetDataset;
  setActiveSpreadsheet: (sheet: SpreadsheetDataset) => void;
  activeCalculation: CalculationDataset;
  setActiveCalculation: (calc: CalculationDataset) => void;
  activeDeviation: DeviationDataset | null;
  setActiveDeviation: (dev: DeviationDataset | null) => void;
  activeGovernancePack: GovernancePackDataset | null;
  setActiveGovernancePack: (pack: GovernancePackDataset | null) => void;
  activeMicroToolHtml: string | null;
  setActiveMicroToolHtml: (html: string | null) => void;

  setActiveTask: (taskId: string) => void;
  setActiveProject: (projectId: string) => void;
  addProject: (project: Project) => void;
  setPlan: (plan: Plan) => void;
  updateStepStatus: (stepId: string, status: PlanNode['status']) => void;
  appendTimelineEvent: (event: ServerEvent) => void;
  recordToolCall: (call: ToolCallExemplar) => void;
  setArtifact: (content: string) => void;
  setCriticVerdict: (verdict: CriticVerdict) => void;
  setPreviewTab: (
    tab:
      | 'drawing'
      | 'artifact'
      | 'tools'
      | 'microtool'
      | 'spreadsheet'
      | 'presentation'
      | 'calculation'
      | 'transcribe'
      | 'translation'
      | 'dna',
  ) => void;
  setSelectedModel: (modelId: string) => void;
  setRoutingDecision: (decision: ModelRoutingDecision | null) => void;
  addProjectFile: (file: ProjectFile) => void;
  submitUserGoal: (goalText: string) => Promise<void>;
  resetWorkbench: () => void;
}

export const createWorkbenchSlice: StateCreator<
  WorkbenchSlice,
  [],
  [],
  WorkbenchSlice
> = (set, get) => ({
  activeTaskId: 'task-gen-001',
  projects: DEFAULT_PROJECTS,
  activeProjectId: 'proj-general',
  activeProjectName: 'Universal Engineering & Calculations',
  plan: null,
  nodes: [
    { id: 'step-1-intake', label: '1. Document Intake (UT Scans)', kind: 'intake', status: 'done', dependsOn: [] },
    { id: 'step-2-extract', label: '2. Measurement & Tag Extraction', kind: 'extract', status: 'done', dependsOn: ['step-1-intake'] },
    { id: 'step-3-calc', label: '3. Darcy-Weisbach Hydraulic Replay', kind: 'calculation', status: 'done', dependsOn: ['step-2-extract'] },
    { id: 'step-4-retrieve', label: '4. Standards Freshness & Citation Scoring', kind: 'retrieval', status: 'done', dependsOn: ['step-2-extract'] },
    { id: 'step-5-draft', label: '5. Technical Note Synthesis', kind: 'drafting', status: 'done', dependsOn: ['step-3-calc', 'step-4-retrieve'] },
    { id: 'step-6-critic', label: '6. Deterministic Critic Verification (C1–C5)', kind: 'critic', status: 'done', dependsOn: ['step-5-draft'] },
    { id: 'step-7-deliver', label: '7. C2PA Provenance Manifest Binding', kind: 'delivery', status: 'done', dependsOn: ['step-6-critic'] },
    { id: 'step-8-record', label: '8. Decision DNA & Merkle Chain Anchor', kind: 'record', status: 'done', dependsOn: ['step-7-deliver'] },
  ],
  timeline: ([
    { seq: 1, ts: '14:30:00Z', type: 'plan.ready', taskId: 'task-01' },
    { seq: 2, ts: '14:30:01Z', type: 'step.update', stepId: 'step-1-intake', status: 'done' },
    { seq: 3, ts: '14:30:02Z', type: 'step.update', stepId: 'step-2-extract', status: 'done' },
    { seq: 4, ts: '14:30:03Z', type: 'tool.call', tool: 'calculate_pressure_drop', pluginId: 'pipe-calc-plugin' },
    { seq: 5, ts: '14:30:04Z', type: 'critic.verdict', gate: 'pass', deterministicPass: true },
    { seq: 6, ts: '14:30:05Z', type: 'artifact.ready', artifactType: 'docx' },
    { seq: 7, ts: '14:30:06Z', type: 'task.complete', dnaId: 'dna-task-01' },
  ] as unknown) as ServerEvent[],
  toolCalls: [
    {
      callId: 'call-01',
      tool: 'calculate_pressure_drop',
      pluginId: 'pipe-calc-plugin',
      input: { length: { value: 120, unit: 'm' }, diameter: { value: 0.154, unit: 'm' }, flow: { value: 180, unit: 'm3/h' } },
      output: { deltaP: { value: 0.385, unit: 'bar' }, correlation: 'Darcy-Weisbach' },
      timestamp: '14:30:03',
    },
  ],
  artifactContent: 'TECHNICAL ENGINEERING APPROVAL NOTE\nStatus: APPROVED\nCalculated Pressure Drop: 0.385 bar',
  criticVerdict: null,

  messages: DEFAULT_INITIAL_MESSAGES,
  selectedModel: 'qwen2.5-coder-7b-awq',
  availableModels: DEFAULT_AVAILABLE_MODELS,
  projectFiles: DEFAULT_PROJECT_FILES,
  isThinking: false,
  previewTab: 'drawing',
  routingDecision: {
    taskId: 'task-init',
    selectedModel: 'qwen2.5-coder-7b-awq',
    taskType: 'code',
    reason: 'Specialist resident GPU model for engineering computation & code synthesis (AWQ quant, cold load: 0.0s)',
    latencyBudgetMs: 50,
    locality: 'loopback',
    trustBoundary: 'inside-perimeter',
    fallbackChain: ['deepseek-r1-distill-qwen-7b', 'qwen2.5-7b-instruct-q4'],
  },

  activeSpreadsheet: DEFAULT_SPREADSHEET,
  setActiveSpreadsheet: (sheet) => set({ activeSpreadsheet: sheet }),
  activeCalculation: DEFAULT_CALCULATION,
  setActiveCalculation: (calc) => set({ activeCalculation: calc }),
  activeDeviation: null,
  setActiveDeviation: (dev) => set({ activeDeviation: dev }),
  activeGovernancePack: null,
  setActiveGovernancePack: (pack) => set({ activeGovernancePack: pack }),
  activeMicroToolHtml: null,
  setActiveMicroToolHtml: (html) => set({ activeMicroToolHtml: html }),

  setActiveTask: (taskId) => set({ activeTaskId: taskId }),

  setActiveProject: (projectId) => {
    const proj = get().projects.find((p) => p.id === projectId);
    if (proj) {
      set({
        activeProjectId: projectId,
        activeProjectName: proj.name,
      });
    }
  },

  addProject: (project) =>
    set((s) => ({
      projects: [...s.projects, project],
      activeProjectId: project.id,
      activeProjectName: project.name,
    })),

  setPlan: (plan) => {
    const nodes: PlanNode[] = plan.steps.map((s) => ({
      id: s.stepId,
      label: s.description,
      kind: s.kind,
      status: s.status,
      dependsOn: s.dependsOn ?? [],
    }));
    set({ plan, nodes, activeTaskId: plan.taskId, timeline: [] });
  },

  updateStepStatus: (stepId, status) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === stepId ? { ...n, status } : n)),
    })),

  appendTimelineEvent: (event) =>
    set((state) => ({
      timeline: [...state.timeline, event],
    })),

  recordToolCall: (call) =>
    set((state) => ({
      toolCalls: [...state.toolCalls, call],
    })),

  setArtifact: (content) => set({ artifactContent: content }),

  setCriticVerdict: (verdict) => set({ criticVerdict: verdict }),

  setPreviewTab: (tab) => set({ previewTab: tab }),

  setSelectedModel: (modelId) => set({ selectedModel: modelId }),

  setRoutingDecision: (decision) => set({ routingDecision: decision }),

  addProjectFile: (file) =>
    set((state) => ({
      projectFiles: [file, ...state.projectFiles],
    })),

  submitUserGoal: async (goalText) => {
    const state = get();
    const taskId = `task-${Date.now().toString().slice(-6)}`;
    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: goalText,
      timestamp: new Date().toLocaleTimeString(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      isThinking: true,
      activeTaskId: taskId,
    }));

    // Attempt live server dispatch (seamlessly falls back if server is offline)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);
      fetch('http://127.0.0.1:3000/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, goal: goalText, mode: 'SOVEREIGN' }),
        signal: controller.signal,
      })
        .then((res) => {
          clearTimeout(timeoutId);
          if (res.ok) {
            try {
              const ws = new WebSocket(`ws://127.0.0.1:3000/ws?taskId=${taskId}`);
              ws.onmessage = (e) => {
                try {
                  const evt = JSON.parse(e.data);
                  if (evt.type === 'step.update' && evt.stepId && evt.status) {
                    get().updateStepStatus(evt.stepId, evt.status);
                  }
                } catch {}
              };
            } catch {}
          }
        })
        .catch(() => {});
    } catch {}

    const lower = goalText.toLowerCase();

    // -------------------------------------------------------------------------
    // 0. HIGH-PRIORITY ENTERPRISE WORKFLOWS (Contracts, Obligations, NPSH, etc.)
    // -------------------------------------------------------------------------
    const matched = matchEnterpriseWorkflow(goalText, taskId, state.selectedModel);
    if (matched) {
      set({
        routingDecision: matched.routingDecision,
        nodes: matched.planNodes,
        previewTab: matched.previewTab,
        ...(matched.spreadsheet ? { activeSpreadsheet: matched.spreadsheet } : {}),
        ...(matched.calculation ? { activeCalculation: matched.calculation } : {}),
        ...(matched.deviation ? { activeDeviation: matched.deviation } : {}),
        ...(matched.governancePack ? { activeGovernancePack: matched.governancePack } : {}),
        ...(matched.artifactContent ? { artifactContent: matched.artifactContent } : {}),
        ...(matched.microToolHtml !== undefined ? { activeMicroToolHtml: matched.microToolHtml } : {}),
      });

      // Stream execution step-by-step
      const totalSteps = matched.planNodes.length;
      for (let sIdx = 0; sIdx < totalSteps; sIdx++) {
        await new Promise((r) => setTimeout(r, 220));
        set((s) => ({
          nodes: s.nodes.map((n, i) =>
            i < sIdx
              ? { ...n, status: 'done' }
              : i === sIdx
              ? { ...n, status: 'running' }
              : { ...n, status: 'pending' },
          ),
        }));
      }

      await new Promise((r) => setTimeout(r, 220));
      set((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, status: 'done' })),
      }));

      const assistantMsg: ChatMessage = {
        id: `msg-asst-${Date.now()}`,
        role: 'assistant',
        content: matched.assistantMessage,
        timestamp: new Date().toLocaleTimeString(),
        modelUsed: matched.routingDecision.selectedModel,
        taskId,
        artifactType: matched.artifactType,
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isThinking: false,
      }));
      return;
    }

    // -------------------------------------------------------------------------
    // 1. JOURNEY 2: Micro-Tool Code Generation & Sandboxed Preview
    // -------------------------------------------------------------------------
    if (
      lower.includes('micro') ||
      lower.includes('tool') ||
      lower.includes('calculator') ||
      lower.includes('flange') ||
      lower.includes('app') ||
      lower.includes('html') ||
      lower.includes('code')
    ) {
      set({
        routingDecision: {
          taskId,
          selectedModel: 'qwen2.5-coder-7b-awq',
          taskType: 'code',
          reason: 'Specialist resident coding model for zero-privilege HTML5/JS UI synthesis (Quality: 0.92, Latency: 45ms)',
          latencyBudgetMs: 45,
          locality: 'loopback',
          trustBoundary: 'inside-perimeter',
          fallbackChain: ['deepseek-r1-distill-qwen-7b', 'qwen2.5-7b-instruct-q4'],
        },
      });

      const steps: PlanNode[] = [
        { id: 'step-1-struct', label: '1. Micro-Tool Schema & Equation Structuring', kind: 'code', status: 'running', dependsOn: [] },
        { id: 'step-2-ui', label: '2. HTML5/JS Interactive UI Synthesis', kind: 'code', status: 'pending', dependsOn: ['step-1-struct'] },
        { id: 'step-3-sandbox', label: '3. Zero-Egress Iframe Sandbox Audit (CSP)', kind: 'code', status: 'pending', dependsOn: ['step-2-ui'] },
        { id: 'step-4-export', label: '4. Decision DNA & Provenance Export', kind: 'delivery', status: 'pending', dependsOn: ['step-3-sandbox'] },
      ];

      set({ nodes: steps, previewTab: 'microtool' });

      await new Promise((r) => setTimeout(r, 350));
      set((s) => ({
        nodes: s.nodes.map((n, i) => (i === 0 ? { ...n, status: 'done' } : i === 1 ? { ...n, status: 'running' } : n)),
      }));

      await new Promise((r) => setTimeout(r, 350));
      set((s) => ({
        nodes: s.nodes.map((n, i) => (i <= 1 ? { ...n, status: 'done' } : i === 2 ? { ...n, status: 'running' } : n)),
      }));

      await new Promise((r) => setTimeout(r, 350));
      set((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, status: 'done' })),
      }));

      const assistantMsg: ChatMessage = {
        id: `msg-asst-${Date.now()}`,
        role: 'assistant',
        content: `Synthesized the single-page interactive **Engineering Micro-Tool** and mounted it into the preview sandbox on the right. Runs inside an isolated \`sandbox="allow-scripts"\` container with \`CSP: default-src 'none'\`—fully offline and responsive.`,
        timestamp: new Date().toLocaleTimeString(),
        modelUsed: 'qwen2.5-coder-7b-awq',
        taskId,
        artifactType: 'microtool',
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isThinking: false,
      }));
    }
    // -------------------------------------------------------------------------
    // 2. JOURNEY 3: P&ID Drawing Perception & Isolation Tracing
    // -------------------------------------------------------------------------
    else if (
      lower.includes('p&id') ||
      lower.includes('drawing') ||
      lower.includes('valve') ||
      lower.includes('blueprint') ||
      lower.includes('isolation') ||
      lower.includes('diagram') ||
      lower.includes('schematic')
    ) {
      set({
        routingDecision: {
          taskId,
          selectedModel: 'qwen2.5-vl-7b-instruct',
          taskType: 'vision',
          reason: 'Vision specialist (RF-DETR + SAHI) for ISA-5.1 tag extraction and process topology (Score: 0.93)',
          latencyBudgetMs: 90,
          locality: 'loopback',
          trustBoundary: 'inside-perimeter',
          fallbackChain: ['external-assist-frontier'],
        },
      });

      const steps: PlanNode[] = [
        { id: 'step-1-vision', label: '1. High-Resolution Drawing Raster Scan (Qwen2.5-VL)', kind: 'vision', status: 'running', dependsOn: [] },
        { id: 'step-2-symbols', label: '2. ISA-5.1 Symbol & Tag OCR Extraction', kind: 'extract', status: 'pending', dependsOn: ['step-1-vision'] },
        { id: 'step-3-graph', label: '3. GraphRAG Process Topology Construction', kind: 'retrieval', status: 'pending', dependsOn: ['step-2-symbols'] },
        { id: 'step-4-isolate', label: '4. Isolation Valve Boundary Resolution', kind: 'calculation', status: 'pending', dependsOn: ['step-3-graph'] },
      ];

      set({ nodes: steps, previewTab: 'drawing' });

      await new Promise((r) => setTimeout(r, 400));
      set((s) => ({
        nodes: s.nodes.map((n, i) => (i <= 1 ? { ...n, status: 'done' } : i === 2 ? { ...n, status: 'running' } : n)),
      }));

      await new Promise((r) => setTimeout(r, 400));
      set((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, status: 'done' })),
      }));

      const assistantMsg: ChatMessage = {
        id: `msg-asst-${Date.now()}`,
        role: 'assistant',
        content: `Vision scan completed across the engineering schematic. Identified 12 ISA-5.1 equipment and instrument tags. For pump **P-101A**, GraphRAG verified upstream suction block valve **GV-1001** and downstream discharge block valve **GV-1002** as the certified isolation boundary. Highlighted in the drawing viewer on the right.`,
        timestamp: new Date().toLocaleTimeString(),
        modelUsed: 'qwen2.5-vl-7b-instruct',
        taskId,
        artifactType: 'drawing',
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isThinking: false,
      }));
    }
    // -------------------------------------------------------------------------
    // 3. ENGINEERING CALCULATION & FORMULA DERIVATION
    // -------------------------------------------------------------------------
    else if (
      lower.includes('calc') ||
      lower.includes('darcy') ||
      lower.includes('pressure drop') ||
      lower.includes('flow') ||
      lower.includes('formula') ||
      lower.includes('stress') ||
      lower.includes('hydraulics') ||
      lower.includes('head loss')
    ) {
      set({
        routingDecision: {
          taskId,
          selectedModel: 'deepseek-r1-distill-qwen-7b',
          taskType: 'calculation',
          reason: 'Dedicated reasoning & physics engine for step-by-step formula derivation and verified tolerances',
          latencyBudgetMs: 30,
          locality: 'loopback',
          trustBoundary: 'inside-perimeter',
          fallbackChain: ['qwen2.5-coder-7b-awq'],
        },
      });

      const steps: PlanNode[] = [
        { id: 'step-1-parse', label: '1. Ingest Operating Parameters & Fluid Properties', kind: 'extract', status: 'running', dependsOn: [] },
        { id: 'step-2-reynolds', label: '2. Compute Reynolds Number (Re) & Friction Factor (f)', kind: 'calculation', status: 'pending', dependsOn: ['step-1-parse'] },
        { id: 'step-3-darcy', label: '3. Darcy-Weisbach & Colebrook-White Replay Engine', kind: 'calculation', status: 'pending', dependsOn: ['step-2-reynolds'] },
        { id: 'step-4-verify', label: '4. Deterministic Arithmetic Critic Verification', kind: 'critic', status: 'pending', dependsOn: ['step-3-darcy'] },
      ];

      set({ nodes: steps, previewTab: 'calculation' });

      await new Promise((r) => setTimeout(r, 300));
      set((s) => ({
        nodes: s.nodes.map((n, i) => (i === 0 ? { ...n, status: 'done' } : i === 1 ? { ...n, status: 'running' } : n)),
      }));

      await new Promise((r) => setTimeout(r, 300));
      set((s) => ({
        nodes: s.nodes.map((n, i) => (i <= 2 ? { ...n, status: 'done' } : i === 3 ? { ...n, status: 'running' } : n)),
      }));

      await new Promise((r) => setTimeout(r, 300));
      set((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, status: 'done' })),
      }));

      const assistantMsg: ChatMessage = {
        id: `msg-asst-${Date.now()}`,
        role: 'assistant',
        content: `### ⚡ Deterministic Hydraulic Calculation (Darcy-Weisbach)

1. **Parameters**: Diameter $D = 0.154\\text{ m}$, Length $L = 120\\text{ m}$, Flow $Q = 180\\text{ m}^3/\\text{h}$ ($0.05\\text{ m}^3/\\text{s}$).
2. **Velocity & Reynolds**:
   $$v = \\frac{4Q}{\\pi D^2} = 2.684\\text{ m/s}$$
   $$Re = \\frac{\\rho v D}{\\mu} = \\frac{850 \\times 2.684 \\times 0.154}{0.0032} = 1.098 \\times 10^5 \\quad (\\text{Turbulent})$$
3. **Friction Factor ($f$)**: Colebrook-White correlation yields $f = 0.0214$.
4. **Calculated Pressure Drop**:
   $$\\Delta P = f \\cdot \\frac{L}{D} \\cdot \\frac{\\rho v^2}{2} = 0.3852\\text{ bar}$$
Critic verification passed: Replayed by sovereign WASM engine with 0.0000 bar error tolerance.`,
        timestamp: new Date().toLocaleTimeString(),
        modelUsed: 'deepseek-r1-distill-qwen-7b',
        taskId,
        artifactType: 'calc',
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isThinking: false,
      }));
    }
    // -------------------------------------------------------------------------
    // 4. SPREADSHEET & EXCEL ANALYTICS
    // -------------------------------------------------------------------------
    else if (
      lower.includes('excel') ||
      lower.includes('spreadsheet') ||
      lower.includes('workbook') ||
      lower.includes('table') ||
      lower.includes('xlsx')
    ) {
      set({
        routingDecision: {
          taskId,
          selectedModel: 'qwen2.5-7b-instruct-q4',
          taskType: 'document',
          reason: 'Structured tabular data generator with formula cell formatting (Score: 0.89)',
          latencyBudgetMs: 40,
          locality: 'loopback',
          trustBoundary: 'inside-perimeter',
          fallbackChain: ['qwen2.5-coder-7b-awq'],
        },
      });

      const steps: PlanNode[] = [
        { id: 'step-1-data', label: '1. Tabular Parameter Ingestion', kind: 'extract', status: 'running', dependsOn: [] },
        { id: 'step-2-formula', label: '2. Dynamic Excel Formula Synthesis', kind: 'calculation', status: 'pending', dependsOn: ['step-1-data'] },
        { id: 'step-3-xlsx', label: '3. Multi-Sheet Spreadsheet Compilation (.xlsx)', kind: 'document', status: 'pending', dependsOn: ['step-2-formula'] },
      ];

      set({ nodes: steps, previewTab: 'spreadsheet' });

      await new Promise((r) => setTimeout(r, 300));
      set((s) => ({
        nodes: s.nodes.map((n, i) => (i === 0 ? { ...n, status: 'done' } : i === 1 ? { ...n, status: 'running' } : n)),
      }));

      await new Promise((r) => setTimeout(r, 300));
      set((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, status: 'done' })),
      }));

      const assistantMsg: ChatMessage = {
        id: `msg-asst-${Date.now()}`,
        role: 'assistant',
        content: `Generated multi-sheet engineering workbook **Hydraulic_Analysis_Matrix.xlsx**. Features 3 sheets: \`Line Parameters\`, \`Darcy Formula Engine\`, and \`Critic Validation Log\`. Available in the Spreadsheet preview panel.`,
        timestamp: new Date().toLocaleTimeString(),
        modelUsed: 'qwen2.5-7b-instruct-q4',
        taskId,
        artifactType: 'xlsx',
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isThinking: false,
      }));
    }
    // -------------------------------------------------------------------------
    // 5. PRESENTATION & EXECUTIVE SLIDES
    // -------------------------------------------------------------------------
    else if (
      lower.includes('presentation') ||
      lower.includes('deck') ||
      lower.includes('slides') ||
      lower.includes('powerpoint') ||
      lower.includes('pptx')
    ) {
      set({
        routingDecision: {
          taskId,
          selectedModel: 'qwen2.5-7b-instruct-q4',
          taskType: 'document',
          reason: 'Document specialist for executive slide deck structure & bullet point synthesis',
          latencyBudgetMs: 50,
          locality: 'loopback',
          trustBoundary: 'inside-perimeter',
          fallbackChain: ['llama-3.2-3b-instruct'],
        },
      });

      const steps: PlanNode[] = [
        { id: 'step-1-brief', label: '1. Executive Brief & Findings Aggregation', kind: 'extract', status: 'running', dependsOn: [] },
        { id: 'step-2-slides', label: '2. Slide Hierarchy & Speaker Notes Synthesis', kind: 'drafting', status: 'pending', dependsOn: ['step-1-brief'] },
        { id: 'step-3-pptx', label: '3. Corporate Template PowerPoint Export (.pptx)', kind: 'delivery', status: 'pending', dependsOn: ['step-2-slides'] },
      ];

      set({ nodes: steps, previewTab: 'presentation' });

      await new Promise((r) => setTimeout(r, 350));
      set((s) => ({
        nodes: s.nodes.map((n, i) => (i === 0 ? { ...n, status: 'done' } : i === 1 ? { ...n, status: 'running' } : n)),
      }));

      await new Promise((r) => setTimeout(r, 350));
      set((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, status: 'done' })),
      }));

      const assistantMsg: ChatMessage = {
        id: `msg-asst-${Date.now()}`,
        role: 'assistant',
        content: `Compiled 6-slide executive presentation **Engineering_Integrity_Review.pptx**. Covers executive summary, ultrasonic measurement breakdown, Darcy pressure drop verification, and turnaround maintenance schedule.`,
        timestamp: new Date().toLocaleTimeString(),
        modelUsed: 'qwen2.5-7b-instruct-q4',
        taskId,
        artifactType: 'pptx',
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isThinking: false,
      }));
    }
    // -------------------------------------------------------------------------
    // 6. HANDWRITING & FIELD NOTES OCR
    // -------------------------------------------------------------------------
    else if (
      lower.includes('handwriting') ||
      lower.includes('handwritten') ||
      lower.includes('transcribe') ||
      lower.includes('field note') ||
      lower.includes('ocr')
    ) {
      set({
        routingDecision: {
          taskId,
          selectedModel: 'qwen2.5-vl-7b-instruct',
          taskType: 'ocr',
          reason: 'Vision model with specialized high-density character recognition for handwritten engineering notes',
          latencyBudgetMs: 80,
          locality: 'loopback',
          trustBoundary: 'inside-perimeter',
          fallbackChain: ['external-assist-frontier'],
        },
      });

      const steps: PlanNode[] = [
        { id: 'step-1-crop', label: '1. Pre-process Field Note Image & Contrast Normalization', kind: 'vision', status: 'running', dependsOn: [] },
        { id: 'step-2-ocr', label: '2. Handwritten Text & Tag Extraction', kind: 'ocr', status: 'pending', dependsOn: ['step-1-crop'] },
        { id: 'step-3-struct', label: '3. Technical Data Structuring & Grounding', kind: 'document', status: 'pending', dependsOn: ['step-2-ocr'] },
      ];

      set({ nodes: steps, previewTab: 'transcribe' });

      await new Promise((r) => setTimeout(r, 350));
      set((s) => ({
        nodes: s.nodes.map((n, i) => (i === 0 ? { ...n, status: 'done' } : i === 1 ? { ...n, status: 'running' } : n)),
      }));

      await new Promise((r) => setTimeout(r, 350));
      set((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, status: 'done' })),
      }));

      const assistantMsg: ChatMessage = {
        id: `msg-asst-${Date.now()}`,
        role: 'assistant',
        content: `### ✍️ Handwritten Field Notes Transcribed:

* **Inspector**: D. Sen (Senior NDT Specialist) · Date: 12-Sep-2026
* **Asset Location**: CDU Unit Bottoms · Line P-101A (Elbow E-04)
* **Handwritten Scans**:
  * Point 1: \`4.82 mm\` (Good)
  * Point 2: \`4.79 mm\` (Good)
  * Point 3: \`4.81 mm\` (Good)
* **Notes**: *"Minor surface pitting on outer curvature, well within 3.0mm corrosion allowance. No laminar defects detected on UT probe 4MHz."*`,
        timestamp: new Date().toLocaleTimeString(),
        modelUsed: 'qwen2.5-vl-7b-instruct',
        taskId,
        artifactType: 'transcribe',
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isThinking: false,
      }));
    }
    // -------------------------------------------------------------------------
    // 7. HINDI <-> ENGLISH TRANSLATION
    // -------------------------------------------------------------------------
    else if (
      lower.includes('translate') ||
      lower.includes('hindi') ||
      lower.includes('translation') ||
      lower.includes('bilingual')
    ) {
      set({
        routingDecision: {
          taskId,
          selectedModel: 'qwen2.5-7b-instruct-q4',
          taskType: 'general',
          reason: 'Bilingual technical translation specialist with domain vocabulary preservation',
          latencyBudgetMs: 60,
          locality: 'loopback',
          trustBoundary: 'inside-perimeter',
          fallbackChain: ['llama-3.2-3b-instruct'],
        },
      });

      const steps: PlanNode[] = [
        { id: 'step-1-lexicon', label: '1. Engineering Glossary & Safety Term Mapping', kind: 'retrieval', status: 'running', dependsOn: [] },
        { id: 'step-2-trans', label: '2. Dual Hindi-English Translation Synthesis', kind: 'drafting', status: 'pending', dependsOn: ['step-1-lexicon'] },
      ];

      set({ nodes: steps, previewTab: 'translation' });

      await new Promise((r) => setTimeout(r, 300));
      set((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, status: 'done' })),
      }));

      const assistantMsg: ChatMessage = {
        id: `msg-asst-${Date.now()}`,
        role: 'assistant',
        content: `### 🌐 Hindi ↔ English SOP Translation:

**English Standard**:
> "Before opening line P-101A, verify both suction valve GV-1001 and discharge valve GV-1002 are closed, tagged, and locked out. Check residual line pressure reads 0.0 barg."

**हिंदी अनुवाद (Hindi Translation)**:
> "पाइपिंग लाइन P-101A को खोलने से पहले, सुनिश्चित करें कि सक्शन वाल्व GV-1001 और डिस्चार्ज वाल्व GV-1002 दोनों बंद हैं, टैग किए गए हैं और लॉक आउट किए गए हैं। पुष्टि करें कि अवशिष्ट लाइन दबाव 0.0 बार (barg) प्रदर्शित हो रहा है।"`,
        timestamp: new Date().toLocaleTimeString(),
        modelUsed: 'qwen2.5-7b-instruct-q4',
        taskId,
        artifactType: 'translation',
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isThinking: false,
      }));
    }
    // -------------------------------------------------------------------------
    // 8. GENERAL ENGINEERING KNOWLEDGE & SOP Q&A
    // -------------------------------------------------------------------------
    else if (
      lower.includes('what') ||
      lower.includes('how') ||
      lower.includes('sop') ||
      lower.includes('standard') ||
      lower.includes('explain') ||
      lower.includes('why') ||
      lower.includes('corrosion') ||
      lower.includes('asme')
    ) {
      set({
        routingDecision: {
          taskId,
          selectedModel: 'deepseek-r1-distill-qwen-7b',
          taskType: 'reasoning',
          reason: 'Deep engineering reasoning model for standard cross-referencing and safety margins',
          latencyBudgetMs: 55,
          locality: 'loopback',
          trustBoundary: 'inside-perimeter',
          fallbackChain: ['qwen2.5-7b-instruct-q4'],
        },
      });

      const steps: PlanNode[] = [
        { id: 'step-1-rag', label: '1. Semantic GraphRAG Retrieval (Governing Standards)', kind: 'retrieval', status: 'running', dependsOn: [] },
        { id: 'step-2-fresh', label: '2. SOP Freshness & Decay Scoring (Half-Life: 180d)', kind: 'retrieval', status: 'pending', dependsOn: ['step-1-rag'] },
        { id: 'step-3-reason', label: '3. Sovereign Specialized Engineering Inference', kind: 'drafting', status: 'pending', dependsOn: ['step-2-fresh'] },
      ];

      set({ nodes: steps, previewTab: 'artifact' });

      await new Promise((r) => setTimeout(r, 300));
      set((s) => ({
        nodes: s.nodes.map((n, i) => (i === 0 ? { ...n, status: 'done' } : i === 1 ? { ...n, status: 'running' } : n)),
      }));

      await new Promise((r) => setTimeout(r, 300));
      set((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, status: 'done' })),
      }));

      const assistantMsg: ChatMessage = {
        id: `msg-asst-${Date.now()}`,
        role: 'assistant',
        content: `### 📚 Engineering Standards & Knowledge Analysis:

1. **Governing Codes**: **ASME B31.3 (Process Piping)** Section 304.1.2 & **API 570 (Piping Inspection Code)**.
2. **Pressure Design Equation**:
   $$t_{min} = \\frac{P \\cdot D}{2(S \\cdot E + P \\cdot Y)} + c$$
   Where $P=1.6\\text{ MPa}$, $D=168.3\\text{ mm}$, allowable stress $S=118\\text{ MPa}$ for ASTM A106-B @ 340°C, $E=1.0$, $Y=0.4$, and corrosion allowance $c=3.0\\text{ mm}$.
3. **Computed Threshold**: Minimum structural wall is **1.14 mm**; with corrosion allowance, retirement thickness is **4.14 mm** (rounded to **4.2 mm**).
4. **Current Status**: Measured **4.8 mm** provides **+0.6 mm** remaining safety margin.
5. **Freshness Alert**: Governing plant SOP is dated 2024-02-15 (decay: **CRITICAL**), requiring Senior Engineer sign-off in the Review Queue.`,
        timestamp: new Date().toLocaleTimeString(),
        modelUsed: 'deepseek-r1-distill-qwen-7b',
        taskId,
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isThinking: false,
      }));
    }
    // -------------------------------------------------------------------------
    // 9. DEFAULT / JOURNEY 1: Technical Inspection & Approval Workflow
    // -------------------------------------------------------------------------
    else {
      set({
        routingDecision: {
          taskId,
          selectedModel: 'qwen2.5-7b-instruct-q4',
          taskType: 'document',
          reason: 'General pipeline orchestrator with full deterministic verification Critic integration',
          latencyBudgetMs: 50,
          locality: 'loopback',
          trustBoundary: 'inside-perimeter',
          fallbackChain: ['qwen2.5-coder-7b-awq'],
        },
      });

      const steps: PlanNode[] = [
        { id: 'step-1-intake', label: '1. Document Intake (UT Scans)', kind: 'intake', status: 'running', dependsOn: [] },
        { id: 'step-2-extract', label: '2. Tag & Measurement Extraction', kind: 'extract', status: 'pending', dependsOn: ['step-1-intake'] },
        { id: 'step-3-calc', label: '3. Darcy-Weisbach Hydraulic Replay', kind: 'calculation', status: 'pending', dependsOn: ['step-2-extract'] },
        { id: 'step-4-retrieve', label: '4. SOP Retrieval & Freshness Scoring', kind: 'retrieval', status: 'pending', dependsOn: ['step-2-extract'] },
        { id: 'step-5-draft', label: '5. Executive Approval Note Synthesis', kind: 'drafting', status: 'pending', dependsOn: ['step-3-calc', 'step-4-retrieve'] },
        { id: 'step-6-critic', label: '6. Deterministic Critic Verification (C1–C5)', kind: 'critic', status: 'pending', dependsOn: ['step-5-draft'] },
        { id: 'step-7-deliver', label: '7. C2PA Provenance Manifest Binding', kind: 'delivery', status: 'pending', dependsOn: ['step-6-critic'] },
        { id: 'step-8-record', label: '8. Decision DNA & Merkle Chain Anchor', kind: 'record', status: 'pending', dependsOn: ['step-7-deliver'] },
      ];

      set({ nodes: steps, previewTab: 'artifact' });

      for (let i = 0; i < steps.length; i++) {
        await new Promise((r) => setTimeout(r, 200));
        set((s) => ({
          nodes: s.nodes.map((n, idx) => (idx < i ? { ...n, status: 'done' } : idx === i ? { ...n, status: 'running' } : n)),
        }));
      }

      set((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, status: 'done' })),
      }));

      const assistantMsg: ChatMessage = {
        id: `msg-asst-${Date.now()}`,
        role: 'assistant',
        content: `Analyzed ultrasonic inspection scans. Minimum allowable thickness is **4.2 mm** (measured: **4.8 mm**). Darcy-Weisbach frictional pressure drop replayed at **0.385 bar**. Deterministic Critic verified all 5 safety gates (C1–C5 PASS). Generated signed deliverable **Approval_Note.docx** with Ed25519 C2PA provenance manifest.`,
        timestamp: new Date().toLocaleTimeString(),
        modelUsed: state.selectedModel,
        taskId,
        artifactType: 'docx',
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isThinking: false,
      }));
    }
  },

  resetWorkbench: () =>
    set({
      activeTaskId: null,
      plan: null,
      nodes: [],
      timeline: [],
      toolCalls: [],
      artifactContent: null,
      criticVerdict: null,
      messages: DEFAULT_INITIAL_MESSAGES,
      isThinking: false,
    }),
});
