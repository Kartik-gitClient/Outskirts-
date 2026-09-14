import type { EmbeddingModel } from './embeddings.js';
import type { VectorStore, ScoredResult } from './vector-store.js';
import type { BM25Index } from './bm25.js';
import { computeFreshness, type ComputeInput } from './freshness.js';

export interface RerankerModel {
  rerank(query: string, documents: string[]): Promise<Array<{ index: number; score: number }>>;
}

/**
 * Cross-encoder reranker client for Hugging Face TEI reranking endpoint.
 * Uses bge-reranker-v2-m3 or similar cross-encoder models.
 */
export class TeiReranker implements RerankerModel {
  private readonly baseUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:8081') {
    this.baseUrl = baseUrl;
  }

  async rerank(query: string, documents: string[]): Promise<Array<{ index: number; score: number }>> {
    const res = await fetch(`${this.baseUrl}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, texts: documents, return_text: false }),
    });
    if (!res.ok) throw new Error(`Reranker failed (${res.status})`);
    const results = (await res.json()) as Array<{ index: number; score: number }>;
    return results.sort((a, b) => b.score - a.score);
  }
}

export interface RetrievalOptions {
  topK?: number;
  rerank?: boolean;
  applyFreshness?: boolean;
  freshnessInputs?: Map<string, ComputeInput>;
}

/**
 * Reciprocal Rank Fusion: merge multiple ranked lists into one.
 * RRF(d) = Σ 1 / (k + rank_i(d)) for each ranking list i.
 */
export function reciprocalRankFusion(
  rankings: ScoredResult[][],
  k = 60,
): ScoredResult[] {
  const scores = new Map<string, { result: ScoredResult; rrfScore: number }>();

  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const result = ranking[rank]!;
      const existing = scores.get(result.chunkId);
      const contribution = 1 / (k + rank + 1);
      if (existing) {
        existing.rrfScore += contribution;
      } else {
        scores.set(result.chunkId, { result, rrfScore: contribution });
      }
    }
  }

  return Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map((entry) => ({ ...entry.result, score: entry.rrfScore }));
}

/**
 * Knowledge Retriever: the main retrieval pipeline.
 * Orchestrates embedding, vector search, RRF fusion, cross-encoder reranking,
 * and freshness-weighted scoring.
 */
export class KnowledgeRetriever {
  constructor(
    private readonly embedder: EmbeddingModel,
    private readonly vectorStore: VectorStore,
    private readonly reranker?: RerankerModel,
    private readonly keywordIndex?: BM25Index,
  ) {}

  async retrieve(query: string, options?: RetrievalOptions): Promise<ScoredResult[]> {
    const topK = options?.topK ?? 10;

    // 1. Embed the query
    const queryVector = await this.embedder.embedQuery(query);

    // 2. Vector similarity search
    const vectorResults = await this.vectorStore.search(queryVector, topK * 2);

    // 3. Hybrid fusion: dense vector ranking + BM25 lexical ranking via RRF.
    //    Exact industrial identifiers (tag numbers, SOP codes) are caught by BM25
    //    while semantic similarity is caught by the vector side.
    let candidates = vectorResults;
    if (this.keywordIndex && this.keywordIndex.size() > 0) {
      const keywordResults = this.keywordIndex.search(query, topK * 2);
      candidates =
        vectorResults.length > 0 && keywordResults.length > 0
          ? reciprocalRankFusion([vectorResults, keywordResults])
          : (vectorResults.length > 0 ? vectorResults : keywordResults);
    }

    // 4. Cross-encoder reranking
    if (options?.rerank && this.reranker && candidates.length > 0) {
      const reranked = await this.reranker.rerank(
        query,
        candidates.map((c) => c.content),
      );
      candidates = reranked.map((r) => ({
        ...candidates[r.index]!,
        score: r.score,
      }));
    }

    // 5. Apply freshness weighting
    if (options?.applyFreshness && options.freshnessInputs) {
      const now = new Date();
      candidates = candidates.map((c) => {
        const freshnessInput = options.freshnessInputs!.get(c.documentId);
        if (!freshnessInput) return c;
        const freshness = computeFreshness(freshnessInput, now);
        return { ...c, score: c.score * freshness.retrievalWeight };
      });
      candidates.sort((a, b) => b.score - a.score);
    }

    return candidates.slice(0, topK);
  }

  /**
   * Ingest a document: chunk, embed, and store.
   */
  async ingest(
    documentId: string,
    chunks: Array<{ chunkId: string; content: string; metadata?: Record<string, unknown> }>,
  ): Promise<void> {
    const texts = chunks.map((c) => c.content);
    const vectors = await this.embedder.embed(texts);

    await this.vectorStore.upsert(
      chunks.map((c, i) => ({
        chunkId: c.chunkId,
        documentId,
        content: c.content,
        vector: vectors[i]!,
        metadata: c.metadata,
      })),
    );
  }
}
