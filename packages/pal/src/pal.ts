import { randomUUID } from 'node:crypto';
import {
  PalAuditEvent,
  type ChatRequest,
  type HealthReport,
  type ProviderId,
  type ProviderMode,
  type RegistryEntry,
  type Seq,
} from '@outskirts/schemas';
import type { ProviderAdapter, ChatResponse } from './adapter.js';
import { ModelRegistry, createDefaultModelRegistry } from './registry.js';
import { resolveRoute, RoutingRefusalError } from './router.js';
import {
  CassetteStore,
  computeCassetteKey,
  hashPromptMessages,
  type CassetteMode,
} from './cassette.js';

export interface PalOptions {
  mode?: ProviderMode;
  registry?: ModelRegistry;
  adapters?: Map<ProviderId, ProviderAdapter>;
  cassetteStore?: CassetteStore;
  cassetteMode?: CassetteMode;
  auditListener?: (event: PalAuditEvent) => void;
}

export interface PalExecutionResult {
  response: ChatResponse;
  auditEvent: PalAuditEvent;
}

export class PAL {
  private mode: ProviderMode;
  private registry: ModelRegistry;
  private adapters: Map<ProviderId, ProviderAdapter>;
  private cassetteStore: CassetteStore;
  private cassetteMode: CassetteMode;
  private auditListener?: (event: PalAuditEvent) => void;
  private eventSeq: number = 0;

  constructor(options?: PalOptions) {
    this.mode = options?.mode ?? 'SOVEREIGN';
    this.registry = options?.registry ?? createDefaultModelRegistry();
    this.adapters = options?.adapters ?? new Map();
    this.cassetteStore = options?.cassetteStore ?? new CassetteStore();
    this.cassetteMode = options?.cassetteMode ?? 'passthrough';
    this.auditListener = options?.auditListener;
  }

  public getMode(): ProviderMode {
    return this.mode;
  }

  public setMode(mode: ProviderMode): void {
    this.mode = mode;
  }

  public getRegistry(): ModelRegistry {
    return this.registry;
  }

  public getCassetteStore(): CassetteStore {
    return this.cassetteStore;
  }

  public setCassetteMode(mode: CassetteMode): void {
    this.cassetteMode = mode;
  }

