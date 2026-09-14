import express from 'express';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import {
  AuditChain,
  generateEd25519KeyPair,
} from '@outskirts/sovereignty';
import {
  PAL,
  createDefaultModelRegistry,
  VllmAdapter,
  OllamaAdapter,
  NimAdapter,
} from '@outskirts/pal';
import {
  PluginHost,
  admitPlugin,
  createPipeCalcPlugin,
} from '@outskirts/plugin-sdk';
import { TimelineManager } from './gateway/timeline.js';
import { TaskWebSocketGateway } from './gateway/ws-server.js';
import { MemoryCheckpointer } from './agent/checkpointer.js';
import { AgentPipelineExecutor, type PipelineResult } from './agent/executor.js';
import { CancellationToken } from './agent/cancellation.js';
import { INSPECTION_APPROVAL_RECIPE } from './agent/recipe.js';
import { RecipeLibrary } from './agent/recipe-builder.js';
import { createAuthMiddleware } from './gateway/auth.js';
import { PerceptionBridge } from '../../../services/perception/bridge.js';
import { Recipe, ChatRequest } from '@outskirts/schemas';

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
}

export function createServer(): ServerContext {
  const app = express();
  app.use(express.json());

  const keyPair = generateEd25519KeyPair();
  const keyId = 'outskirts-gateway-key-01';

  const auditChain = new AuditChain();
  const timeline = new TimelineManager();
  const checkpointer = new MemoryCheckpointer();
  const pal = new PAL({ mode: 'SOVEREIGN' });
  pal.registerAdapter(new VllmAdapter());
  pal.registerAdapter(new OllamaAdapter());
  pal.registerAdapter(new NimAdapter());

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
  });

  const activeTasks = new Map<
    string,
    { token: CancellationToken; promise: Promise<PipelineResult> }
  >();

  const recipeLibrary = new RecipeLibrary([INSPECTION_APPROVAL_RECIPE]);
  const perceptionBridge = new PerceptionBridge();
  const auth = createAuthMiddleware({ auditChain, allowAnonymousDev: true });

  app.use(auth.authenticate);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  // --- PAL Model Registry & Mode (Section 7.1 & TDD Section 4) -------------
  app.get('/api/models', (_req, res) => {
    res.json({
      mode: pal.getMode(),
      models: pal.getRegistry().getAll(),
    });
  });

  app.post('/api/mode', (req, res) => {
    const targetMode = req.body?.mode;
    if (targetMode === 'SOVEREIGN' || targetMode === 'ASSIST') {
      pal.setMode(targetMode);
      auditChain.append('guard.alert', { action: 'mode-switch', mode: targetMode });
      res.json({ success: true, mode: pal.getMode() });
    } else {
      res.status(400).json({ error: 'Invalid mode. Must be "SOVEREIGN" or "ASSIST"' });
    }
  });

  app.post('/api/chat', async (req, res) => {
    const modelId = (req.body?.model as string) || 'qwen2.5-coder-7b-awq';
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

  // Launch a new pipeline task
  app.post('/api/tasks', auth.requirePermission('task.create'), (req, res) => {
    const taskId = (req.body?.taskId as string) || `task-${randomUUID().slice(0, 8)}`;
    const goal = (req.body?.goal as string) || 'Refinery Piping Inspection Approval';
    const mode = (req.body?.mode as 'SOVEREIGN' | 'ASSIST') || 'SOVEREIGN';

    const token = new CancellationToken();
    const promise = executor.executeTask(taskId, goal, { mode, token });

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
  };
}
