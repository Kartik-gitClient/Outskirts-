import type {
  BBox,
  Citation,
  ClaimVerdict,
  CriticVerdict,
  DecisionDna,
  GuardAlert,
  Id,
  InspectionFinding,
  Plan,
  PluginRecord,
  ProviderMode,
  RegistryEntry,
  ServerEvent,
} from '@outskirts/schemas';

export type ScreenTab =
  | 'workbench'
  | 'blueprint'
  | 'digital-twin'
  | 'sovereignty'
  | 'marketplace'
  | 'admin'
  | 'review';

export interface PlanNode {
  id: string;
  label: string;
  kind: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'repaired' | 'cancelled';
  dependsOn: string[];
}

export interface ToolCallExemplar {
  callId: string;
  tool: string;
  pluginId?: string;
  input: unknown;
  output: unknown;
  timestamp: string;
}

export interface LocalityLogEntry {
  id: string;
  timestamp: string;
  model: string;
  locality: 'loopback' | 'lan' | 'wan';
  trustBoundary: 'inside-perimeter' | 'outside-perimeter';
  endpoint: string;
  resolvedHostname: string;
  cacheHit?: boolean;
}

export interface ReviewQueueEntry {
  reviewId: string;
  taskId: Id;
  deliverableId: string;
  title: string;
  status: 'pending_review' | 'blocked_on_freshness' | 'approved' | 'rejected';
  humanGateLocked: boolean;
  citations: Citation[];
  regionLinks: Array<{ tagNumber: string; bbox: BBox }>;
  approvedBy?: Id;
  approvedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  category: string;
  governingStandards: string[];
  description: string;
}

export interface ModelRoutingDecision {
  taskId: string;
  selectedModel: string;
  taskType: 'vision' | 'ocr' | 'code' | 'reasoning' | 'calculation' | 'document' | 'general';
  reason: string;
  latencyBudgetMs: number;
  locality: 'loopback' | 'lan' | 'remote';
  trustBoundary: 'inside-perimeter' | 'outside-perimeter';
  fallbackChain: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  taskId?: string;
  modelUsed?: string;
  planNodes?: PlanNode[];
  toolCalls?: ToolCallExemplar[];
  criticVerdict?: CriticVerdict | null;
  artifactType?: 'docx' | 'microtool' | 'drawing' | 'xlsx' | 'pptx' | 'calc' | 'transcribe' | 'translation' | 'text';
}

export interface ProjectFile {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'svg' | 'image' | 'doc' | 'data';
  uploadedAt: string;
  freshness?: 'fresh' | 'aging' | 'stale' | 'critical';
  category?: 'standards' | 'drawings' | 'scans' | 'notes';
}

export interface SpreadsheetDataset {
  title: string;
  sheetName: string;
  headers: string[];
  rows: Array<string[]>;
  summaryRows?: Array<{ label: string; value: string }>;
  downloadName?: string;
}

export interface CalculationDataset {
  title: string;
  badge: string;
  steps: Array<{ num: string; label: string; formula: string; highlight?: boolean; criticNote?: string }>;
  citation: string;
  recommendation: string;
}

export interface DeviationDataset {
  title: string;
  contractRef: string;
  deviations: Array<{
    clause: string;
    standardGcc: string;
    proposedText: string;
    risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
    recommendation: string;
  }>;
}

export interface GovernancePackDataset {
  month: string;
  pptxDeckTitle: string;
  docxMinutesTitle: string;
  xlsxDataTitle: string;
  merkleRoot: string;
  status: string;
}


