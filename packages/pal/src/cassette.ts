import { createHash } from 'node:crypto';
import type { ChatRequest, RegistryEntry } from '@outskirts/schemas';
import type { ChatResponse } from './adapter.js';

export type CassetteMode = 'record' | 'replay' | 'passthrough';

export interface CassetteEntry {
  key: string;
  modelDigest: string;
  promptHash: string;
  seed: number | null;
  outputSchemaRef?: string;
  response: ChatResponse;
  recordedAt: string;
}

export class CassetteNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`Cassette entry not found for key: ${key}`);
    this.name = 'CassetteNotFoundError';
  }
}

/**
 * Compute canonical deterministic hash of request prompt messages.
 */
export function hashPromptMessages(messages: ChatRequest['messages']): string {
  const normalized = messages.map((m) => `${m.role}:${m.name ?? ''}:${m.content}`).join('\n---\n');
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Compute unique cassette key based on (modelDigest, promptHash, seed, outputSchemaRef).
 */
export function computeCassetteKey(
  modelDigest: string,
  promptHash: string,
  seed: number | null,
  outputSchemaRef?: string,
): string {
  const raw = `${modelDigest}|${promptHash}|${seed ?? 'null'}|${outputSchemaRef ?? ''}`;
  return createHash('sha256').update(raw).digest('hex');
}

export class CassetteStore {
  private entries = new Map<string, CassetteEntry>();

  constructor(initialEntries?: CassetteEntry[]) {
    if (initialEntries) {
      for (const entry of initialEntries) {
        this.entries.set(entry.key, entry);
      }
    }
  }

  public get(key: string): CassetteEntry | undefined {
    return this.entries.get(key);
  }

  public set(entry: CassetteEntry): void {
    this.entries.set(entry.key, entry);
  }

  public has(key: string): boolean {
    return this.entries.has(key);
  }

  public export(): CassetteEntry[] {
    return Array.from(this.entries.values());
  }

  public import(entries: CassetteEntry[]): void {
    for (const entry of entries) {
      this.entries.set(entry.key, entry);
    }
  }

  public clear(): void {
    this.entries.clear();
  }

  public size(): number {
    return this.entries.size;
  }
}
