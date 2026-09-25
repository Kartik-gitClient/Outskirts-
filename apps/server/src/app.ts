import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import {
  AuditChain,
  generateEd25519KeyPair,
} from '@outskirts/sovereignty';
import {
  PAL,
  VllmAdapter,
  OllamaAdapter,
  NimAdapter,
} from '@outskirts/pal';
import {
  KnowledgeBase,
  OllamaEmbeddingClient,
  InMemoryVectorStore,
  SEEDED_DOCUMENTS,
} from '@outskirts/knowledge';
import {
  PluginHost,
  admitPlugin,
  createPipeCalcPlugin,
} from '@outskirts/plugin-sdk';
import { TimelineManager } from './gateway/timeline.js';
import { TaskWebSocketGateway } from './gateway/ws-server.js';
import { AgentPipelineExecutor, type PipelineResult } from './agent/executor.js';
import { CancellationToken } from './agent/cancellation.js';
import { INSPECTION_APPROVAL_RECIPE } from './agent/recipe.js';
import { RecipeLibrary } from './agent/recipe-builder.js';
import { createAuthMiddleware } from './gateway/auth.js';
import { PerceptionBridge } from '../../../services/perception/bridge.js';
import { PidDrawingDetector } from '../../../services/perception/pid-detector.js';
import { PidProcessGraph } from '../../../services/perception/pid-graph.js';
import { generateSyntheticPidSheet } from '../../../datasets/pid-synth/generator.js';
import { computeCompressor, computeValve } from './machine-sim/compute.js';
import { simulateEquipment } from './machine-sim/equipment-model.js';
import { EQUIPMENT_CATALOG, categoryOf, type EquipmentRecord } from './data/equipment.js';
import { SqliteStore, SqliteCheckpointer } from './store/sqlite.js';
import { ArtifactStore } from './artifacts/store.js';
import { renderArtifactPreview, readArtifactFile } from './artifacts/preview.js';
import { LlmClient } from './agent/llm.js';
import { planBlueprintOps } from './agent/blueprint-ai.js';
import { explainSimulation, diagnoseWarnings, type SimFactSheet } from './agent/machine-ai.js';
import { isSmallTalk } from './agent/planner.js';
import { WORKSPACE_DATASETS } from './data/workspace.js';
import {
  runTwinScenario,
  TWIN_COMPONENTS,
  PIPING_SEGMENT,
  TWIN_BASELINE,
} from './digital-twin/simulator.js';
import { Recipe, ChatRequest } from '@outskirts/schemas';

/**
 * Local Ollama model ids registered as the sovereign workhorse. They are pulled
 * as `qwen2.5:3b` / `qwen2.5-coder:1.5b` and aliased to these ids at install
 * time so the registry never has to name a mutable upstream tag.
 */
const LOCAL_GENERAL_MODEL = 'qwen2.5-3b-local';
const LOCAL_CODER_MODEL = 'qwen2.5-coder-1.5b-local';
const LOCAL_LARGE_GENERAL_MODEL = 'qwen2.5-7b-instruct-local';
const LOCAL_LARGE_CODER_MODEL = 'qwen2.5-coder-7b-local';
const LOCAL_REASONING_MODEL = 'deepseek-r1-14b-local';
// NVIDIA end-of-lifed meta/llama-3.1-8b on 2026-08-26; gemma-4-31b-it is the
// current clean-instruct default on the live NIM catalog (verified with a key).
const NIM_MODEL_ID = process.env.NIM_MODEL ?? 'google/gemma-4-31b-it';
const NIM_FAST_MODEL_ID = 'nvidia/nemotron-3.5-lightning-30b-a3b';

function baseLocalEntry(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    providerId: 'ollama',
    locality: 'loopback',
    trustBoundary: 'inside-perimeter',
    capabilities: ['text', 'guided-json', 'seeded', 'streaming'],
    modelDigest: 'sha256:unmeasured-local-weights',
    quantisation: 'Q4_K_M',
    contextWindow: 16384,
    quality: 0.85,
    estLoadS: 4,
    pinned: false,
    status: 'enabled',
    license: 'Apache-2.0',
    licenseUrl: 'https://spdx.org/licenses/Apache-2.0.html',
    ...overrides,
  };
}

