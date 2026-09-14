import type { EmbeddingModel } from './embeddings.js';
import type { VectorStore, ScoredResult } from './vector-store.js';
import { KnowledgeRetriever, type RetrievalOptions } from './retriever.js';
import { BM25Index } from './bm25.js';
import type { DocumentClass } from '@outskirts/schemas';
import { computeFreshness, type ComputeInput } from './freshness.js';

export interface KnowledgeDocument {
  documentId: string;
  title: string;
  documentClass: DocumentClass;
  effectiveDate: string;
  nextReview: string;
  reviewIntervalDays: number;
  chunks: Array<{ chunkId: string; content: string; metadata?: Record<string, unknown> }>;
}

export interface KnowledgeBaseOptions {
  reranker?: import('./retriever.js').RerankerModel;
}

/**
 * The L6 knowledge base: ingestion + hybrid (vector + BM25/RRF) retrieval with
 * freshness-weighted scoring. Owns the document registry so citations can be
 * resolved back to a real, dated source.
 */
export class KnowledgeBase {
  public readonly retriever: KnowledgeRetriever;
  public readonly keywordIndex: BM25Index;
  private readonly freshnessInputs = new Map<string, ComputeInput>();
  private readonly documents = new Map<string, KnowledgeDocument>();

  constructor(embedder: EmbeddingModel, vectorStore: VectorStore, options?: KnowledgeBaseOptions) {
    this.keywordIndex = new BM25Index();
    this.retriever = new KnowledgeRetriever(embedder, vectorStore, options?.reranker, this.keywordIndex);
  }

  async ingest(doc: KnowledgeDocument): Promise<void> {
    this.documents.set(doc.documentId, doc);
    this.freshnessInputs.set(doc.documentId, {
      documentClass: doc.documentClass,
      effectiveDate: doc.effectiveDate,
      nextReview: doc.nextReview,
      reviewIntervalDays: doc.reviewIntervalDays,
    });

    await this.retriever.ingest(
      doc.documentId,
      doc.chunks.map((c) => ({
        chunkId: c.chunkId,
        content: c.content,
        metadata: { title: doc.title, documentClass: doc.documentClass, ...c.metadata },
      })),
    );

    for (const chunk of doc.chunks) {
      this.keywordIndex.add({
        chunkId: chunk.chunkId,
        documentId: doc.documentId,
        content: chunk.content,
        metadata: { title: doc.title, documentClass: doc.documentClass, ...chunk.metadata },
      });
    }
  }

  async retrieve(query: string, options?: RetrievalOptions): Promise<ScoredResult[]> {
    return this.retriever.retrieve(query, {
      topK: options?.topK ?? 6,
      rerank: options?.rerank ?? false,
      applyFreshness: options?.applyFreshness ?? true,
      freshnessInputs: this.freshnessInputs,
    });
  }

  public getDocument(documentId: string): KnowledgeDocument | undefined {
    return this.documents.get(documentId);
  }

  public listDocuments(): Array<Omit<KnowledgeDocument, 'chunks'> & { chunkCount: number }> {
    return Array.from(this.documents.values()).map((d) => ({
      documentId: d.documentId,
      title: d.title,
      documentClass: d.documentClass,
      effectiveDate: d.effectiveDate,
      nextReview: d.nextReview,
      reviewIntervalDays: d.reviewIntervalDays,
      chunkCount: d.chunks.length,
    }));
  }

  public freshnessFor(documentId: string): ReturnType<typeof computeFreshness> | null {
    const input = this.freshnessInputs.get(documentId);
    if (!input) return null;
    return computeFreshness(input, new Date());
  }
}

const DAY = 86400000;
const REFERENCE_NOW = Date.UTC(2026, 8, 13); // 2026-09-13

function iso(daysFromRef: number): string {
  return new Date(REFERENCE_NOW + daysFromRef * DAY).toISOString();
}

/**
 * Seeded sovereign corpus standing in for the plant document store.
 * Mixes a current governing SOP with a stale one so the freshness gate has
 * something real to lock on.
 */
export const SEEDED_DOCUMENTS: KnowledgeDocument[] = [
  {
    documentId: 'doc-sop-402',
    title: 'MRPL-SOP-402 Piping Maintenance Specification',
    documentClass: 'GOVERNING',
    effectiveDate: iso(-180),
    nextReview: iso(185),
    reviewIntervalDays: 365,
    chunks: [
      {
        chunkId: 'chunk-sop-402-p1',
        content:
          'MRPL-SOP-402 Piping Maintenance Specification. Minimum allowable wall thickness for carbon steel A106-B crude distillation bottoms piping shall not fall below 4.2 mm as measured by ultrasonic testing.',
      },
      {
        chunkId: 'chunk-sop-402-p4',
        content:
          'Piping thickness must maintain minimum 4.2mm with minimum 5-year remaining life projection. Corrosion allowance calculations use a 0.12 mm per year nominal rate for CDU bottoms service.',
      },
      {
        chunkId: 'chunk-sop-402-p7',
        content:
          'Hydraulic verification of piping lines shall be performed using the Darcy-Weisbach correlation with Colebrook-White friction factor. Allowable frictional pressure drop is 0.5 bar per 100 m.',
      },
    ],
  },
  {
    documentId: 'doc-std-asme-b313',
    title: 'ASME B31.3 Process Piping Excerpt',
    documentClass: 'REFERENCE',
    effectiveDate: iso(-800),
    nextReview: iso(650),
    reviewIntervalDays: 1460,
    chunks: [
      {
        chunkId: 'chunk-b313-t341',
        content:
          'ASME B31.3 paragraph 341.4.1 requires periodic wall thickness measurement to establish corrosion rates and remaining life for process piping in severe cyclic or corrosive service.',
      },
      {
        chunkId: 'chunk-b313-a302',
        content:
          'ASME B31.3 allowable stress for A106-B carbon steel at 200 C is 118 MPa based on the specified minimum yield strength of 35 ksi.',
      },
    ],
  },
  {
    documentId: 'doc-sop-2019-outdated',
    title: 'Legacy Relief Valve Inspection Interval (2019, retired)',
    documentClass: 'GOVERNING',
    effectiveDate: iso(-1500),
    nextReview: iso(-540),
    reviewIntervalDays: 365,
    chunks: [
      {
        chunkId: 'chunk-2019-relief',
        content:
          'Legacy relief valve inspection interval is 72 months for all pressure relief devices in crude service. Superseded by the 2026 pressure safety management addendum.',
      },
    ],
  },
];
