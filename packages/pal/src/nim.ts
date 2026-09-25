import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

/** Local, gitignored persistence for the operator-configured key so the
 *  admin-console configuration survives gateway restarts. */
const NIM_CONFIG_FILE =
  process.env.OUTSKIRTS_NIM_CONFIG ??
  path.join(fileURLToPath(new URL('../../../apps/server/data', import.meta.url)), 'nim-config.json');

function loadPersistedKey(): string {
  try {
    const raw = fs.readFileSync(NIM_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as { apiKey?: string; baseUrl?: string };
    return parsed.apiKey?.trim() ?? '';
  } catch {
    return '';
  }
}

function persistConfig(config: { apiKey?: string; baseUrl?: string }): void {
  try {
    fs.mkdirSync(path.dirname(NIM_CONFIG_FILE), { recursive: true });
    const existing = (() => {
      try {
        return JSON.parse(fs.readFileSync(NIM_CONFIG_FILE, 'utf-8')) as Record<string, string>;
      } catch {
        return {};
      }
    })();
    fs.writeFileSync(NIM_CONFIG_FILE, JSON.stringify({ ...existing, ...config }, null, 2));
  } catch {
    /* persistence is best-effort; env var still works */
  }
}

/**
 * Reasoning-tuned NIM models (e.g. nemotron-*-reasoning) sometimes prefix the
 * final answer with a verbose thinking block. Strip a detected preamble and
 * keep the answer; clean models pass through untouched.
 */
export function stripReasoningPreamble(text: string): string {
  const head = text.slice(0, 160).toLowerCase();
  const looksLikeReasoning =
    head.includes('thinking process') || head.startsWith('thinking:') || head.startsWith('reasoning:');
  if (!looksLikeReasoning) return text;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length > 1) {
    // final answer is conventionally the last block, or the last block that
    // does not look like a numbered reasoning step
    for (let i = paragraphs.length - 1; i >= 0; i--) {
      const p = paragraphs[i]!;
      if (!/^\d+[.)]\s/.test(p) && !/^here'?s a thinking process/i.test(p)) {
        return p;
      }
    }
  }
  return text;
}

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
  public endpointHost: string;
  public capabilities: ProviderCapability[] = [
    'text',
    'vision',
    'tool-use',
    'guided-json',
    'seeded',
    'streaming',
  ];

  private baseUrl: string;
  private apiKey: string;
  private readonly fetch: typeof fetch;

  constructor(options?: NimAdapterOptions) {
    this.baseUrl = options?.baseUrl ?? process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
    this.apiKey =
      options?.apiKey ?? process.env.NIM_API_KEY ?? process.env.OPENAI_API_KEY ?? loadPersistedKey();
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
      model: model.modelId === 'external-assist-frontier' ? 'google/gemma-4-31b-it' : model.modelId,
      messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 2048,
      stream: false,
    };

    // Reasoning-tuned NIM models otherwise burn the token budget on a visible
    // "thinking process" and truncate the actual answer.
    if (/nemotron|lightning|reason/i.test(model.modelId)) {
      payload.chat_template_kwargs = { enable_thinking: false };
    }

    if (req.seed !== null) {
      payload.seed = req.seed;
    }

    if (req.outputSchemaRef) {
      payload.response_format = { type: 'json_object' };
    }

    // No key means no provider. Report it honestly so the caller can fall back
    // to the local sovereign model rather than treating a canned string as output.
    if (!this.apiKey) {
      throw new Error('NIM provider not configured: set NIM_API_KEY (or OPENAI_API_KEY)');
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
    const raw = choice?.message?.content ?? '';

    return {
      content: stripReasoningPreamble(raw),
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
    if (!this.apiKey) {
      return {
        providerId: this.id,
        healthy: false,
        checkedAt,
        residentModels: [],
        devicePlacement: 'unknown',
        detail: 'NIM_API_KEY not set',
      };
    }
    // Actually probe the endpoint so an invalid key reports offline honestly.
    try {
      const res = await this.fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return {
          providerId: this.id,
          healthy: false,
          checkedAt,
          residentModels: [],
          devicePlacement: 'unknown',
          detail: `endpoint responded ${res.status} — check NIM_API_KEY`,
        };
      }
      const json = (await res.json()) as { data?: Array<{ id?: string }> };
      const models = (json.data ?? [])
        .map((m) => String(m.id ?? ''))
        .filter((id) => id.length > 0)
        .slice(0, 50);
      return {
        providerId: this.id,
        healthy: true,
        checkedAt,
        residentModels: models,
        devicePlacement: 'mixed',
        detail: 'live · cloud (outside perimeter; ASSIST mode only)',
      };
    } catch (err: unknown) {
      return {
        providerId: this.id,
        healthy: false,
        checkedAt,
        residentModels: [],
        devicePlacement: 'unknown',
        detail: `unreachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  public isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /** Configure at runtime (e.g. from the admin console) without a restart.
   *  Persisted locally so the configuration survives gateway restarts. */
  public configure(options: { apiKey?: string; baseUrl?: string }): void {
    if (options.apiKey?.trim()) this.apiKey = options.apiKey.trim();
    if (options.baseUrl?.trim()) {
      this.baseUrl = options.baseUrl.trim();
      this.endpointHost = new URL(this.baseUrl).host;
    }
    persistConfig(options);
  }
}
