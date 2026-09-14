/**
 * Schema spine generator.
 *
 *   pnpm schema:build   emit build/schema/*.json from the Zod source
 *   pnpm schema:check   fail if the committed output is stale
 *
 * The generated JSON Schema is committed deliberately. It is the artefact the
 * Python capability plane, the constrained decoder and the OpenAPI surface all
 * consume, so it has to be reviewable in a diff and present in a checkout that
 * has never run Node. The --check mode is what makes that safe: CI fails if
 * someone edits a Zod schema and forgets to regenerate, which is the only way
 * a contract could drift between the two planes.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCHEMA_REGISTRY, JSON_SCHEMA_OPTS, toJsonSchema } from '../src/index.js';
import type { ZodType } from 'zod';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'build', 'schema');

const checkMode = process.argv.includes('--check');

function canonical(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

type Generated = { name: string; body: string; hash: string };

/**
 * Conversion lives in src/jsonschema.ts, not here.
 *
 * The PAL calls the same function to build its decoding constraint, so the
 * artefact Python validates against and the schema the model is sampled into
 * are the same bytes by construction rather than by discipline.
 */
function generateAll(): Generated[] {
  const out: Generated[] = [];
  for (const name of Object.keys(SCHEMA_REGISTRY)) {
    let json: Record<string, unknown>;
    try {
      json = toJsonSchema((SCHEMA_REGISTRY as Record<string, ZodType>)[name]!);
    } catch (err) {
      throw new Error(`Failed to convert schema "${name}": ${(err as Error).message}`);
    }
    const body = canonical({ $id: `https://outskirts.local/schema/${name}.json`, ...json });
    out.push({ name, body, hash: sha256(body) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function buildIndex(generated: Generated[]): string {
  return canonical({
    generator: 'packages/schemas/scripts/generate.ts',
    target: JSON_SCHEMA_OPTS.target,
    io: JSON_SCHEMA_OPTS.io,
    count: generated.length,
    schemas: generated.map(({ name, hash }) => ({ name, file: `${name}.json`, sha256: hash })),
  });
}

const generated = generateAll();
const indexBody = buildIndex(generated);

if (checkMode) {
  const problems: string[] = [];

  if (!existsSync(OUT_DIR)) {
    console.error('FAIL  build/schema/ does not exist. Run: pnpm schema:build');
    process.exit(1);
  }

  for (const { name, body } of generated) {
    const path = join(OUT_DIR, `${name}.json`);
    if (!existsSync(path)) {
      problems.push(`missing   ${name}.json`);
      continue;
    }
    if (readFileSync(path, 'utf8') !== body) {
      problems.push(`stale     ${name}.json`);
    }
  }

  const indexPath = join(OUT_DIR, 'index.json');
  if (!existsSync(indexPath) || readFileSync(indexPath, 'utf8') !== indexBody) {
    problems.push('stale     index.json');
  }

  const known = new Set([...generated.map((g) => `${g.name}.json`), 'index.json']);
  for (const file of readdirSync(OUT_DIR)) {
    if (file.endsWith('.json') && !known.has(file)) {
      problems.push(`orphaned  ${file}  (schema removed from the registry?)`);
    }
  }

  if (problems.length > 0) {
    console.error('\nSchema spine is out of date:\n');
    for (const p of problems) console.error(`  ${p}`);
    console.error('\nRun: pnpm schema:build  and commit the result.\n');
    process.exit(1);
  }

  console.log(`OK  ${generated.length} schemas up to date.`);
  process.exit(0);
}

// --- build mode -----------------------------------------------------------

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

for (const { name, body } of generated) {
  writeFileSync(join(OUT_DIR, `${name}.json`), body, 'utf8');
}
writeFileSync(join(OUT_DIR, 'index.json'), indexBody, 'utf8');

console.log(`Wrote ${generated.length} schemas to build/schema/`);
for (const { name, hash } of generated) {
  console.log(`  ${name.padEnd(26)} ${hash.slice(0, 12)}`);
}
