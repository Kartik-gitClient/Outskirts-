import { z } from 'zod';
import { Id, Iso8601, Seq, SchemaRef } from './common.js';

/**
 * Provider Adapter Layer contracts.
 *
 * The PAL is the only code path in the system through which an inference
 * request may leave the process. Everything here exists to make that boundary
 * describable, auditable and testable.
 */

/**
 * Where a call actually goes.
 *
 * Four values, not two. A binary local/remote tag collapses "in my process"
 * and "across the corporate network" into one value, and that is precisely the
 * distinction a security reviewer cares about -- in the LAN pilot topology the
 * client and the GPU server are different hosts.
 */
export const Locality = z
  .enum(['in-process', 'loopback', 'lan', 'internet'])
  .describe('Network distance of the endpoint that served the call');

/**
 * Whether that destination is inside the organisation's perimeter.
 *
 * This is the value the Sovereignty Dashboard counts. A dedicated air-gapped
 * GPU server on the org LAN is inside; a shared, internet-connected company
 * cluster is outside, and must be labelled so even though its packets never
 * left the corporate network.
 */
export const TrustBoundary = z
  .enum(['inside-perimeter', 'outside-perimeter'])
  .describe('Whether the endpoint sits inside the organisation perimeter');

export const ProviderMode = z
  .enum(['SOVEREIGN', 'ASSIST'])
  .describe('SOVEREIGN refuses every outside-perimeter provider. Default in code.');

export const ProviderId = z.enum(['vllm', 'ollama', 'nim', 'nim-selfhosted', 'triton']);

export const TaskType = z
  .enum(['code', 'document', 'vision', 'calculation', 'retrieve'])
  .describe('Step type; drives routing');

/**
 * Capabilities are populated by the conformance suite, never hand-declared.
 *
 * A provider that fails the guided-json probe cannot be routed a step that
 * carries an outputSchemaRef, and nobody has to remember to write that down.
 */
export const ProviderCapability = z.enum([
  'text',
  'vision',
  'embedding',
  'tool-use',
  'guided-json',
  'seeded',
  'streaming',
]);

export const ChatRole = z.enum(['system', 'user', 'assistant', 'tool']);

export const ChatMessage = z.object({
  role: ChatRole,
  content: z.string(),
  name: z.string().optional(),
  toolCallId: Id.optional(),
});

export const ChatRequest = z
  .object({
    taskId: Id,
    stepId: Id,
    taskType: TaskType,
    messages: z.array(ChatMessage).min(1),
    toolNames: z.array(z.string()).default([]).describe('Allowlist; the step may invoke no others'),
    /**
     * Presence of this field makes constrained decoding mandatory.
     * The PAL refuses the call if the resolved provider lacks 'guided-json'.
     */
    outputSchemaRef: SchemaRef.optional(),
    seed: z.number().int().nullable().default(null),
    temperature: z.number().min(0).max(2).default(0),
    maxTokens: z.number().int().positive().optional(),
    stream: z.boolean().default(false),
  })
  .describe('A provider-agnostic inference request. The only shape the PAL accepts.');

/**
 * A model as an admin-editable data record, not a code constant.
 *
 * `license` and `licenseUrl` are deliberate: when someone asks whether the
 * organisation may actually deploy a given model commercially, the answer
 * should be on screen in the admin console rather than in someone's memory.
 */
export const RegistryEntry = z.object({
  modelId: Id,
  providerId: ProviderId,
  locality: Locality,
  trustBoundary: TrustBoundary,
  taskTypes: z.array(TaskType).min(1),
  capabilities: z.array(ProviderCapability).describe('Set by the conformance suite'),
  /** Weights digest. A DNA record naming a mutable tag is not reproducible. */
  modelDigest: z.string().min(1),
  quantisation: z.string().describe('e.g. Q4_K_M, AWQ, FP8, NVFP4'),
  /**
   * Passed as num_ctx on every Ollama call. Ollama applies a small default and
   * truncates long prompts silently -- the drafting step would lose its SOP
   * context with no error surface at all.
   */
  contextWindow: z.number().int().positive(),
  quality: z.number().min(0).max(1).describe('Benchmarked score for this task type'),
  estLoadS: z.number().nonnegative().describe('Cold-load seconds; the router residency term'),
  pinned: z.boolean().default(false).describe('Keep resident; maps to llama-swap hooks'),
  status: z.enum(['enabled', 'disabled', 'untested']).default('untested'),
  license: z.string().describe('SPDX id or stated terms'),
  licenseUrl: z.url().optional(),
});

export const HealthReport = z.object({
  providerId: ProviderId,
  healthy: z.boolean(),
  checkedAt: Iso8601,
  residentModels: z.array(z.string()).default([]),
  devicePlacement: z.enum(['cpu', 'gpu', 'mixed', 'unknown']).default('unknown'),
  detail: z.string().optional(),
});

/**
 * Emitted by every PAL call, at the moment of the call.
 *
 * The dashboard, the audit chain and the Decision DNA record are all consumers
 * of this one stream, which is why the proof cannot drift from the reality.
 */
export const PalAuditEvent = z.object({
  eventId: Id,
  seq: Seq,
  ts: Iso8601,
  taskId: Id,
  stepId: Id,
  providerId: ProviderId,
  locality: Locality,
  trustBoundary: TrustBoundary,
  endpointHost: z.string().describe('Resolved host, so nobody has to trust the label'),
  model: z.string(),
  modelDigest: z.string(),
  quantisation: z.string(),
  contextWindow: z.number().int().positive(),
  promptTemplateHash: z.string(),
  seed: z.number().int().nullable(),
  /**
   * A cached call is not a model call. Inflating the "work done locally"
   * counter with cache hits would be exactly the self-deception the guard
   * exists to prevent, so these are drawn differently and counted separately.
   */
  cacheHit: z.boolean().default(false),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  loadMs: z.number().nonnegative().describe('Model load, separated from inference'),
  status: z.enum(['ok', 'error', 'fallback', 'refused-locality']),
});

export type Locality = z.infer<typeof Locality>;
export type TrustBoundary = z.infer<typeof TrustBoundary>;
export type ProviderMode = z.infer<typeof ProviderMode>;
export type ProviderId = z.infer<typeof ProviderId>;
export type TaskType = z.infer<typeof TaskType>;
export type ProviderCapability = z.infer<typeof ProviderCapability>;
export type ChatMessage = z.infer<typeof ChatMessage>;
export type ChatRequest = z.infer<typeof ChatRequest>;
export type RegistryEntry = z.infer<typeof RegistryEntry>;
export type HealthReport = z.infer<typeof HealthReport>;
export type PalAuditEvent = z.infer<typeof PalAuditEvent>;
