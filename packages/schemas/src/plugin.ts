import { z } from 'zod';
import { Id, SchemaRef, Sha256, Iso8601, Seq } from './common.js';

/**
 * Plugin manifest and the three runtimes.
 *
 * The `runtime` field is what lets the Python capability plane be a plugin
 * rather than an exception to the plugin model: a perception service is a
 * signed, manifest-declared, permission-bounded capability admitted by the
 * guard, exactly like a WASM marketplace plugin. Same lifecycle, same
 * admission, same network posture.
 */
export const PluginRuntime = z.enum([
  /** Extism/WASM. Capability-based networking: the host grants access or there is none. */
  'wasm',
  /** Container on the internal network. First-party capability services. */
  'service',
  /** Sandboxed iframe, no same-origin, CSP blocking all network. Previews only. */
  'iframe',
]);

export const ToolSpec = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  description: z.string().min(1).describe('Offered to the planner; write it for a model to read'),
  inputSchemaRef: SchemaRef,
  outputSchemaRef: SchemaRef,
});

export const PluginManifest = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  minCore: z.string().describe('semver range checked against the runtime version'),
  runtime: PluginRuntime,
  entry: z.string().describe('Worker module, image ref, or entry URL depending on runtime'),
  /**
   * Only one value is accepted. A plugin that needs the network is not a
   * plugin, it is an integration, and it goes through a different review.
   */
  network: z.literal('deny-all'),
  fs: z.object({
    read: z.array(z.string()).default([]),
    write: z.array(z.string()).default([]),
  }),
  resources: z.object({
    cpu: z.number().positive(),
    mem: z.string().regex(/^\d+[MG]$/),
    timeoutS: z.number().int().positive(),
  }),
  tools: z.array(ToolSpec).min(1),
  /**
   * Signature is verified against a pinned org trust root with a keyId
   * allowlist. Without the allowlist a signature verifies nothing:
   * a self-signed unauthorized plugin still produces a valid signature.
   */
  keyId: z.string().min(1),
  signature: z.string().regex(/^ed25519:[a-f0-9]+$/),
});

export const PluginRecord = z.object({
  manifest: PluginManifest,
  installedAt: Iso8601,
  signatureValid: z.boolean(),
  keyTrusted: z.boolean(),
  enabled: z.boolean().default(false),
  enabledBy: Id.optional(),
  roleGates: z.array(z.enum(['junior', 'senior', 'admin'])).default(['admin']),
  manifestHash: Sha256,
});

/**
 * Emitted when a plugin attempts something its manifest forbids.
 *
 * The negative-case test ships in two variants because they prove different things:
 * a valid key with an undeclared-capability manifest proves the enforcement boundary,
 * and an untrusted key proves the admission check. v1.0 combined both into one test.
 */
export const GuardAlert = z.object({
  alertId: Id,
  seq: Seq,
  ts: Iso8601,
  kind: z.enum(['egress-blocked', 'signature-invalid', 'key-untrusted', 'fs-denied', 'resource-exceeded']),
  pluginId: z.string(),
  pluginVersion: z.string().optional(),
  targetHost: z.string().optional(),
  detail: z.string(),
});

export type PluginRuntime = z.infer<typeof PluginRuntime>;
export type ToolSpec = z.infer<typeof ToolSpec>;
export type PluginManifest = z.infer<typeof PluginManifest>;
export type PluginRecord = z.infer<typeof PluginRecord>;
export type GuardAlert = z.infer<typeof GuardAlert>;