function registerLocalModels(pal: PAL): void {
  const localModels: Array<Record<string, unknown>> = [
    baseLocalEntry({
      modelId: LOCAL_GENERAL_MODEL,
      taskTypes: ['document', 'retrieve', 'calculation'],
      modelDigest: 'sha256:ollama-qwen2.5-3b-local',
      contextWindow: 8192,
      quality: 0.8,
      pinned: true,
    }),
    baseLocalEntry({
      modelId: LOCAL_CODER_MODEL,
      taskTypes: ['code', 'vision'],
      modelDigest: 'sha256:ollama-qwen2.5-coder-1.5b-local',
      contextWindow: 8192,
      quality: 0.8,
      pinned: true,
    }),
    baseLocalEntry({
      modelId: LOCAL_LARGE_GENERAL_MODEL,
      taskTypes: ['document', 'retrieve', 'calculation'],
      modelDigest: 'sha256:ollama-qwen2.5-7b-instruct-local',
    }),
    baseLocalEntry({
      modelId: LOCAL_LARGE_CODER_MODEL,
      taskTypes: ['code', 'vision'],
      modelDigest: 'sha256:ollama-qwen2.5-coder-7b-local',
      quality: 0.88,
    }),
    baseLocalEntry({
      modelId: LOCAL_REASONING_MODEL,
      taskTypes: ['calculation', 'code'],
      modelDigest: 'sha256:ollama-deepseek-r1-14b-local',
      quality: 0.9,
      contextWindow: 32768,
    }),
  ];

  // NVIDIA NIM demonstration models (ASSIST mode; outside perimeter).
  // Only models verified reachable on the live catalog are registered —
  // NVIDIA EOLs dated models aggressively (410 Gone).
  const nimModels: Array<{ modelId: string; quality: number; taskTypes: string[] }> = [
    { modelId: NIM_MODEL_ID, quality: 0.96, taskTypes: ['code', 'document', 'vision', 'calculation', 'retrieve'] },
    { modelId: NIM_FAST_MODEL_ID, quality: 0.94, taskTypes: ['document', 'retrieve', 'calculation'] },
  ];
  for (const m of nimModels) {
    localModels.push({
      modelId: m.modelId,
      providerId: 'nim',
      locality: 'internet',
      trustBoundary: 'outside-perimeter',
      taskTypes: m.taskTypes,
      capabilities: ['text', 'vision', 'tool-use', 'guided-json', 'seeded', 'streaming'],
      modelDigest: `sha256:nim-${m.modelId.replace(/[^a-z0-9]/gi, '-')}`,
      quantisation: 'none',
      contextWindow: 128000,
      quality: m.quality,
      estLoadS: 0,
      pinned: false,
      status: 'enabled',
      license: 'NVIDIA NIM Terms',
    });
  }

  for (const entry of localModels) {
    pal.getRegistry().register(entry);
  }
}

/** Ordered model candidates: NIM first when demoing in ASSIST, else local-first. */
function planModelChain(pal: PAL, taskType: string): string[] {
  const isCode = taskType === 'code' || taskType === 'vision';
  const local = isCode
    ? [LOCAL_CODER_MODEL, LOCAL_LARGE_CODER_MODEL]
    : taskType === 'calculation'
      ? [LOCAL_GENERAL_MODEL, LOCAL_REASONING_MODEL, LOCAL_LARGE_GENERAL_MODEL]
      : [LOCAL_GENERAL_MODEL, LOCAL_LARGE_GENERAL_MODEL];
  const nimConfigured = Boolean(
    process.env.NIM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      (pal.getAdapter('nim') as NimAdapter | undefined)?.isConfigured(),
  );
  // Fast lightning model first (free-tier latency), clean gemma as quality fallback.
  const nim = [NIM_FAST_MODEL_ID, NIM_MODEL_ID].filter((id) => pal.getRegistry().get(id));

  if (pal.getMode() === 'ASSIST' && nimConfigured) {
    return [...nim, ...local];
  }
  return [...local, ...nim];
}

export interface ServerContext {
  app: express.Express;
  timeline: TimelineManager;
  executor: AgentPipelineExecutor;
  auditChain: AuditChain;
  recipeLibrary: RecipeLibrary;
  perceptionBridge: PerceptionBridge;
  keyId: string;
  publicKeyPem: string;
  activeTasks: Map<string, { token: CancellationToken; promise: Promise<PipelineResult> }>;
  store: SqliteStore;
  artifacts: ArtifactStore;
  knowledge: KnowledgeBase;
}

export interface CreateServerOptions {
  dbPath?: string;
}

