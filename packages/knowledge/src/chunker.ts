export interface Chunk {
  chunkId: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown>;
  startOffset: number;
  endOffset: number;
}

export interface ChunkingOptions {
  maxTokens?: number;
  overlap?: number;
  separator?: string;
}

/**
 * Split a document into overlapping chunks for embedding and retrieval.
 * Uses sentence-boundary-aware splitting with configurable overlap.
 */
export function chunkDocument(
  documentId: string,
  text: string,
  options?: ChunkingOptions,
): Chunk[] {
  const maxChars = (options?.maxTokens ?? 512) * 4; // approximate chars per token
  const overlapChars = (options?.overlap ?? 64) * 4;
  const separator = options?.separator ?? '\n';

  const chunks: Chunk[] = [];
  const sentences = text.split(separator);
  let buffer = '';
  let startOffset = 0;
  let currentOffset = 0;

  for (const sentence of sentences) {
    if (buffer.length + sentence.length > maxChars && buffer.length > 0) {
      chunks.push({
        chunkId: `${documentId}-chunk-${chunks.length}`,
        documentId,
        content: buffer.trim(),
        metadata: {},
        startOffset,
        endOffset: currentOffset,
      });
      // Overlap: keep last portion
      const overlapStart = Math.max(0, buffer.length - overlapChars);
      buffer = buffer.slice(overlapStart);
      startOffset = currentOffset - (buffer.length);
    }
    buffer += sentence + separator;
    currentOffset += sentence.length + separator.length;
  }

  if (buffer.trim().length > 0) {
    chunks.push({
      chunkId: `${documentId}-chunk-${chunks.length}`,
      documentId,
      content: buffer.trim(),
      metadata: {},
      startOffset,
      endOffset: currentOffset,
    });
  }

  return chunks;
}
