import type { ScoredResult, VectorStore } from './vector-store.js';

interface StoredPoint {
  chunkId: string;
  documentId: string;
  content: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

/**
 * In-process cosine vector store.
 *
 * Used as the default local backend (and in tests) so retrieval works with no
 * external service. The Qdrant backend implements the same interface for the
 * containerised deployment.
 */
export class InMemoryVectorStore implements VectorStore {
  private points = new Map<string, StoredPoint>();

  async upsert(
    chunks: Array<{
      chunkId: string;
      documentId: string;
      content: string;
      vector: number[];
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    for (const c of chunks) {
      this.points.set(c.chunkId, {
        chunkId: c.chunkId,
        documentId: c.documentId,
        content: c.content,
        vector: c.vector,
        metadata: c.metadata ?? {},
      });
    }
  }

  async search(vector: number[], topK = 10, filter?: Record<string, unknown>): Promise<ScoredResult[]> {
    const scored: ScoredResult[] = [];
    for (const point of this.points.values()) {
      if (filter && !matchesFilter(point.metadata, filter)) continue;
      scored.push({
        chunkId: point.chunkId,
        documentId: point.documentId,
        content: point.content,
        score: cosine(vector, point.vector),
        metadata: point.metadata,
      });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async delete(documentId: string): Promise<void> {
    for (const [id, point] of this.points.entries()) {
      if (point.documentId === documentId) this.points.delete(id);
    }
  }

  public size(): number {
    return this.points.size;
  }

  public all(): StoredResult[] {
    return Array.from(this.points.values());
  }
}

type StoredResult = StoredPoint;

function matchesFilter(metadata: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (metadata[k] !== v) return false;
  }
  return true;
}

export function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
