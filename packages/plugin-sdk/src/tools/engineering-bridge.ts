/**
 * Outskirts Engineering Capability Service Bridge (Section 9)
 *
 * Connects to the Python container (FastAPI wrapping fluids, CoolProp, Pint, and SymPy)
 * on the internal backplane (http://127.0.0.1:8001). If the container is offline,
 * gracefully falls back to local high-precision deterministic calculation while
 * maintaining the identical CalcResult schema, intermediate steps, and Pint uncertainty.
 */

import type { CalcResult, PipePressureDropInput } from '@outskirts/schemas';
import { calculatePipePressureDrop } from './pipe-calc.js';
import { calculateControlValveCv, type ValveSizingInputData } from './valve-calc.js';

export interface EngineeringBridgeOptions {
  serviceUrl?: string;
  timeoutMs?: number;
}

export class EngineeringBridge {
  private serviceUrl: string;
  private timeoutMs: number;

  constructor(options: EngineeringBridgeOptions = {}) {
    this.serviceUrl = options.serviceUrl ?? 'http://127.0.0.1:8001';
    this.timeoutMs = options.timeoutMs ?? 1500;
  }

  /**
   * Check if the Python engineering service is healthy on the internal network.
   */
  async checkHealth(): Promise<{
    available: boolean;
    service?: string;
    libraries?: string[];
  }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(`${this.serviceUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const body = (await res.json()) as {
          status: string;
          service: string;
          libraries: string[];
        };
        return {
          available: body.status === 'healthy',
          service: body.service,
          libraries: body.libraries,
        };
      }
    } catch {
      // Fallback mode
    }
    return { available: false };
  }

  /**
   * Compute pipe pressure drop via Python fluids/CoolProp/Pint container,
   * falling back to local deterministic Swamee-Jain calculation.
   */
  async computePipePressureDrop(input: PipePressureDropInput): Promise<{
    result: CalcResult;
    source: 'python-container' | 'local-deterministic-replay';
  }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(`${this.serviceUrl}/calculate/pipe_pressure_drop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as {
          calcId: string;
          result: { value: number; unit: string };
          correlation: string;
          steps: Array<{
            step: number;
            name: string;
            formula: string;
            intermediateValue: number;
            unit: string;
            notes?: string;
          }>;
          inputs: Record<string, { value: number; unit: string }>;
          uncertainty?: {
            mean: number;
            stdDev: number;
            tolerancePercent: number;
          };
        };

        const calcResult: CalcResult = {
          calcId: data.calcId,
          tool: 'pipe-pressure-drop',
          correlation: data.correlation,
          reference: 'Colebrook-White / Darcy-Weisbach (fluids 1.0.26)',
          inputs: input as unknown as Record<string, { value: number; unit: string }>,
          result: {
            value: data.result.value,
            unit: data.result.unit,
            uncertainty: data.uncertainty ? data.uncertainty.tolerancePercent / 100 : 0.035,
          },
          steps: data.steps.map((s) => ({
            ordinal: s.step,
            description: s.name,
            expression: s.formula,
            result: { value: s.intermediateValue, unit: s.unit },
          })),
          assumptions: [
            'Newtonian single-phase incompressible fluid',
            'Fully developed steady flow',
            'Isothermal conditions',
          ],
          validityWarnings: [],
        };

        return { result: calcResult, source: 'python-container' };
      }
    } catch {
      // Fallback
    }

    const localResult = calculatePipePressureDrop(input);
    return { result: localResult, source: 'local-deterministic-replay' };
  }

  /**
   * Compute control valve Cv sizing via ISA-75.01 standard.
   */
  async computeControlValveCv(input: ValveSizingInputData): Promise<{
    result: CalcResult;
    source: 'python-container' | 'local-deterministic-replay';
  }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(`${this.serviceUrl}/calculate/control_valve_cv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as {
          calcId: string;
          result: { value: number; unit: string };
          correlation: string;
          steps: Array<{
            step: number;
            name: string;
            formula: string;
            intermediateValue: number;
            unit: string;
            notes?: string;
          }>;
          uncertainty?: {
            mean: number;
            tolerancePercent: number;
          };
        };

        const calcResult: CalcResult = {
          calcId: data.calcId,
          tool: 'control_valve_cv',
          correlation: data.correlation,
          reference: 'ISA-75.01.01-2007 (fluids 1.0.26)',
          inputs: {
            flowRate: input.flowRate,
            deltaP: input.deltaP,
            specificGravity: { value: input.specificGravity ?? 0.85, unit: 'dimensionless' },
          },
          result: {
            value: data.result.value,
            unit: data.result.unit,
            uncertainty: data.uncertainty ? (data.uncertainty.tolerancePercent / 100) : 0.025,
          },
          steps: data.steps.map((s) => ({
            ordinal: s.step,
            description: s.name,
            expression: s.formula,
            result: { value: s.intermediateValue, unit: s.unit },
          })),
          assumptions: [
            'Incompressible liquid flow (no flashing)',
            'Turbulent flow regime',
          ],
          validityWarnings: [],
        };

        return { result: calcResult, source: 'python-container' };
      }
    } catch {
      // Fallback
    }

    const localResult = calculateControlValveCv(input);
    return { result: localResult, source: 'local-deterministic-replay' };
  }
}
