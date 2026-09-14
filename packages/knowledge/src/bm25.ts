import type { ScoredResult } from './vector-store.js';
import { tokenize } from './hash-embeddings.js';

interface Bm25Doc {
  chunkId: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown>;
  termFreq: Map<string, number>;
  length: number;
}

/**
 * Okapi BM25 lexical index over knowledge chunks.
 *
 * Vector retrieval misses exact identifiers (tag numbers, SOP codes) that
 * industrial queries hinge on; BM25 catches them. The retriever fuses the two
 * rankings with Reciprocal Rank Fusion.
 */
export class BM25Index {
  private docs = new Map<string, Bm25Doc>();
  private documentFrequency = new Map<string, number>();

  constructor(
    private readonly k1 = 1.5,
    private readonly b = 0.75,
  ) {}

  public add(doc: {
    chunkId: string;
    documentId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): void {
    const existing = this.docs.get(doc.chunkId);
    if (existing) {
      for (const tok of existing.termFreq.keys()) {
        const df = this.documentFrequency.get(tok) ?? 0;
        if (df <= 1) this.documentFrequency.delete(tok);
        else this.documentFrequency.set(tok, df - 1);
      }
    }
    const tokens = tokenize(doc.content);
    const termFreq = new Map<string, number>();
    for (const tok of tokens) termFreq.set(tok, (termFreq.get(tok) ?? 0) + 1);

    for (const tok of termFreq.keys()) {
      this.documentFrequency.set(tok, (this.documentFrequency.get(tok) ?? 0) + 1);
    }

    this.docs.set(doc.chunkId, {
      chunkId: doc.chunkId,
      documentId: doc.documentId,
      content: doc.content,
      metadata: doc.metadata ?? {},
      termFreq,
      length: tokens.length,
    });
  }

  public search(query: string, topK = 10): ScoredResult[] {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0 || this.docs.size === 0) return [];

    const totalDocs = this.docs.size;
    const avgLength =
      Array.from(this.docs.values()).reduce((s, d) => s + d.length, 0) / totalDocs || 1;

    const scores: ScoredResult[] = [];
    for (const doc of this.docs.values()) {
      let score = 0;
      for (const term of queryTerms) {
        const tf = doc.termFreq.get(term);
        if (!tf) continue;
        const df = this.documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
        const denom = tf + this.k1 * (1 - this.b + this.b * (doc.length / avgLength));
        score += idf * ((tf * (this.k1 + 1)) / denom);
      }
      if (score > 0) {
        scores.push({
          chunkId: doc.chunkId,
          documentId: doc.documentId,
          content: doc.content,
          score,
          metadata: doc.metadata,
        });
      }
    }

    return scores.sort((x, y) => y.score - x.score).slice(0, topK);
  }

  public size(): number {
    return this.docs.size;
  }
}
