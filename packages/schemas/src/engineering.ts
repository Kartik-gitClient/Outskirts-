import { z } from 'zod';
import { Id } from './common.js';

/**
 * Engineering service contracts -- the second capability plane boundary.
 *
 * Backed by `fluids`, CoolProp, Pint and SymPy rather than hand-written
 * correlations. The `steps` array is the audit-grade working, and
 * `correlation` names the governing method so the approval note can cite it
 * the way an engineer would.
 */

export const Quantity = z.object({
  value: z.number(),
  unit: z.string().describe('Pint-parseable, e.g. "m**3/h", "bar", "kg/m**3"'),
  /** Pint propagates this; a computed figure with a tolerance reads as honest. */
  uncertainty: z.number().nonnegative().optional(),
});

export const CalcStep = z.object({
  ordinal: z.number().int().nonnegative(),
  description: z.string(),
  expression: z.string().optional().describe('SymPy-parseable, for C2 verification'),
  result: Quantity.optional(),
});

/**
 * The return shape of every engineering tool.
 *
 * C2 replays the call with `inputs`, recomputes, and compares against
 * `result` -- so this object is simultaneously the answer, the working shown
 * to a reviewer, and the test fixture.
 */
export const CalcResult = z.object({
  calcId: Id,
  tool: z.string(),
  correlation: z.string().describe('Governing method, e.g. "Darcy-Weisbach / Colebrook"'),
  reference: z.string().optional().describe('Standard or text the correlation comes from'),
  inputs: z.record(z.string(), Quantity),
  result: Quantity,
  steps: z.array(CalcStep),
  assumptions: z.array(z.string()).default([]),
  validityWarnings: z.array(z.string()).default([]).describe('e.g. Reynolds outside correlation range'),
});

export const PipePressureDropInput = z.object({
  length: Quantity,
  diameter: Quantity,
  roughness: Quantity,
  flow: Quantity,
  density: Quantity.optional(),
  viscosity: Quantity.optional(),
  fluid: z.string().optional().describe('CoolProp fluid name; supplies density/viscosity if omitted'),
  temperature: Quantity.optional(),
});

export const PumpHeadInput = z.object({
  flow: Quantity,
  density: Quantity,
  efficiency: z.number().min(0).max(1),
  head: Quantity.optional(),
});

export const ValveSizingInput = z.object({
  flowRate: Quantity,
  deltaP: Quantity,
  specificGravity: z.number().positive().default(0.85),
});

export type Quantity = z.infer<typeof Quantity>;
export type CalcStep = z.infer<typeof CalcStep>;
export type CalcResult = z.infer<typeof CalcResult>;
export type PipePressureDropInput = z.infer<typeof PipePressureDropInput>;
export type PumpHeadInput = z.infer<typeof PumpHeadInput>;
export type ValveSizingInput = z.infer<typeof ValveSizingInput>;
