/**
 * Deterministic offline embedding model.
 *
 * A hashed bag-of-words (feature hashing) vector: tokenize, hash each token into
 * a fixed-width bucket, weight by sublinear term frequency, then L2-normalise.
 * This is not semantic, but it is a real, deterministic, dependency-free vector
 * representation that cosine search can operate on when no embedding server is
 * reachable -- so retrieval keeps working in a fully air-gapped box.
 */
import type { EmbeddingModel } from './embeddings.js';

const DEFAULT_DIMENSIONS = 512;

export class HashEmbeddingModel implements EmbeddingModel {
  public readonly modelId = 'outskirts-hash-bow';
  public readonly dimensions: number;

  constructor(dimensions = DEFAULT_DIMENSIONS) {
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.vectorize(t));
  }

  async embedQuery(query: string): Promise<number[]> {
    return this.vectorize(query);
  }

  private vectorize(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0) return vec;

    const counts = new Map<string, number>();
    for (const tok of tokens) counts.set(tok, (counts.get(tok) ?? 0) + 1);

    for (const [tok, count] of counts.entries()) {
      const bucket = fnv1a(tok) % this.dimensions;
      const weight = 1 + Math.log(count);
      vec[bucket] = (vec[bucket] ?? 0) + weight;
    }

    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) / norm;
    }
    return vec;
  }
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
