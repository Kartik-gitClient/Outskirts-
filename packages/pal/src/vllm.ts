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

export interface VllmAdapterOptions {
  baseUrl?: string;
  locality?: Locality;
  trustBoundary?: TrustBoundary;
  fetchFn?: typeof fetch;
}

export class VllmAdapter implements ProviderAdapter {
  public readonly id: ProviderId = 'vllm';
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

  constructor(options?: VllmAdapterOptions) {
    this.baseUrl = options?.baseUrl ?? 'http://127.0.0.1:8000';
    this.locality = options?.locality ?? 'loopback';
    this.trustBoundary = options?.trustBoundary ?? 'inside-perimeter';
    this.endpointHost = new URL(this.baseUrl).host;
    this.fetch = options?.fetchFn ?? globalThis.fetch;
  }

  public async chat(req: ChatRequest, model: RegistryEntry): Promise<ChatResponse> {
    const start = performance.now();

    const messages = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
      name: m.name,
    }));

    const payload: Record<string, unknown> = {
      model: model.modelId,
      messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      stream: false,
    };

    if (req.seed !== null) {
      payload.seed = req.seed;
    }

    if (req.outputSchemaRef) {
      // vLLM guided decoding parameter
      payload.guided_json = req.outputSchemaRef;
    }

    const res = await this.fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`vLLM chat failed (${res.status}): ${errText}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string; role?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const choice = json.choices?.[0];
    const latencyMs = performance.now() - start;

    return {
      content: choice?.message?.content ?? '',
      role: 'assistant',
      tokensIn: json.usage?.prompt_tokens ?? 0,
      tokensOut: json.usage?.completion_tokens ?? 0,
      latencyMs,
      loadMs: 0, // vLLM models are kept resident in VRAM
    };
  }

  public async *stream(
    req: ChatRequest,
    model: RegistryEntry,
  ): AsyncIterable<StreamChunk> {
    const payload: Record<string, unknown> = {
      model: model.modelId,
      messages: req.messages,
      temperature: req.temperature,
      stream: true,
    };

    if (req.seed !== null) {
      payload.seed = req.seed;
    }

    if (req.outputSchemaRef) {
      payload.guided_json = req.outputSchemaRef;
    }

    const res = await this.fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      throw new Error(`vLLM stream request failed (${res.status})`);
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
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') {
            yield { contentChunk: '', done: true };
            return;
          }
          const parsed = JSON.parse(dataStr) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = parsed.choices?.[0]?.delta?.content ?? '';
          yield {
            contentChunk: delta,
            done: false,
            tokensIn: parsed.usage?.prompt_tokens,
            tokensOut: parsed.usage?.completion_tokens,
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
      const res = await this.fetch(`${this.baseUrl}/v1/models`, { method: 'GET' });
      if (!res.ok) {
        return {
          providerId: this.id,
          healthy: false,
          checkedAt,
          residentModels: [],
          devicePlacement: 'gpu',
          detail: `HTTP ${res.status}: ${res.statusText}`,
        };
      }
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      const residentModels = (data.data ?? []).map((m) => m.id);

      return {
        providerId: this.id,
        healthy: true,
        checkedAt,
        residentModels,
        devicePlacement: 'gpu',
      };
    } catch (err: unknown) {
      return {
        providerId: this.id,
        healthy: false,
        checkedAt,
        residentModels: [],
        devicePlacement: 'gpu',
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
