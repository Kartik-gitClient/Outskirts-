import { ChatRequest, type TaskType, type RegistryEntry } from '@outskirts/schemas';
import type { PAL } from '@outskirts/pal';

export interface LlmRequest {
  taskId: string;
  stepId: string;
  taskType: TaskType;
  system?: string;
  user: string;
  outputSchemaRef?: string;
  seed?: number | null;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LlmResponse {
  ok: boolean;
  text: string;
  model?: string;
  providerId?: string;
  latencyMs?: number;
  error?: string;
}

const TIMEOUT = Symbol('llm-timeout');

/**
 * Thin, non-fatal wrapper around the PAL with an explicit fallback chain.
 *
 * Candidate order is supplied by the caller (local sovereign model first, then
 * NVIDIA NIM assist model). The PAL still enforces perimeter rules: a NIM
 * candidate is refused in SOVEREIGN mode, so the chain degrades cleanly. Every
 * call returns a result object instead of throwing, and is timeout-bounded, so
 * a slow or absent model can never fail a task.
 */
export class LlmClient {
  private preferredModel: string | null = null;

  constructor(
    private readonly pal: PAL,
    private readonly planModels: (taskType: TaskType) => string[],
  ) {}

  public isConfigured(): boolean {
    return this.pal.getRegistry().getAll().some((m) => m.status === 'enabled');
  }

  /** Operator-selected model override (model picker). null = automatic chain. */
  public setPreferredModel(modelId: string | null): void {
    this.preferredModel = modelId;
  }

  public getPreferredModel(): string | null {
    return this.preferredModel;
  }

  public async generate(req: LlmRequest): Promise<LlmResponse> {
    // Operator override first; falls through to the chain on failure so a
    // dead manual pick can never hard-fail a task.
    if (this.preferredModel) {
      const entry = this.pal.getRegistry().get(this.preferredModel);
      if (entry) {
        const res = await this.tryGenerate(req, entry);
        if (res.ok) return res;
      }
    }

    const modelIds = this.planModels(req.taskType);
    const errors: string[] = [];

    for (const modelId of modelIds) {
      const entry = this.pal.getRegistry().get(modelId);
      if (!entry) continue;
      const res = await this.tryGenerate(req, entry);
      if (res.ok) return res;
      errors.push(`${modelId}: ${res.error ?? 'failed'}`);
    }

    return { ok: false, text: '', error: errors.join(' | ') || 'no-model-available' };
  }

  /** Generate and extract a JSON object, tolerating markdown code fences. */
  public async generateJson<T>(req: LlmRequest): Promise<{ ok: boolean; value?: T; raw: string; error?: string }> {
    const res = await this.generate(req);
    if (!res.ok) return { ok: false, raw: '', error: res.error };
    const parsed = extractJson<T>(res.text);
    if (parsed === undefined) return { ok: false, raw: res.text, error: 'no-json-in-response' };
    return { ok: true, value: parsed, raw: res.text };
  }

  private async tryGenerate(req: LlmRequest, entry: RegistryEntry): Promise<LlmResponse> {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content: req.user });

    let chatReq;
    try {
      chatReq = ChatRequest.parse({
        taskId: req.taskId,
        stepId: req.stepId,
        taskType: req.taskType,
        messages,
        toolNames: [],
        seed: req.seed ?? 42,
        temperature: req.temperature ?? 0.2,
        stream: false,
        ...(req.outputSchemaRef ? { outputSchemaRef: req.outputSchemaRef } : {}),
        ...(req.maxTokens ? { maxTokens: req.maxTokens } : {}),
      });
    } catch (err) {
      return { ok: false, text: '', error: `invalid-request: ${String(err)}` };
    }

    const timeoutMs = req.timeoutMs ?? 60000;
    try {
      const result = await Promise.race([
        this.pal.executeChat(chatReq, { forceModel: entry }),
        new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), timeoutMs)),
      ]);

      if (result === TIMEOUT) {
        return { ok: false, text: '', model: entry.modelId, error: `timeout after ${timeoutMs}ms` };
      }
      return {
        ok: true,
        text: result.response.content,
        model: result.auditEvent.model,
        providerId: result.auditEvent.providerId,
        latencyMs: result.auditEvent.latencyMs,
      };
    } catch (err) {
      return {
        ok: false,
        text: '',
        model: entry.modelId,
        providerId: entry.providerId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function extractJson<T>(text: string): T | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return undefined;
  }
}
