import { z, type ZodType } from 'zod';
import { SCHEMA_REGISTRY } from './registry.js';

/**
 * The single canonical Zod -> JSON Schema conversion.
 *
 * Both consumers use this function and only this function:
 *
 *   - `scripts/generate.ts` writes its output to build/schema/*.json
 *   - the PAL passes its output to the provider as a decoding constraint
 *
 * That is deliberate. If the generator and the PAL each had their own
 * conversion, the schema Python validates against and the schema the model is
 * sampled into could drift apart silently -- which is the exact failure the
 * spine exists to prevent, reproduced one layer down.
 *
 * This module must not import `node:*`. The React client imports the schema
 * package, and a Node built-in here would break the browser build.
 */

export const JSON_SCHEMA_OPTS = {
  target: 'draft-7',
  /**
   * A field with .default() is required on output but optional on input. The
   * model producing the object is the input side, so forcing it to emit
   * defaulted fields would waste tokens and invite refusals for no benefit.
   */
  io: 'input',
  unrepresentable: 'any',
  reused: 'inline',
} as const;

/**
 * Force every object node closed.
 *
 * Zod's default object mode strips unknown keys rather than rejecting them, so
 * with io:'input' the emitted schema leaves additionalProperties unconstrained.
 * That is defensible for validation and insufficient for structured decoding: an open
 * object permits decoding unvalidated properties, which strict JSON Schema enforcement
 * is designed to prevent.
 *
 * Nodes that already declare additionalProperties -- z.record(), which is how
 * AuditEvent.payload stays deliberately open -- are left alone.
 */
export function closeObjects(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(closeObjects);
  if (node === null || typeof node !== 'object') return node;

  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = closeObjects(v);

  if (out['type'] === 'object' && 'properties' in out && !('additionalProperties' in out)) {
    out['additionalProperties'] = false;
  }
  return out;
}

/** Convert a Zod schema to the canonical JSON Schema form. */
export function toJsonSchema(schema: ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, JSON_SCHEMA_OPTS);
  return closeObjects(raw) as Record<string, unknown>;
}

const cache = new Map<string, Record<string, unknown>>();

/**
 * Resolve a SchemaRef to the JSON Schema the provider must constrain against.
 *
 * This is what a PlanStep's `outputSchemaRef` becomes on the wire. Passing the
 * *name* instead of the schema -- which is type-correct, since both are
 * strings, and therefore invisible to the compiler -- means no constraint is
 * applied at all. */
export function jsonSchemaFor(ref: string): Record<string, unknown> {
  const hit = cache.get(ref);
  if (hit) return hit;

  const schema = (SCHEMA_REGISTRY as Record<string, ZodType>)[ref];
  if (!schema) {
    throw new Error(
      `Unknown schema ref "${ref}". Known: ${Object.keys(SCHEMA_REGISTRY).join(', ')}`,
    );
  }

  const json = toJsonSchema(schema);
  cache.set(ref, json);
  return json;
}
