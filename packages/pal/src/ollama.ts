import type {
  ChatRequest,
  HealthReport,
  Locality,
  ProviderCapability,
  ProviderId,
  RegistryEntry,
  TrustBoundary,
} from '@outskirts/schemas';
import type { ProviderAdapter, ChatResponse, StreamChunk } from './adapter.js';
import { ollamaFormat } from './constraint.js';

export interface OllamaAdapterOptions {
  baseUrl?: string;
  locality?: Locality;
  trustBoundary?: TrustBoundary;
  fetchFn?: typeof fetch;
}

export class OllamaAdapter implements ProviderAdapter {
  public readonly id: ProviderId = 'ollama';
  public readonly locality: Locality;
  public readonly trustBoundary: TrustBoundary;
  public readonly endpointHost: string;
  public capabilities: ProviderCapability[] = [
    'text',
    'tool-use',
    'guided-json',
    'seeded',
    'streaming',
  ];

  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options?: OllamaAdapterOptions) {
    this.baseUrl = options?.baseUrl ?? 'http://127.0.0.1:11434';
    this.locality = options?.locality ?? 'loopback';
    this.trustBoundary = options?.trustBoundary ?? 'inside-perimeter';
    this.endpointHost = new URL(this.baseUrl).host;
    this.fetch = options?.fetchFn ?? globalThis.fetch;
  }

  public async chat(req: ChatRequest, model: RegistryEntry): Promise<ChatResponse> {
    const start = performance.now();

    // Map messages
    const messages = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
      name: m.name,
    }));

    // Mandatory: contextWindow passed as num_ctx to prevent silent truncation
    const options: Record<string, unknown> = {
      num_ctx: model.contextWindow,
      temperature: req.temperature,
    };
    if (req.seed !== null) {
      options.seed = req.seed;
    }

    const payload: Record<string, unknown> = {
      model: model.modelId,
      messages,
      stream: false,
      options,
    };

    // Schema object, not the string 'json' -- the latter constrains syntax only.
    if (req.outputSchemaRef) {
      payload.format = ollamaFormat(req.outputSchemaRef);
    }

    const res = await this.fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Ollama chat failed (${res.status}): ${errText}`);
    }

    const json = (await res.json()) as {
      message?: { content?: string; role?: string; tool_calls?: unknown[] };
      prompt_eval_count?: number;
      eval_count?: number;
      total_duration?: number;
      load_duration?: number;
    };

    const latencyMs = performance.now() - start;
    const loadMs = json.load_duration ? json.load_duration / 1_000_000 : 0;

    return {
      content: json.message?.content ?? '',
      role: 'assistant',
      tokensIn: json.prompt_eval_count ?? 0,
      tokensOut: json.eval_count ?? 0,
      latencyMs,
      loadMs,
    };
  }

  public async *stream(
    req: ChatRequest,
    model: RegistryEntry,
  ): AsyncIterable<StreamChunk> {
    const options: Record<string, unknown> = {
      num_ctx: model.contextWindow,
      temperature: req.temperature,
    };
    if (req.seed !== null) {
      options.seed = req.seed;
    }

    const payload: Record<string, unknown> = {
      model: model.modelId,
      messages: req.messages,
      stream: true,
      options,
    };

    if (req.outputSchemaRef) {
      payload.format = ollamaFormat(req.outputSchemaRef);
    }

    const res = await this.fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama stream request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line) as {
            message?: { content?: string };
            done: boolean;
            prompt_eval_count?: number;
            eval_count?: number;
          };
          yield {
            contentChunk: parsed.message?.content ?? '',
            done: parsed.done,
            tokensIn: parsed.prompt_eval_count,
            tokensOut: parsed.eval_count,
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  public async health(): Promise<HealthReport> {
    const checkedAt = new Date().toISOString();
    try {
      const res = await this.fetch(`${this.baseUrl}/api/ps`, { method: 'GET' });
      if (!res.ok) {
        return {
          providerId: this.id,
          healthy: false,
          checkedAt,
          residentModels: [],
          devicePlacement: 'unknown',
          detail: `HTTP ${res.status}: ${res.statusText}`,
        };
      }
      const data = (await res.json()) as { models?: Array<{ name: string; size_vram?: number }> };
      const residentModels = (data.models ?? []).map((m) => m.name);
      const hasVram = (data.models ?? []).some((m) => (m.size_vram ?? 0) > 0);
      const devicePlacement = residentModels.length === 0 ? 'cpu' : hasVram ? 'gpu' : 'cpu';

      return {
        providerId: this.id,
        healthy: true,
        checkedAt,
        residentModels,
        devicePlacement,
      };
    } catch (err: unknown) {
      return {
        providerId: this.id,
        healthy: false,
        checkedAt,
        residentModels: [],
        devicePlacement: 'unknown',
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
