import { z } from 'zod';
import { Id, Iso8601, Seq } from './common.js';
import { Plan, StepStatus } from './plan.js';
import { CriticVerdict } from './critic.js';
import { GuardAlert } from './plugin.js';
import { Locality, TrustBoundary, ProviderMode, TaskType } from './pal.js';

/**
 * WebSocket event protocol, task-scoped.
 *
 * Every event carries `seq`. A client that detects a gap replays from
 * GET /tasks/:id/events?since=<seq> rather than silently rendering an
 * incomplete timeline -- which is what would otherwise happen the first time
 * a socket drops mid-demo.
 */

const base = { seq: Seq, ts: Iso8601, taskId: Id };

export const StepUpdate = z.object({
  type: z.literal('step.update'),
  ...base,
  stepId: Id,
  node: z.string(),
  status: StepStatus,
  payloadDigest: z.string().optional(),
});

export const PlanReady = z.object({
  type: z.literal('plan.ready'),
  ...base,
  plan: Plan,
});

export const TokenChunk = z.object({
  type: z.literal('token.chunk'),
  ...base,
  streamId: Id,
  delta: z.string(),
});

export const RouterDecision = z.object({
  type: z.literal('router.decision'),
  ...base,
  stepId: Id,
  taskType: TaskType,
  model: z.string(),
  providerId: z.string(),
  locality: Locality,
  trustBoundary: TrustBoundary,
  /** Recorded, not generated after the fact. This is what makes the panel honest. */
  reason: z.string(),
  wasFallback: z.boolean().default(false),
});

export const CriticVerdictEvent = z.object({
  type: z.literal('critic.verdict'),
  ...base,
  verdict: CriticVerdict,
});

export const ArtifactReady = z.object({
  type: z.literal('artifact.ready'),
  ...base,
  artifactId: Id,
  artifactType: z.enum(['docx', 'xlsx', 'pptx', 'pdf', 'code', 'chart']),
  path: z.string(),
  c2paManifestRef: z.string().optional(),
});

export const IngestProgress = z.object({
  type: z.literal('ingest.progress'),
  ...base,
  documentId: Id,
  stage: z.enum(['acquire', 'extract', 'chunk', 'embed', 'register']),
  pagesDone: z.number().int().nonnegative().optional(),
  pagesTotal: z.number().int().nonnegative().optional(),
});

export const SovereigntyEvent = z.object({
  type: z.literal('sovereignty.event'),
  ...base,
  locality: Locality,
  trustBoundary: TrustBoundary,
  endpointHost: z.string(),
  cacheHit: z.boolean().default(false),
});

export const SovereigntyAlert = z.object({
  type: z.literal('sovereignty.alert'),
  ...base,
  alert: GuardAlert,
});

export const ModeChanged = z.object({
  type: z.literal('mode.changed'),
  ...base,
  mode: ProviderMode,
  transitionAuditId: Id,
});

export const CacheHit = z.object({
  type: z.literal('cache.hit'),
  ...base,
  stepId: Id,
  model: z.string(),
});

export const StepRetry = z.object({
  type: z.literal('step.retry'),
  ...base,
  stepId: Id,
  attempt: z.number().int().positive(),
  budget: z.number().int().positive(),
  reason: z.string(),
});

export const TaskComplete = z.object({
  type: z.literal('task.complete'),
  ...base,
  dnaId: Id,
  artifactIds: z.array(Id),
});

export const TaskFailed = z.object({
  type: z.literal('task.failed'),
  ...base,
  reason: z.string(),
  escalated: z.boolean().default(false),
});

export const ServerEvent = z.discriminatedUnion('type', [
  StepUpdate,
  PlanReady,
  TokenChunk,
  RouterDecision,
  CriticVerdictEvent,
  ArtifactReady,
  IngestProgress,
  SovereigntyEvent,
  SovereigntyAlert,
  ModeChanged,
  CacheHit,
  StepRetry,
  TaskComplete,
  TaskFailed,
]);

export type ServerEvent = z.infer<typeof ServerEvent>;
