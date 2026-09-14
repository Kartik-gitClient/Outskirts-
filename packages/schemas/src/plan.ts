import { z } from 'zod';
import { Id, SchemaRef } from './common.js';
import { TaskType } from './pal.js';

/**
 * Plan DAG and the recipe library.
 *
 * Planning is recipe-first: a named, versioned, parameterised DAG covering a
 * known task class is selected where one matches, and the free-form planner
 * runs only for novel goals. Both produce the same validated contract, so the
 * executor cannot tell them apart -- which is the point.
 */

export const StepStatus = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'repaired',
  'cancelled',
]);

export const PlanStep = z.object({
  stepId: Id,
  kind: TaskType,
  description: z.string().min(1).describe("Planner's natural-language intent"),
  dependsOn: z.array(Id).default([]).describe('Step ids; validated acyclic and reachable'),
  /**
   * The execution-time half of the permission model. A step may invoke no
   * plugin outside this list, which is what bounds a prompt-injected tool
   * call: the model can only ask for tools the plan already named.
   */
  plugins: z.array(z.string()).default([]),
  /**
   * Named reference into the schema registry, not an inline schema.
   *
   * v1.0 carried `outputContract?: ZodSchema` here, which cannot cross a
   * process boundary or survive JSON serialisation. A name can, and the
   * executor resolves it to a JSON Schema that becomes the provider's
   * decoding constraint.
   */
  outputSchemaRef: SchemaRef.optional(),
  status: StepStatus.default('pending'),
});

/**
 * The planner's output contract.
 *
 * This is the object a 7B model must produce, which is why it is passed to the
 * provider as a decoding constraint rather than requested in a prompt.
 */
export const Plan = z.object({
  taskId: Id,
  recipeId: Id.optional().describe('Absent when the free-form planner produced this'),
  steps: z.array(PlanStep).min(1),
});

export const RecipeParameter = z.object({
  name: z.string().min(1),
  schemaRef: SchemaRef,
  required: z.boolean().default(true),
  description: z.string().optional(),
});

/**
 * A recipe is the unit of repeatability, and repeatability is what an auditor
 * wants. It is also what makes the demo deterministic and the planner cheap.
 */
export const Recipe = z.object({
  recipeId: Id,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().min(1),
  description: z.string(),
  matches: z.array(z.string()).describe('Intent phrases the selector matches against'),
  parameters: z.array(RecipeParameter).default([]),
  steps: z.array(PlanStep).min(1),
});

export type StepStatus = z.infer<typeof StepStatus>;
export type PlanStep = z.infer<typeof PlanStep>;
export type Plan = z.infer<typeof Plan>;
export type Recipe = z.infer<typeof Recipe>;
