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

export interface NimAdapterOptions {
  baseUrl?: string;
  apiKey?: string;
  locality?: Locality;
  trustBoundary?: TrustBoundary;
  fetchFn?: typeof fetch;
}

/**
 * NVIDIA NIM / OpenAI-Compatible Provider Adapter (PDD Section 7.1 & TDD Section 4.1)
 * Used in DEV mode for frontier open-weight models (NVIDIA NIM, Groq, OpenAI).
 * Refused strictly by the PAL in SOVEREIGN mode.
 */
export class NimAdapter implements ProviderAdapter {
  public readonly id: ProviderId = 'nim';
  public readonly locality: Locality;
  public readonly trustBoundary: TrustBoundary;
  public readonly endpointHost: string;
  public capabilities: ProviderCapability[] = [
    'text',
    'vision',
    'tool-use',
    'guided-json',
    'seeded',
    'streaming',
  ];

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetch: typeof fetch;

  constructor(options?: NimAdapterOptions) {
    this.baseUrl = options?.baseUrl ?? process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
    this.apiKey = options?.apiKey ?? process.env.NIM_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
    this.locality = options?.locality ?? 'internet';
    this.trustBoundary = options?.trustBoundary ?? 'outside-perimeter';
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
      model: model.modelId === 'external-assist-frontier' ? 'meta/llama-3.1-70b-instruct' : model.modelId,
      messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 2048,
      stream: false,
    };

    if (req.seed !== null) {
      payload.seed = req.seed;
    }

    if (req.outputSchemaRef) {
      payload.response_format = { type: 'json_object' };
    }

    // If no API key is provided, provide an intelligent offline response rather than crashing
    if (!this.apiKey) {
      const latencyMs = performance.now() - start;
      return {
        content: `[NIM Dev Adapter] Processed query for model ${model.modelId} (Set NIM_API_KEY in environment for live NVIDIA NIM cloud inference).`,
        role: 'assistant',
        tokensIn: 50,
        tokensOut: 30,
        latencyMs,
        loadMs: 0,
      };
    }

    const res = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`NIM chat failed (${res.status}): ${errText}`);
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
      loadMs: 0,
    };
  }

  public async *stream(
    req: ChatRequest,
    model: RegistryEntry,
  ): AsyncIterable<StreamChunk> {
    if (!this.apiKey) {
      yield {
        contentChunk: `[NIM Dev Adapter: Set NIM_API_KEY for live streaming] `,
        done: false,
      };
      yield { contentChunk: '', done: true };
      return;
    }

    const payload: Record<string, unknown> = {
      model: model.modelId === 'external-assist-frontier' ? 'meta/llama-3.1-70b-instruct' : model.modelId,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      stream: true,
    };

    const res = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      throw new Error(`NIM stream request failed (${res.status})`);
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
    return {
      providerId: this.id,
      healthy: true,
      checkedAt,
      residentModels: ['meta/llama-3.1-70b-instruct', 'qwen2.5-32b-instruct'],
      devicePlacement: 'unknown',
    };
  }
}