  public registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  public getAdapter(id: ProviderId): ProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  public async getHealthReports(): Promise<Map<ProviderId, HealthReport>> {
    const reports = new Map<ProviderId, HealthReport>();
    for (const [id, adapter] of this.adapters.entries()) {
      try {
        const report = await adapter.health();
        reports.set(id, report);
      } catch (err: unknown) {
        reports.set(id, {
          providerId: id,
          healthy: false,
          checkedAt: new Date().toISOString(),
          residentModels: [],
          devicePlacement: 'unknown',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return reports;
  }

  /**
   * Execute an inference request through the PAL.
   * Emits a PalAuditEvent at the moment of the call.
   */
  public async executeChat(
    req: ChatRequest,
    options?: { forceModel?: RegistryEntry },
  ): Promise<PalExecutionResult> {
    const promptHash = hashPromptMessages(req.messages);
    const start = performance.now();
    this.eventSeq++;
    const seq: Seq = this.eventSeq;
    const eventId = `pal-evt-${seq}-${randomUUID().slice(0, 8)}`;

    let model: RegistryEntry;
    let adapter: ProviderAdapter;

    try {
      if (options?.forceModel) {
        model = options.forceModel;
        // Check sovereignty mode guard even if forced
        if (this.mode === 'SOVEREIGN' && model.trustBoundary === 'outside-perimeter') {
          throw new RoutingRefusalError(
            'refused-locality',
            `Model ${model.modelId} refused: outside perimeter in SOVEREIGN mode`,
          );
        }
      } else {
        const healthReports = await this.getHealthReports();
        const route = resolveRoute(req, this.mode, this.registry, healthReports);
        model = route.model;
      }

      const foundAdapter = this.adapters.get(model.providerId);
      if (!foundAdapter) {
        throw new Error(`No adapter registered for provider "${model.providerId}"`);
      }
      adapter = foundAdapter;
    } catch (err: unknown) {
      if (err instanceof RoutingRefusalError) {
        const refusalEvent = PalAuditEvent.parse({
          eventId,
          seq,
          ts: new Date().toISOString(),
          taskId: req.taskId,
          stepId: req.stepId,
          providerId: 'vllm',
          locality: 'internet',
          trustBoundary: 'outside-perimeter',
          endpointHost: 'refused',
          model: 'none',
          modelDigest: 'none',
          quantisation: 'none',
          contextWindow: 1,
          promptTemplateHash: promptHash,
          seed: req.seed,
          cacheHit: false,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: performance.now() - start,
          loadMs: 0,
          status: 'refused-locality',
        });
        this.emitAudit(refusalEvent);
      }
      throw err;
    }

    const cassetteKey = computeCassetteKey(
      model.modelDigest,
      promptHash,
      req.seed,
      req.outputSchemaRef,
    );

    // Replay mode from cassette
    if (this.cassetteMode === 'replay') {
      const entry = this.cassetteStore.get(cassetteKey);
      if (entry) {
        const auditEvent = PalAuditEvent.parse({
          eventId,
          seq,
          ts: new Date().toISOString(),
          taskId: req.taskId,
          stepId: req.stepId,
          providerId: model.providerId,
          locality: model.locality,
          trustBoundary: model.trustBoundary,
          endpointHost: adapter.endpointHost,
          model: model.modelId,
          modelDigest: model.modelDigest,
          quantisation: model.quantisation,
          contextWindow: model.contextWindow,
          promptTemplateHash: promptHash,
          seed: req.seed,
          cacheHit: true,
          tokensIn: entry.response.tokensIn,
          tokensOut: entry.response.tokensOut,
          latencyMs: 1.0, // Replay latency floor
          loadMs: 0,
          status: 'ok',
        });
        this.emitAudit(auditEvent);
        return { response: entry.response, auditEvent };
      }
      throw new Error(`Cassette not found for key: ${cassetteKey}`);
    }

    // Live execution
    try {
      const response = await adapter.chat(req, model);

      if (this.cassetteMode === 'record') {
        this.cassetteStore.set({
          key: cassetteKey,
          modelDigest: model.modelDigest,
          promptHash,
          seed: req.seed,
          outputSchemaRef: req.outputSchemaRef,
          response,
          recordedAt: new Date().toISOString(),
        });
      }

      const auditEvent = PalAuditEvent.parse({
        eventId,
        seq,
        ts: new Date().toISOString(),
        taskId: req.taskId,
        stepId: req.stepId,
        providerId: model.providerId,
        locality: model.locality,
        trustBoundary: model.trustBoundary,
        endpointHost: adapter.endpointHost,
        model: model.modelId,
        modelDigest: model.modelDigest,
        quantisation: model.quantisation,
        contextWindow: model.contextWindow,
        promptTemplateHash: promptHash,
        seed: req.seed,
        cacheHit: false,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        latencyMs: response.latencyMs,
        loadMs: response.loadMs,
        status: 'ok',
      });
      this.emitAudit(auditEvent);

      return { response, auditEvent };
    } catch (err: unknown) {
      const errorEvent = PalAuditEvent.parse({
        eventId,
        seq,
        ts: new Date().toISOString(),
        taskId: req.taskId,
        stepId: req.stepId,
        providerId: model.providerId,
        locality: model.locality,
        trustBoundary: model.trustBoundary,
        endpointHost: adapter.endpointHost,
        model: model.modelId,
        modelDigest: model.modelDigest,
        quantisation: model.quantisation,
        contextWindow: model.contextWindow,
        promptTemplateHash: promptHash,
        seed: req.seed,
        cacheHit: false,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: performance.now() - start,
        loadMs: 0,
        status: 'error',
      });
      this.emitAudit(errorEvent);
      throw err;
    }
  }

  private emitAudit(event: PalAuditEvent): void {
    if (this.auditListener) {
      try {
        this.auditListener(event);
      } catch (err) {
        console.error('Audit listener threw an error:', err);
      }
    }
  }
}
