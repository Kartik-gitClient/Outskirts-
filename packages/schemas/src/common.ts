import { z } from 'zod';

/**
 * Primitive building blocks shared across every contract.
 *
 * Nothing in here is Outskirts-specific; it exists so that an id, a timestamp
 * or a hash has exactly one definition that both planes agree on.
 */

export const Id = z.string().min(1).describe('Opaque identifier, unique within its collection');

export const Iso8601 = z.iso.datetime().describe('ISO 8601 timestamp, UTC');

export const Sha256 = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .describe('Lowercase hex SHA-256 digest');

/**
 * Monotonic per-task sequence number.
 *
 * Every audit event and every WebSocket event carries one. A client that sees
 * a gap knows to replay from GET /tasks/:id/events?since=<seq> rather than
 * silently rendering an incomplete timeline.
 */
export const Seq = z.number().int().nonnegative().describe('Monotonic sequence number, per task');

/**
 * Reference to a schema in this package's registry, by export name.
 *
 * Used wherever a contract needs to name another contract at runtime -- a plan
 * step's expected output shape, a plugin tool's input shape. The executor
 * resolves the name to a JSON Schema and hands it to the provider as a
 * decoding constraint, which is what makes structured output a sampling
 * guarantee rather than a prompt request.
 */
export const SchemaRef = z
  .string()
  .min(1)
  .describe('Name of a schema in @outskirts/schemas, e.g. "ExtractionResult"');

export type Id = z.infer<typeof Id>;
export type Iso8601 = z.infer<typeof Iso8601>;
export type Sha256 = z.infer<typeof Sha256>;
export type Seq = z.infer<typeof Seq>;
export type SchemaRef = z.infer<typeof SchemaRef>;