export function createServer(options?: CreateServerOptions): ServerContext {
  const app = express();

  // Local-origin CORS: the workbench normally rides a same-origin Vite proxy,
  // but a native shell or a separately served build must still be able to call
  // the loopback gateway. Only loopback origins are ever needed here.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Ldap-User, X-Ldap-Role, X-Ldap-Projects');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  const keyPair = generateEd25519KeyPair();
  const keyId = 'outskirts-gateway-key-01';

  const auditChain = new AuditChain();
  const timeline = new TimelineManager();

  const dbPath =
    options?.dbPath ?? process.env.OUTSKIRTS_DB ?? (process.env.VITEST ? ':memory:' : undefined);
  const store = new SqliteStore(dbPath);
  const checkpointer = new SqliteCheckpointer(store);
  const artifacts = new ArtifactStore(store);

  // Persisted operator settings (perimeter mode survives gateway restarts,
  // so the demo stays in ASSIST once NIM is configured).
  const settingsPath =
    store.filePath !== ':memory:' && store.filePath.length > 0
      ? path.join(path.dirname(store.filePath), 'settings.json')
      : undefined;
  const loadSettings = (): { mode?: 'SOVEREIGN' | 'ASSIST' } => {
    if (!settingsPath) return {};
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { mode?: 'SOVEREIGN' | 'ASSIST' };
    } catch {
      return {};
    }
  };
  const saveSettings = (patch: { mode?: 'SOVEREIGN' | 'ASSIST' }): void => {
    if (!settingsPath) return;
    try {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({ ...loadSettings(), ...patch }, null, 2));
    } catch {
      /* best-effort persistence */
    }
  };

  // Seed the local document corpus and workspace data on first boot.
  for (const ds of WORKSPACE_DATASETS) {
    store.seedDatasetIfEmpty(ds.key, ds.payload);
  }
  const knowledge = new KnowledgeBase(new OllamaEmbeddingClient(), new InMemoryVectorStore());
  const knowledgeReady = (async () => {
    try {
      store.seedDocumentsIfEmpty(SEEDED_DOCUMENTS);
      for (const doc of store.loadKnowledgeDocuments()) {
        await knowledge.ingest(doc);
      }
    } catch (err) {
      console.error('[knowledge] ingestion failed:', err);
    }
  })();

  const pal = new PAL({ mode: 'SOVEREIGN' });
  const persistedSettings = loadSettings();
  if (persistedSettings.mode === 'ASSIST' || persistedSettings.mode === 'SOVEREIGN') {
    pal.setMode(persistedSettings.mode);
  }
  pal.registerAdapter(new VllmAdapter());
  pal.registerAdapter(new OllamaAdapter());
  pal.registerAdapter(new NimAdapter());
  registerLocalModels(pal);

  const llm = new LlmClient(pal, (taskType) => planModelChain(pal, taskType));

  // Stand up PluginHost with PipeCalcPlugin
  const pluginHost = new PluginHost();
  const trustedRoots = new Map([[keyId, keyPair.publicKeyPem]]);
  const { manifest, handlers } = createPipeCalcPlugin(keyId, keyPair.privateKeyPem);
  const admission = admitPlugin(manifest, trustedRoots);
  pluginHost.registerPlugin(admission.record, handlers);

  const executor = new AgentPipelineExecutor({
    pal,
    pluginHost,
    checkpointer,
    timeline,
    auditChain,
    keyId,
    signingKey: keyPair.privateKeyPem,
    knowledge,
    knowledgeReady,
    artifacts,
    llm,
    workspace: store,
  });

  const activeTasks = new Map<
    string,
    { token: CancellationToken; promise: Promise<PipelineResult> }
  >();
  const taskResults = new Map<string, PipelineResult>();

  const recipeLibrary = new RecipeLibrary([INSPECTION_APPROVAL_RECIPE]);
  const perceptionBridge = new PerceptionBridge();
  const auth = createAuthMiddleware({ auditChain, allowAnonymousDev: true });

  // Rendered deliverables are served from the local artifact store.
  app.use('/artifacts', express.static(artifacts.root));

  app.use(auth.authenticate);

  // Health check
  app.get('/health', async (_req, res) => {
    const [vllm, ollama, nim] = await Promise.all([
      pal.getAdapter('vllm')?.health(),
      pal.getAdapter('ollama')?.health(),
      pal.getAdapter('nim')?.health(),
    ]);
    res.json({
      status: 'ok',
      serverTime: new Date().toISOString(),
      db: store.filePath,
      knowledgeDocuments: knowledge.listDocuments().length,
      providers: { vllm, ollama, nim },
    });
  });

  // --- Knowledge Base ------------------------------------------------------
  app.get('/api/knowledge/documents', (_req, res) => {
    res.json({
      documents: knowledge.listDocuments().map((d) => ({
        ...d,
        freshness: knowledge.freshnessFor(d.documentId),
      })),
    });
  });

  app.get('/api/knowledge/search', async (req, res) => {
    await knowledgeReady;
    const q = String(req.query.q ?? '').trim();
    if (!q) {
      res.status(400).json({ error: 'Missing query parameter q' });
      return;
    }
    const results = await knowledge.retrieve(q, { topK: Number(req.query.topK ?? 5) });
    res.json({
      query: q,
      results: results.map((r) => ({
        chunkId: r.chunkId,
        documentId: r.documentId,
        content: r.content,
        score: r.score,
        freshness: knowledge.freshnessFor(r.documentId),
      })),
    });
  });

  // --- Digital Twin (virtual plant simulation) -----------------------------
  app.get('/api/digital-twin', (_req, res) => {
    res.json({
      components: TWIN_COMPONENTS,
      piping: PIPING_SEGMENT,
      operatingBaseline: TWIN_BASELINE,
    });
  });

  app.post('/api/digital-twin/simulate', async (req, res) => {
    try {
      const scenario = req.body?.scenario ?? req.body;
      const result = await runTwinScenario(scenario);
      res.json(result);
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Machine Simulation (compressors, valves) ----------------------------
  app.post('/api/machine-sim/compressor', async (req, res) => {
    try {
      const body = req.body ?? {};
      const result = await computeCompressor({
        fluid: String(body.fluid ?? 'Air'),
        suctionPressureBar: Number(body.suctionPressureBar ?? 1.0),
        dischargePressureBar: Number(body.dischargePressureBar ?? 8.0),
        suctionTemperatureC: Number(body.suctionTemperatureC ?? 25),
        massFlowKgs: Number(body.massFlowKgs ?? 2.5),
        efficiency: Number(body.efficiency ?? 0.75),
      });
      res.json(result);
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/machine-sim/valve', async (req, res) => {
    try {
      const body = req.body ?? {};
      const result = await computeValve({
        flowRateM3h: Number(body.flowRateM3h ?? 180),
        deltaPBar: Number(body.deltaPBar ?? 2.5),
        specificGravity: Number(body.specificGravity ?? 0.85),
      });
      res.json(result);
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Equipment catalog (DB-backed) ---------------------------------------
  app.get('/api/equipment', (_req, res) => {
    const catalog = store.getDataset<EquipmentRecord[]>('equipment-catalog') ?? EQUIPMENT_CATALOG;
    res.json({
      equipment: catalog.map((e) => ({ ...e, category: categoryOf(e) })),
    });
  });

  app.post('/api/machine-sim/equipment', async (req, res) => {
    try {
      const equipmentId = String(req.body?.equipmentId ?? '');
      const overrides = (req.body?.overrides as Record<string, number>) ?? {};
      const catalog = store.getDataset<EquipmentRecord[]>('equipment-catalog') ?? EQUIPMENT_CATALOG;
      const record = catalog.find((e) => e.id === equipmentId || e.tag === equipmentId);
      if (!record) {
        res.status(404).json({ error: `Equipment "${equipmentId}" not found` });
        return;
      }
      const result = await simulateEquipment(record, overrides);
      auditChain.append('tool.call', {
        tool: 'machine-simulation',
        equipmentId: record.id,
        category: result.category,
        source: result.source,
      });
      res.json(result);
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // AI explanation of a completed run (grounded on the computed values only).
  // Requires an online model — no canned fallback is ever served.
  app.post('/api/machine-sim/interpret', async (req, res) => {
    try {
      const facts = req.body?.facts as SimFactSheet;
      if (!facts || !Array.isArray(facts.outputs) || typeof facts.tag !== 'string') {
        res.status(400).json({ error: 'facts { tag, outputs[], inputs, warnings[], ... } required' });
        return;
      }
      const explanation = await explainSimulation(facts, llm);
      auditChain.append('tool.call', { tool: 'sim-interpret', equipment: facts.tag, source: explanation.source });
      res.json(explanation);
    } catch (err: unknown) {
      res.status(503).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // AI diagnosis of the active warnings of a completed run.
  app.post('/api/machine-sim/diagnose', async (req, res) => {
    try {
      const facts = req.body?.facts as SimFactSheet;
      if (!facts || !Array.isArray(facts.warnings) || typeof facts.tag !== 'string') {
        res.status(400).json({ error: 'facts { tag, warnings[], ... } required' });
        return;
      }
      const diagnosis = await diagnoseWarnings(facts, llm);
      auditChain.append('tool.call', { tool: 'sim-diagnose', equipment: facts.tag, warnings: facts.warnings.length, source: diagnosis.source });
      res.json(diagnosis);
    } catch (err: unknown) {
      res.status(503).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Blueprint Mesh (real P&ID graph) ------------------------------------
  app.get('/api/blueprint/graph', (req, res) => {
    const itemCount = Number(req.query.itemCount ?? 12);
    const documentId = String(req.query.documentId ?? 'MRPL-CDU-01');
    const sheet = generateSyntheticPidSheet({ itemCount, sheetId: documentId });
    const detector = new PidDrawingDetector();
    const detected = detector.detectFromDrawing(sheet.svgContent, documentId);
    const graph = new PidProcessGraph(sheet.groundTruth);
    const connections = sheet.groundTruth.connections;
    const nodes = sheet.groundTruth.tags.map((t) => ({
      id: t.tagId,
      tagNumber: t.tagNumber,
      symbolClass: t.symbolClass,
      service: t.lineNumber,
      bbox: t.bbox,
      detected: detected.tags.some((d) => d.tagNumber === t.tagNumber),
    }));
    const edges = connections.map((c) => ({
      from: nodes.find((n) => n.id === c.fromTagId)?.tagNumber ?? c.fromTagId,
      to: nodes.find((n) => n.id === c.toTagId)?.tagNumber ?? c.toTagId,
      lineNumber: c.lineNumber,
      upstream: graph.traceUpstream(nodes.find((n) => n.id === c.toTagId)?.tagNumber ?? ''),
    }));
    res.json({
      documentId,
      width: sheet.width,
      height: sheet.height,
      svg: sheet.svgContent,
      tags: detected.tags,
      nodes,
      edges,
    });
  });

  app.post('/api/blueprint/query', (req, res) => {
    const question = String(req.body?.question ?? 'What feeds V-102?');
    const itemCount = Number(req.body?.itemCount ?? 12);
    const documentId = String(req.body?.documentId ?? 'MRPL-CDU-01');
    const sheet = generateSyntheticPidSheet({ itemCount, sheetId: documentId });
    const graph = new PidProcessGraph(sheet.groundTruth);
    res.json({ documentId, ...graph.query(question) });
  });

  // AI graph construction: natural-language build instructions turn into
  // node/edge operations on the editable blueprint mesh.
  app.post('/api/blueprint/ai', async (req, res) => {
    const prompt = String(req.body?.prompt ?? '').trim();
    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }
    const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes : [];
    const edges = Array.isArray(req.body?.edges) ? req.body.edges : [];
    try {
      const ops = await planBlueprintOps(
        prompt,
        nodes.map((n: { id?: unknown; tagNumber?: unknown; symbolClass?: unknown }) => ({
          id: String(n.id ?? n.tagNumber ?? ''),
          tagNumber: String(n.tagNumber ?? n.id ?? ''),
          symbolClass: String(n.symbolClass ?? 'pressure-vessel'),
        })),
        edges.map((e: { from?: unknown; to?: unknown }) => ({ from: String(e.from ?? ''), to: String(e.to ?? '') })),
        llm,
      );
      auditChain.append('tool.call', {
        tool: 'blueprint-ai',
        source: ops.source,
        added: ops.addNodes.length,
        connected: ops.connect.length,
        removed: ops.removeNodes.length,
      });
      res.json({ ops });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/blueprint/load', (req, res) => {
    const documentId = String(req.query.documentId ?? 'MRPL-CDU-01');
    const saved = store.getBlueprint<unknown>(documentId);
    res.json(saved ? { documentId, source: 'user-edited', blueprint: saved } : { documentId, source: 'none' });
  });

  app.post('/api/blueprint/save', (req, res) => {
    const documentId = String(req.body?.documentId ?? 'MRPL-CDU-01');
    const blueprint = req.body?.blueprint as { nodes?: unknown[]; edges?: unknown[] } | undefined;
    if (!blueprint || !Array.isArray(blueprint.nodes)) {
      res.status(400).json({ error: 'blueprint.nodes[] is required' });
      return;
    }
    store.saveBlueprint(documentId, blueprint);
    auditChain.append('file.op', {
      action: 'blueprint-save',
      documentId,
      nodes: blueprint.nodes.length,
      edges: Array.isArray(blueprint.edges) ? blueprint.edges.length : 0,
    });
    res.json({ success: true, documentId, savedAt: new Date().toISOString() });
  });

  app.get('/api/blueprints', (_req, res) => {
    res.json({ blueprints: store.listBlueprints() });
  });

  // --- Notifications (data decay & governance) -----------------------------
  app.get('/api/notifications', (_req, res) => {
    const notifications: Array<Record<string, unknown>> = [];
    for (const doc of knowledge.listDocuments()) {
      const freshness = knowledge.freshnessFor(doc.documentId);
      if (!freshness || freshness.state === 'FRESH' || freshness.state === 'RECORD') continue;
      notifications.push({
        id: `decay-${doc.documentId}`,
        kind: 'freshness',
        severity:
          freshness.state === 'CRITICAL'
            ? 'critical'
            : freshness.state === 'STALE'
              ? 'warning'
              : 'info',
        title: `${doc.title}`,
        detail: `Decay ${(freshness.decay * 100).toFixed(0)}% · state ${freshness.state}${freshness.reason ? ` · ${freshness.reason}` : ''}`,
        documentId: doc.documentId,
        decay: freshness.decay,
        state: freshness.state,
        requiresAcknowledgement: freshness.requiresAcknowledgement,
      });
    }
    const recentAlerts = auditChain
      .getEvents()
      .filter((e) => e.kind === 'guard.alert')
      .slice(-5)
      .reverse()
      .map((e) => ({
        id: e.eventId,
        kind: 'guard',
        severity: 'warning',
        title: String((e.payload as Record<string, unknown>)['action'] ?? 'guard alert'),
        detail: JSON.stringify(e.payload).slice(0, 160),
        ts: e.ts,
      }));
    res.json({ notifications: [...notifications, ...recentAlerts] });
  });

  // --- Artifacts -----------------------------------------------------------
  app.get('/api/artifacts', (req, res) => {
    res.json({ artifacts: artifacts.list(req.query.taskId ? String(req.query.taskId) : undefined) });
  });

  app.get('/api/tasks/:id/artifacts', (req, res) => {
    res.json({ taskId: String(req.params.id), artifacts: artifacts.list(String(req.params.id)) });
  });

  // Convert any stored artifact into a self-contained HTML preview
  // (xlsx sheets, docx text, pptx outline, html/svg/md/json pass-through).
  app.get('/api/artifacts/:artifactId/preview', (req, res) => {
    const stored = artifacts.getArtifact(String(req.params.artifactId));
    if (!stored || !stored.filePath) {
      res.status(404).json({ error: `Artifact "${req.params.artifactId}" not found` });
      return;
    }
    try {
      const buffer = readArtifactFile(stored.filePath);
      void renderArtifactPreview(stored.fileName, buffer).then((p) => res.json(p));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- PAL Model Registry & Mode (Section 7.1 & TDD Section 4) -------------
  app.get('/api/models', (_req, res) => {
    res.json({
      mode: pal.getMode(),
      models: pal.getRegistry().getAll(),
      preferredModel: llm.getPreferredModel(),
    });
  });

  // Operator model picker: pin one model for all LLM work, or revert to auto.
  app.post('/api/models/preferred', (req, res) => {
    const modelId = req.body?.modelId;
    if (modelId === null || modelId === '') {
      llm.setPreferredModel(null);
      auditChain.append('guard.alert', { action: 'model-preferred-clear' });
      res.json({ preferredModel: null });
      return;
    }
    const entry = pal.getRegistry().get(String(modelId));
    if (!entry) {
      res.status(404).json({ error: `Model "${modelId}" not registered` });
      return;
    }
    // An outside-perimeter pick opens the perimeter: the operator is sovereign,
    // so the switch is honored and recorded on the audit chain rather than refused.
    if (pal.getMode() === 'SOVEREIGN' && entry.trustBoundary === 'outside-perimeter') {
      pal.setMode('ASSIST');
      saveSettings({ mode: 'ASSIST' });
      auditChain.append('guard.alert', {
        action: 'perimeter-opened-by-model-pick',
        model: entry.modelId,
        reason: 'operator selected an outside-perimeter model',
      });
    }
    llm.setPreferredModel(entry.modelId);
    auditChain.append('guard.alert', { action: 'model-preferred-set', model: entry.modelId });
    res.json({ preferredModel: entry.modelId, mode: pal.getMode() });
  });

  app.get('/api/providers', async (_req, res) => {
    const reports = await pal.getHealthReports();
    res.json({
      mode: pal.getMode(),
      nimModel: NIM_MODEL_ID,
      providers: Array.from(reports.values()),
    });
  });

  app.post('/api/providers/nim', (req, res) => {
    const adapter = pal.getAdapter('nim') as NimAdapter | undefined;
    if (!adapter) {
      res.status(500).json({ error: 'NIM adapter not registered' });
      return;
    }
    const apiKey = (req.body?.apiKey as string) ?? '';
    const baseUrl = req.body?.baseUrl as string | undefined;
    adapter.configure({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
    auditChain.append('guard.alert', {
      action: 'nim-configure',
      configured: adapter.isConfigured(),
      model: NIM_MODEL_ID,
    });
    res.json({ success: true, configured: adapter.isConfigured(), model: NIM_MODEL_ID });
  });

  app.post('/api/mode', (req, res) => {
    const targetMode = req.body?.mode;
    if (targetMode === 'SOVEREIGN' || targetMode === 'ASSIST') {
      pal.setMode(targetMode);
      saveSettings({ mode: targetMode });
      auditChain.append('guard.alert', { action: 'mode-switch', mode: targetMode });
      res.json({ success: true, mode: pal.getMode() });
    } else {
      res.status(400).json({ error: 'Invalid mode. Must be "SOVEREIGN" or "ASSIST"' });
    }
  });

  app.post('/api/chat', async (req, res) => {
    const modelId = (req.body?.model as string) || LOCAL_GENERAL_MODEL;
    const messages = (req.body?.messages as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>) || [];
    const taskId = (req.body?.taskId as string) || `chat-${randomUUID().slice(0, 8)}`;

    try {
      const entry = pal.getRegistry().get(modelId);
      const chatReq = ChatRequest.parse({
        taskId,
        stepId: 'chat-step-1',
        taskType: entry?.taskTypes[0] || 'code',
        messages: messages.length > 0 ? messages : [{ role: 'user', content: 'Ping' }],
        toolNames: [],
        seed: null,
        temperature: 0.2,
        stream: false,
      });

      const result = await pal.executeChat(
        chatReq,
        entry ? { forceModel: entry } : undefined,
      );

      res.json({
        content: result.response.content,
        model: result.auditEvent.model,
        locality: result.auditEvent.locality,
        trustBoundary: result.auditEvent.trustBoundary,
        latencyMs: result.auditEvent.latencyMs,
        tokensIn: result.auditEvent.tokensIn,
        tokensOut: result.auditEvent.tokensOut,
      });
    } catch (err: unknown) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // --- Recipe Management (Section 18 P5 User-Editable Workflows) -----------
  app.get('/api/recipes', (_req, res) => {
    res.json({ recipes: recipeLibrary.listRecipes() });
  });

  app.get('/api/recipes/:id', (req, res) => {
    const id = String(req.params.id);
    const r = recipeLibrary.getRecipe(id);
    if (!r) {
      res.status(404).json({ error: `Recipe "${id}" not found` });
      return;
    }
    res.json(r);
  });

  app.post('/api/recipes', auth.requirePermission('plugin.install'), (req, res) => {
    try {
      const parsed = Recipe.parse(req.body);
      recipeLibrary.registerRecipe(parsed);
      res.status(201).json({ success: true, recipeId: parsed.recipeId, recipe: parsed });
    } catch (err: unknown) {
      res.status(400).json({ error: 'Invalid recipe schema', details: String(err) });
    }
  });

  app.delete('/api/recipes/:id', auth.requirePermission('plugin.enable'), (req, res) => {
    const id = String(req.params.id);
    const deleted = recipeLibrary.deleteRecipe(id);
    if (!deleted) {
      res.status(404).json({ error: `Recipe "${id}" not found` });
      return;
    }
    res.json({ success: true, recipeId: id });
  });

  // --- Perception Capability Service Endpoints (Section 7.2 & 18 P5) -------
  app.post('/api/perception/extract_pid', async (req, res) => {
    const documentId = (req.body?.documentId as string) || 'MRPL-CDU-01';
    const itemCount = (req.body?.itemCount as number) || 7;
    const result = await perceptionBridge.extractPid(documentId, itemCount);
    res.json(result);
  });

  app.post('/api/perception/query_topology', async (req, res) => {
    const documentId = (req.body?.documentId as string) || 'MRPL-CDU-01';
    const question = (req.body?.question as string) || 'What feeds V-102?';
    const result = await perceptionBridge.queryTopology(documentId, question);
    res.json(result);
  });

  // --- Assistant router ------------------------------------------------------
  // Direct, deterministic dispatch — no classifier model in the loop.
  // Greetings and chit-chat stay conversational; everything else is run as
  // an audited pipeline task. The connectors + chat suggestions advertise
  // what the workbench can do.
  app.post('/api/assistant', auth.requirePermission('task.create'), async (req, res) => {
    const history = (
      req.body?.messages as Array<{ role: 'user' | 'assistant'; content: string }> ?? []
    ).filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')).slice(-12);
    const goal = [...history].reverse().find((m) => m.role === 'user')?.content.trim();
    if (!goal) {
      res.status(400).json({ error: 'messages[] with at least one user message required' });
      return;
    }
    const contextTaskId = (req.body?.contextTaskId as string) || undefined;
    const mode = pal.getMode();

    // Conversational path: greetings, thanks, small talk.
    if (isSmallTalk(goal)) {
      let content: string | undefined;
      let chatModel: string | undefined;
      if (llm.isConfigured()) {
        const r = await llm.generate({
          taskId: `chat-${randomUUID().slice(0, 8)}`,
          stepId: 'chat',
          taskType: 'document',
          system:
            'You are the Outskirts sovereign AI workbench assistant at an oil refinery. Reply conversationally in 1-3 short sentences. Never dump document text; never mention pipelines or routing.',
          user: goal,
          maxTokens: 200,
          timeoutMs: 60000,
        });
        if (r.ok && r.text.trim()) {
          content = r.text.trim();
          chatModel = r.model;
        }
      }
      res.json({
        mode: 'chat',
        content:
          content ??
          'Assistant model is offline. Enable a local model or configure the assist provider in the admin console, then try again.',
        ...(chatModel ? { model: chatModel } : {}),
      });
      return;
    }

    // Everything else is a real task — direct execution, no classifying.
    const taskId = `task-${randomUUID().slice(0, 8)}`;
    const token = new CancellationToken();
    const promise = executor.executeTask(taskId, goal, { mode, token, contextTaskId });
    promise
      .then((result) => taskResults.set(taskId, result))
      .catch(() => {
        /* failure surfaced through timeline + checkpoint */
      });
    activeTasks.set(taskId, { token, promise });
    res.json({ mode: 'task', taskId, wsUrl: `/ws?taskId=${taskId}` });
  });

  // Launch a new pipeline task
  app.post('/api/tasks', auth.requirePermission('task.create'), (req, res) => {
    const taskId = (req.body?.taskId as string) || `task-${randomUUID().slice(0, 8)}`;
    const goal = (req.body?.goal as string) || 'Refinery Piping Inspection Approval';
    const mode = (req.body?.mode as 'SOVEREIGN' | 'ASSIST') || 'SOVEREIGN';
    // Conversation context: the previous task whose data a follow-up
    // ("visualize this data") should operate on.
    const contextTaskId = (req.body?.contextTaskId as string) || undefined;

    const token = new CancellationToken();
    const promise = executor.executeTask(taskId, goal, { mode, token, contextTaskId });
    promise
      .then((result) => taskResults.set(taskId, result))
      .catch(() => {
        /* failure surfaced through timeline + checkpoint */
      });

    activeTasks.set(taskId, { token, promise });

    res.status(202).json({
      taskId,
      goal,
      status: 'pending',
      wsUrl: `/ws?taskId=${taskId}`,
    });
  });

  // Task checkpoint status
  app.get('/api/tasks/:id', async (req, res) => {
    const id = String(req.params.id);
    const cp = await checkpointer.get(id);
    if (!cp) {
      res.status(404).json({ error: `Task "${id}" not found` });
      return;
    }
    res.json(cp);
  });

  // Full task result (assistant content, DNA, artifacts)
  app.get('/api/tasks/:id/result', async (req, res) => {
    const id = String(req.params.id);
    const result = taskResults.get(id);
    if (result) {
      res.json({
        taskId: id,
        status: result.status,
        artifactContent: result.artifactContent,
        dna: result.dna,
        c2paManifest: result.c2paManifest,
        stepsCompleted: result.stepsCompleted,
        artifacts: result.artifacts ?? artifacts.list(id),
      });
      return;
    }
    const cp = await checkpointer.get(id);
    if (!cp) {
      res.status(404).json({ error: `Task "${id}" not found` });
      return;
    }
    res.json({
      taskId: id,
      status: cp.status,
      completedSteps: cp.completedSteps,
      artifacts: artifacts.list(id),
    });
  });

  // Replay events since monotonic sequence number
  app.get('/api/tasks/:id/events', (req, res) => {
    const id = String(req.params.id);
    const since = parseInt((req.query.since as string) || '0', 10);
    const events = timeline.getEventsSince(id, since);
    res.json({ taskId: id, since, events });
  });

  // Cooperative cancellation
  app.post('/api/tasks/:id/cancel', auth.requirePermission('task.cancel'), (req, res) => {
    const id = String(req.params.id);
    const task = activeTasks.get(id);
    if (!task) {
      res.status(404).json({ error: `Active task "${id}" not found` });
      return;
    }
    task.token.cancel('User requested cancellation');
    res.json({ taskId: id, status: 'cancelling' });
  });

  return {
    app,
    timeline,
    executor,
    auditChain,
    recipeLibrary,
    perceptionBridge,
    keyId,
    publicKeyPem: keyPair.publicKeyPem,
    activeTasks,
    store,
    artifacts,
    knowledge,
  };
}
