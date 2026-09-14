import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Loaded at runtime rather than as a static ESM import: bundlers (Vite/Vitest)
// do not yet externalise `node:sqlite` and try to resolve a bare "sqlite".
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = nodeRequire('node:sqlite') as typeof import('node:sqlite');
import type { Checkpointer, TaskCheckpoint } from '../agent/checkpointer.js';
import type { KnowledgeDocument } from '@outskirts/knowledge';

export type SqlValue = string | number | bigint | null | Uint8Array;

const DEFAULT_DB_PATH = fileURLToPath(new URL('../../data/outskirts.db', import.meta.url));

/**
 * Durable, local, sovereign persistence.
 *
 * Backs task checkpoints, the audit-event mirror, artifacts, and the ingested
 * document corpus. SQLite (via node:sqlite) keeps the whole thing in a single
 * file inside the perimeter -- no server process, no network, no cloud.
 */
export class SqliteStore {
  private readonly db: DatabaseSync;
  public readonly filePath: string;

  constructor(filePath: string = process.env.OUTSKIRTS_DB ?? DEFAULT_DB_PATH) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSyncCtor(filePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        task_id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL,
        status TEXT NOT NULL,
        current_step_id TEXT NOT NULL,
        completed_steps TEXT NOT NULL,
        step_results TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        seq INTEGER NOT NULL,
        task_id TEXT,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        ts TEXT NOT NULL,
        PRIMARY KEY (seq, kind)
      );
      CREATE TABLE IF NOT EXISTS artifacts (
        artifact_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS documents (
        document_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        document_class TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        next_review TEXT NOT NULL,
        review_interval_days INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chunks (
        chunk_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        ordinal INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS datasets (
        dataset_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS blueprints (
        document_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
    `);
  }

  // --- Checkpoints ---------------------------------------------------------

  public saveCheckpoint(cp: TaskCheckpoint): void {
    this.db
      .prepare(
        `INSERT INTO checkpoints (task_id, seq, status, current_step_id, completed_steps, step_results, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET
           seq = excluded.seq,
           status = excluded.status,
           current_step_id = excluded.current_step_id,
           completed_steps = excluded.completed_steps,
           step_results = excluded.step_results,
           updated_at = excluded.updated_at`,
      )
      .run(
        cp.taskId,
        cp.seq,
        cp.status,
        cp.currentStepId,
        JSON.stringify(cp.completedSteps),
        JSON.stringify(cp.stepResults),
        cp.updatedAt,
      );
  }

  public getCheckpoint(taskId: string): TaskCheckpoint | undefined {
    const row = this.db.prepare('SELECT * FROM checkpoints WHERE task_id = ?').get(taskId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    return {
      taskId: String(row['task_id']),
      seq: Number(row['seq']),
      status: String(row['status']) as TaskCheckpoint['status'],
      currentStepId: String(row['current_step_id']),
      completedSteps: JSON.parse(String(row['completed_steps'])) as string[],
      stepResults: JSON.parse(String(row['step_results'])) as Record<string, unknown>,
      updatedAt: String(row['updated_at']),
    };
  }

  public deleteCheckpoint(taskId: string): void {
    this.db.prepare('DELETE FROM checkpoints WHERE task_id = ?').run(taskId);
  }

  // --- Audit mirror --------------------------------------------------------

  public appendAuditEvent(seq: number, kind: string, payload: unknown, ts: string, taskId?: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO audit_events (seq, task_id, kind, payload, ts) VALUES (?, ?, ?, ?, ?)')
      .run(seq, taskId ?? null, kind, JSON.stringify(payload ?? null), ts);
  }

  public getAuditEvents(limit = 100): Array<{ seq: number; kind: string; payload: unknown; ts: string }> {
    const rows = this.db
      .prepare('SELECT seq, kind, payload, ts FROM audit_events ORDER BY seq DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      seq: Number(r['seq']),
      kind: String(r['kind']),
      payload: JSON.parse(String(r['payload'])),
      ts: String(r['ts']),
    }));
  }

  // --- Artifacts -----------------------------------------------------------

  public saveArtifact(artifact: {
    artifactId: string;
    taskId: string;
    artifactType: string;
    fileName: string;
    filePath: string;
    mimeType: string;
    sha256: string;
    sizeBytes: number;
    createdAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO artifacts
         (artifact_id, task_id, artifact_type, file_name, file_path, mime_type, sha256, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        artifact.artifactId,
        artifact.taskId,
        artifact.artifactType,
        artifact.fileName,
        artifact.filePath,
        artifact.mimeType,
        artifact.sha256,
        artifact.sizeBytes,
        artifact.createdAt,
      );
  }

  public getArtifact(artifactId: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM artifacts WHERE artifact_id = ?').get(artifactId) as
      | Record<string, unknown>
      | undefined;
  }

  public listArtifacts(taskId?: string): Array<Record<string, unknown>> {
    if (taskId) {
      return this.db
        .prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at DESC')
        .all(taskId) as Array<Record<string, unknown>>;
    }
    return this.db
      .prepare('SELECT * FROM artifacts ORDER BY created_at DESC LIMIT 100')
      .all() as Array<Record<string, unknown>>;
  }

  // --- Documents / chunks --------------------------------------------------

  public seedDocumentsIfEmpty(docs: KnowledgeDocument[]): void {
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM documents').get() as { n: number };
    if (Number(count.n) > 0) return;

    const insertDoc = this.db.prepare(
      `INSERT OR REPLACE INTO documents
       (document_id, title, document_class, effective_date, next_review, review_interval_days)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertChunk = this.db.prepare(
      'INSERT OR REPLACE INTO chunks (chunk_id, document_id, content, ordinal) VALUES (?, ?, ?, ?)',
    );

    this.db.exec('BEGIN');
    try {
      for (const doc of docs) {
        insertDoc.run(
          doc.documentId,
          doc.title,
          doc.documentClass,
          doc.effectiveDate,
          doc.nextReview,
          doc.reviewIntervalDays,
        );
        doc.chunks.forEach((chunk, i) => {
          insertChunk.run(chunk.chunkId, doc.documentId, chunk.content, i);
        });
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  public loadKnowledgeDocuments(): KnowledgeDocument[] {
    const docs = this.db.prepare('SELECT * FROM documents').all() as Array<Record<string, unknown>>;
    const chunkStmt: StatementSync = this.db.prepare(
      'SELECT chunk_id, content FROM chunks WHERE document_id = ? ORDER BY ordinal ASC',
    );
    return docs.map((d) => {
      const documentId = String(d['document_id']);
      const chunks = chunkStmt.all(documentId) as Array<Record<string, unknown>>;
      return {
        documentId,
        title: String(d['title']),
        documentClass: String(d['document_class']) as KnowledgeDocument['documentClass'],
        effectiveDate: String(d['effective_date']),
        nextReview: String(d['next_review']),
        reviewIntervalDays: Number(d['review_interval_days']),
        chunks: chunks.map((c) => ({ chunkId: String(c['chunk_id']), content: String(c['content']) })),
      };
    });
  }

  // --- Workspace datasets --------------------------------------------------

  public seedDatasetIfEmpty(key: string, payload: unknown): void {
    const row = this.db.prepare('SELECT 1 FROM datasets WHERE dataset_key = ?').get(key);
    if (row) return;
    this.db
      .prepare('INSERT INTO datasets (dataset_key, payload, updated_at) VALUES (?, ?, ?)')
      .run(key, JSON.stringify(payload), new Date().toISOString());
  }

  public getDataset<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT payload FROM datasets WHERE dataset_key = ?').get(key) as
      | { payload: string }
      | undefined;
    if (!row) return undefined;
    return JSON.parse(String(row.payload)) as T;
  }

  // --- Blueprints ----------------------------------------------------------

  public saveBlueprint(documentId: string, payload: unknown): void {
    this.db
      .prepare(
        `INSERT INTO blueprints (document_id, payload, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(document_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run(documentId, JSON.stringify(payload), new Date().toISOString());
  }

  public getBlueprint<T>(documentId: string): T | undefined {
    const row = this.db.prepare('SELECT payload FROM blueprints WHERE document_id = ?').get(documentId) as
      | { payload: string }
      | undefined;
    if (!row) return undefined;
    return JSON.parse(String(row.payload)) as T;
  }

  public listBlueprints(): Array<{ documentId: string; updatedAt: string }> {
    const rows = this.db
      .prepare('SELECT document_id, updated_at FROM blueprints ORDER BY updated_at DESC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({ documentId: String(r['document_id']), updatedAt: String(r['updated_at']) }));
  }

  public close(): void {
    this.db.close();
  }
}

/** Durable Checkpointer backed by the SQLite store. */
export class SqliteCheckpointer implements Checkpointer {
  constructor(private readonly store: SqliteStore) {}

  async save(checkpoint: TaskCheckpoint): Promise<void> {
    this.store.saveCheckpoint(checkpoint);
  }

  async get(taskId: string): Promise<TaskCheckpoint | undefined> {
    return this.store.getCheckpoint(taskId);
  }

  async delete(taskId: string): Promise<void> {
    this.store.deleteCheckpoint(taskId);
  }
}
