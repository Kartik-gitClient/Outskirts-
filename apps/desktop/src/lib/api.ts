// Same-origin: the Vite dev/preview server proxies /api, /health, /artifacts and /ws
// to the gateway, so the browser never makes a cross-origin request.
const BASE = '';
const AUTH = { Authorization: 'Bearer token-admin-corporate' };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...AUTH, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export interface HealthReport {
  providerId: string;
  healthy: boolean;
  detail?: string;
  residentModels?: string[];
  devicePlacement?: string;
}

export interface ProviderInfo {
  mode: string;
  nimModel: string;
  providers: HealthReport[];
}

export interface ArtifactInfo {
  artifactId: string;
  taskId: string;
  artifactType: string;
  fileName: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
}

export interface Freshness {
  decay: number;
  state: string;
  retrievalWeight: number;
  requiresAcknowledgement: boolean;
  reason?: string;
}

export interface KnowledgeChunk {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  freshness?: Freshness | null;
}

export interface Notification {
  id: string;
  kind: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  documentId?: string;
  decay?: number;
  state?: string;
}

export interface PlanStep {
  stepId: string;
  kind: string;
  description: string;
  dependsOn: string[];
  status: string;
}

export interface ServerEvent {
  seq: number;
  type: string;
  taskId: string;
  ts: string;
  [key: string]: unknown;
}

export interface TaskResult {
  taskId: string;
  status: string;
  artifactContent?: string;
  stepsCompleted?: string[];
  artifacts: ArtifactInfo[];
}

export interface Equipment {
  id: string;
  tag: string;
  equipmentType: string;
  manufacturer: string;
  model?: string;
  service?: string;
  category: string;
  [key: string]: unknown;
}

export interface SimOutput {
  name: string;
  value: number;
  unit: string;
  formula?: string;
}
export interface SimStep {
  step: number;
  name: string;
  formula: string;
  value: number;
  unit: string;
  notes?: string;
}
export interface EquipmentSim {
  equipment: Equipment;
  category: string;
  inputs: Record<string, number | string>;
  outputs: SimOutput[];
  steps: SimStep[];
  correlation: string;
  source: string;
  warnings: string[];
  visual: { kind: string; data: Record<string, number | string> };
}

export interface TwinResult {
  twinId: string;
  executedAt: string;
  scenario: { type: string; description?: string; target?: string };
  simulated: Record<string, number>;
  deltas: Array<{ metric: string; unit: string; baseline: number; simulated: number; delta: number; withinDesign: boolean }>;
  affectedEquipment: string[];
  safetyVerdict: 'pass' | 'warn' | 'fail';
  findings: string[];
  recommendations: string[];
  calculationSource: string;
  correlation: string;
}

export interface BlueprintNode {
  id: string;
  tagNumber: string;
  symbolClass: string;
  service?: string;
  bbox: { page: number; x: number; y: number; w: number; h: number };
  detected: boolean;
}
export interface BlueprintData {
  documentId: string;
  width: number;
  height: number;
  svg: string;
  tags: Array<{ tagNumber: string; symbolClass: string; bbox: BlueprintNode['bbox']; detectorConfidence: number }>;
  nodes: BlueprintNode[];
  edges: Array<{ from: string; to: string; lineNumber?: string }>;
}
export interface BlueprintQueryResult {
  question: string;
  answer: string;
  path?: string[];
  suctionValves?: string[];
  dischargeValves?: string[];
}

export const api = {
  health: () => req<Record<string, unknown>>('/health'),
  providers: () => req<ProviderInfo>('/api/providers'),
  setMode: (mode: 'SOVEREIGN' | 'ASSIST') =>
    req<{ mode: string }>('/api/mode', { method: 'POST', body: JSON.stringify({ mode }) }),
  configureNim: (apiKey: string) =>
    req<{ configured: boolean; model: string }>('/api/providers/nim', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),

  notifications: () => req<{ notifications: Notification[] }>('/api/notifications'),

  knowledgeDocuments: () =>
    req<{ documents: Array<{ documentId: string; title: string; documentClass: string; chunkCount: number; freshness?: Freshness | null }> }>(
      '/api/knowledge/documents',
    ),
  knowledgeSearch: (q: string) =>
    req<{ query: string; results: KnowledgeChunk[] }>(`/api/knowledge/search?q=${encodeURIComponent(q)}`),

  startTask: (goal: string, mode?: string) =>
    req<{ taskId: string }>('/api/tasks', { method: 'POST', body: JSON.stringify({ goal, mode }) }),
  taskResult: (taskId: string) => req<TaskResult>(`/api/tasks/${taskId}/result`),
  cancelTask: (taskId: string) => req<unknown>(`/api/tasks/${taskId}/cancel`, { method: 'POST' }),
  taskArtifacts: (taskId: string) => req<{ artifacts: ArtifactInfo[] }>(`/api/tasks/${taskId}/artifacts`),
  allArtifacts: () => req<{ artifacts: ArtifactInfo[] }>('/api/artifacts'),

  equipment: () => req<{ equipment: Equipment[] }>('/api/equipment'),
  simulateEquipment: (equipmentId: string, overrides: Record<string, number>) =>
    req<EquipmentSim>('/api/machine-sim/equipment', {
      method: 'POST',
      body: JSON.stringify({ equipmentId, overrides }),
    }),

  digitalTwin: () => req<{ components: unknown[]; piping: unknown; operatingBaseline: unknown }>('/api/digital-twin'),
  twinSimulate: (scenario: Record<string, unknown>) =>
    req<TwinResult>('/api/digital-twin/simulate', { method: 'POST', body: JSON.stringify({ scenario }) }),

  blueprint: (itemCount = 12) => req<BlueprintData>(`/api/blueprint/graph?itemCount=${itemCount}`),
  blueprintQuery: (question: string) =>
    req<BlueprintQueryResult>('/api/blueprint/query', { method: 'POST', body: JSON.stringify({ question }) }),
  blueprintLoad: (documentId = 'MRPL-CDU-01') =>
    req<{ documentId: string; source: string; blueprint?: unknown }>(`/api/blueprint/load?documentId=${documentId}`),
  blueprintSave: (documentId: string, blueprint: unknown) =>
    req<{ success: boolean; savedAt: string }>('/api/blueprint/save', {
      method: 'POST',
      body: JSON.stringify({ documentId, blueprint }),
    }),

  artifactUrl: (url: string) => `${BASE}${url}`,
  wsUrl: (taskId: string) => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws?taskId=${encodeURIComponent(taskId)}`;
  },
};

export { BASE };
