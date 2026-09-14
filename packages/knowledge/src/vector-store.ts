export interface ScoredResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorStoreOptions {
  baseUrl?: string;
  collectionName?: string;
  dimensions?: number;
}

/**
 * Interface for vector similarity search backends.
 */
export interface VectorStore {
  upsert(chunks: Array<{ chunkId: string; documentId: string; content: string; vector: number[]; metadata?: Record<string, unknown> }>): Promise<void>;
  search(vector: number[], topK?: number, filter?: Record<string, unknown>): Promise<ScoredResult[]>;
  delete(documentId: string): Promise<void>;
}

/**
 * Qdrant vector store client for hybrid search.
 * Connects to a local Qdrant instance for sovereign vector storage.
 */
export class QdrantVectorStore implements VectorStore {
  private readonly baseUrl: string;
  private readonly collection: string;
  private readonly dimensions: number;

  constructor(options?: VectorStoreOptions) {
    this.baseUrl = options?.baseUrl ?? 'http://127.0.0.1:6333';
    this.collection = options?.collectionName ?? 'outskirts-knowledge';
    this.dimensions = options?.dimensions ?? 1024;
  }

  async ensureCollection(): Promise<void> {
    // Check if collection exists, create if not
    const check = await fetch(`${this.baseUrl}/collections/${this.collection}`);
    if (check.status === 404) {
      const res = await fetch(`${this.baseUrl}/collections/${this.collection}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: { size: this.dimensions, distance: 'Cosine' },
        }),
      });
      if (!res.ok) throw new Error(`Failed to create Qdrant collection: ${res.status}`);
    }
  }

  async upsert(chunks: Array<{ chunkId: string; documentId: string; content: string; vector: number[]; metadata?: Record<string, unknown> }>): Promise<void> {
    const points = chunks.map((c, i) => ({
      id: hashToInt(c.chunkId),
      vector: c.vector,
      payload: {
        chunkId: c.chunkId,
        documentId: c.documentId,
        content: c.content,
        ...c.metadata,
      },
    }));

    const res = await fetch(`${this.baseUrl}/collections/${this.collection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    });
    if (!res.ok) throw new Error(`Qdrant upsert failed: ${res.status}`);
  }

  async search(vector: number[], topK = 10, filter?: Record<string, unknown>): Promise<ScoredResult[]> {
    const body: Record<string, unknown> = { vector, limit: topK, with_payload: true };
    if (filter) body.filter = filter;

    const res = await fetch(`${this.baseUrl}/collections/${this.collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Qdrant search failed: ${res.status}`);

    const data = (await res.json()) as { result: Array<{ id: number; score: number; payload?: Record<string, unknown> }> };
    return data.result.map((r) => ({
      chunkId: String(r.payload?.['chunkId'] ?? r.id),
      documentId: String(r.payload?.['documentId'] ?? ''),
      content: String(r.payload?.['content'] ?? ''),
      score: r.score,
      metadata: r.payload ?? {},
    }));
  }

  async delete(documentId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/collections/${this.collection}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: { must: [{ key: 'documentId', match: { value: documentId } }] },
      }),
    });
    if (!res.ok) throw new Error(`Qdrant delete failed: ${res.status}`);
  }
}

/** Simple string hash to integer for Qdrant point IDs. */
function hashToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}
