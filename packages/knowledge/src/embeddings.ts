/** Interface for text embedding models (e.g., bge-m3). */
export interface EmbeddingModel {
  readonly modelId: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
}

/** Configuration for connecting to a text-embeddings-inference server. */
export interface TeiClientOptions {
  baseUrl?: string;
  modelId?: string;
}

/**
 * Client for Hugging Face text-embeddings-inference (TEI) server.
 * Wraps the bge-m3 model served via TEI for sovereign local embedding generation.
 */
export class TeiEmbeddingClient implements EmbeddingModel {
  public readonly modelId: string;
  public readonly dimensions: number;
  private readonly baseUrl: string;

  constructor(options?: TeiClientOptions) {
    this.baseUrl = options?.baseUrl ?? 'http://127.0.0.1:8080';
    this.modelId = options?.modelId ?? 'BAAI/bge-m3';
    this.dimensions = 1024; // bge-m3 default
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: texts }),
    });
    if (!res.ok) throw new Error(`TEI embed failed (${res.status})`);
    return (await res.json()) as number[][];
  }

  async embedQuery(query: string): Promise<number[]> {
    const [vec] = await this.embed([query]);
    if (!vec) throw new Error('Empty embedding response');
    return vec;
  }
}
