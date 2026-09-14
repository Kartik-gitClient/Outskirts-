import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '@outskirts/sovereignty';
import type { SqliteStore } from '../store/sqlite.js';
import type { RenderOutput } from './render.js';

export interface StoredArtifact {
  artifactId: string;
  taskId: string;
  artifactType: string;
  fileName: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
}

const ARTIFACT_ROOT =
  process.env.OUTSKIRTS_ARTIFACTS ?? fileURLToPath(new URL('../../artifacts-data', import.meta.url));

/**
 * Writes rendered deliverables to disk inside the perimeter and records their
 * hash in SQLite. The public URL is served by the gateway as a static mount.
 */
export class ArtifactStore {
  public readonly root: string;

  constructor(
    private readonly store: SqliteStore,
    root: string = ARTIFACT_ROOT,
  ) {
    this.root = root;
    fs.mkdirSync(this.root, { recursive: true });
  }

  public persist(taskId: string, artifactType: string, output: RenderOutput): StoredArtifact {
    const dir = path.join(this.root, taskId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, output.fileName);
    fs.writeFileSync(filePath, output.buffer);

    const sha256 = sha256Hex(output.buffer);
    const artifactId = `art-${taskId}-${artifactType}`;
    const createdAt = new Date().toISOString();

    this.store.saveArtifact({
      artifactId,
      taskId,
      artifactType,
      fileName: output.fileName,
      filePath,
      mimeType: output.mimeType,
      sha256,
      sizeBytes: output.buffer.byteLength,
      createdAt,
    });

    return {
      artifactId,
      taskId,
      artifactType,
      fileName: output.fileName,
      url: `/artifacts/${taskId}/${encodeURIComponent(output.fileName)}`,
      sha256,
      sizeBytes: output.buffer.byteLength,
      mimeType: output.mimeType,
      createdAt,
    };
  }

  public list(taskId?: string): StoredArtifact[] {
    return this.store.listArtifacts(taskId).map((row) => ({
      artifactId: String(row['artifact_id']),
      taskId: String(row['task_id']),
      artifactType: String(row['artifact_type']),
      fileName: String(row['file_name']),
      url: `/artifacts/${String(row['task_id'])}/${encodeURIComponent(String(row['file_name']))}`,
      sha256: String(row['sha256']),
      sizeBytes: Number(row['size_bytes']),
      mimeType: String(row['mime_type']),
      createdAt: String(row['created_at']),
    }));
  }
}
