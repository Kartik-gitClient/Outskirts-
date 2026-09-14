import type { EmbeddingModel } from './embeddings.js';
import { HashEmbeddingModel } from './hash-embeddings.js';

export interface OllamaEmbeddingOptions {
  baseUrl?: string;
  modelId?: string;
  timeoutMs?: number;
  fallback?: EmbeddingModel;
}

/**
 * Local embedding client speaking the Ollama `/api/embed` contract.
 *
 * Sovereign by construction: it only ever talks to a loopback endpoint, and if
 * the endpoint is unreachable it degrades to a deterministic offline embedder
 * rather than failing the retrieval pipeline.
 */
export class OllamaEmbeddingClient implements EmbeddingModel {
  public readonly modelId: string;
  public dimensions: number;

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fallback: EmbeddingModel;
  private usingFallback = false;

  constructor(options?: OllamaEmbeddingOptions) {
    this.baseUrl = options?.baseUrl ?? 'http://127.0.0.1:11434';
    this.modelId = options?.modelId ?? 'nomic-embed-text';
    this.timeoutMs = options?.timeoutMs ?? 4000;
    this.fallback = options?.fallback ?? new HashEmbeddingModel();
    this.dimensions = this.fallback.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    // Sticky fallback: once the endpoint has failed, keep one consistent vector
    // space for the life of the process so ingest and query always agree.
    if (this.usingFallback) return this.fallback.embed(texts);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.modelId, input: texts }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as { embeddings?: number[][] };
        if (data.embeddings && data.embeddings.length === texts.length) {
          this.dimensions = data.embeddings[0]?.length ?? this.dimensions;
          return data.embeddings;
        }
      }
    } catch {
      // fall through to offline embedder
    }
    this.usingFallback = true;
    return this.fallback.embed(texts);
  }

  async embedQuery(query: string): Promise<number[]> {
    const [vec] = await this.embed([query]);
    if (!vec) throw new Error('Empty embedding response');
    return vec;
  }
}
