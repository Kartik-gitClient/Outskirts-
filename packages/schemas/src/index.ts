import type { ZodType } from 'zod';

import * as common from './common.js';
import * as pal from './pal.js';
import * as plan from './plan.js';
import * as critic from './critic.js';
import * as knowledge from './knowledge.js';
import * as plugin from './plugin.js';
import * as audit from './audit.js';
import * as events from './events.js';
import * as perception from './perception.js';
import * as engineering from './engineering.js';

export * from './common.js';
export * from './pal.js';
export * from './plan.js';
export * from './critic.js';
export * from './knowledge.js';
export * from './plugin.js';
export * from './audit.js';
export * from './events.js';
export * from './perception.js';
export * from './engineering.js';

/**
 * The schema spine.
 *
 * Every entry here is emitted to build/schema/<Name>.json, which is the
 * canonical artefact the rest of the system consumes:
 *
 *   - TypeScript gets types natively from the Zod source
 *   - Python gets Pydantic models generated from the JSON Schema
 *   - The PAL hands the JSON Schema to the provider as a decoding constraint
 *   - The gateway serves it as OpenAPI component schemas
 *   - Plugin ToolSpec entries reference it by name
 *
 * Adding a contract is one line here. Forgetting to regenerate is a CI failure,
 * which is what keeps the Python plane honest without Python authors ever
 * editing TypeScript.
 */
export const SCHEMA_REGISTRY = {
  // --- primitives -------------------------------------------------------
  SchemaRef: common.SchemaRef,

  // --- provider abstraction ---------------------------------------------
  Locality: pal.Locality,
  TrustBoundary: pal.TrustBoundary,
  ProviderMode: pal.ProviderMode,
  TaskType: pal.TaskType,
  ProviderCapability: pal.ProviderCapability,
  ChatMessage: pal.ChatMessage,
  ChatRequest: pal.ChatRequest,
  RegistryEntry: pal.RegistryEntry,
  HealthReport: pal.HealthReport,
  PalAuditEvent: pal.PalAuditEvent,

  // --- agent core -------------------------------------------------------
  StepStatus: plan.StepStatus,
  PlanStep: plan.PlanStep,
  Plan: plan.Plan,
  Recipe: plan.Recipe,

  // --- verification -----------------------------------------------------
  CriticCheck: critic.CriticCheck,
  ClaimVerdict: critic.ClaimVerdict,
  CriticVerdict: critic.CriticVerdict,

  // --- knowledge --------------------------------------------------------
  DocumentClass: knowledge.DocumentClass,
  FreshnessState: knowledge.FreshnessState,
  FreshnessSpine: knowledge.FreshnessSpine,
  DocumentRecord: knowledge.DocumentRecord,
  Chunk: knowledge.Chunk,
  Citation: knowledge.Citation,

  // --- plugins ----------------------------------------------------------
  PluginRuntime: plugin.PluginRuntime,
  ToolSpec: plugin.ToolSpec,
  PluginManifest: plugin.PluginManifest,
  PluginRecord: plugin.PluginRecord,
  GuardAlert: plugin.GuardAlert,

  // --- sovereignty ------------------------------------------------------
  AuditEvent: audit.AuditEvent,
  ChainAnchor: audit.ChainAnchor,
  ChainVerifyResult: audit.ChainVerifyResult,
  DecisionDna: audit.DecisionDna,

  // --- streaming --------------------------------------------------------
  ServerEvent: events.ServerEvent,

  // --- capability plane: perception -------------------------------------
  BBox: perception.BBox,
  ExtractedBlock: perception.ExtractedBlock,
  ExtractionResult: perception.ExtractionResult,
  InspectionFinding: perception.InspectionFinding,
  InspectionExtraction: perception.InspectionExtraction,
  DrawingTag: perception.DrawingTag,
  DrawingExtraction: perception.DrawingExtraction,

  // --- capability plane: engineering ------------------------------------
  Quantity: engineering.Quantity,
  CalcStep: engineering.CalcStep,
  CalcResult: engineering.CalcResult,
  PipePressureDropInput: engineering.PipePressureDropInput,
  PumpHeadInput: engineering.PumpHeadInput,
  ValveSizingInput: engineering.ValveSizingInput,
} as const satisfies Record<string, ZodType>;

export type SchemaName = keyof typeof SCHEMA_REGISTRY;

/** Resolve a SchemaRef to its Zod schema, or throw with the valid names listed. */
export function resolveSchema(ref: string): ZodType {
  const schema = (SCHEMA_REGISTRY as Record<string, ZodType>)[ref];
  if (!schema) {
    throw new Error(
      `Unknown schema ref "${ref}". Known: ${Object.keys(SCHEMA_REGISTRY).join(', ')}`,
    );
  }
  return schema;
}
