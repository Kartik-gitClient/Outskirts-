import { EngineeringBridge } from '@outskirts/plugin-sdk';
import type { CalcResult } from '@outskirts/schemas';

export interface MachineStep {
  step: number;
  name: string;
  formula: string;
  value: number;
  unit: string;
  notes?: string;
}

export interface MachineResult {
  kind: 'compressor' | 'valve';
  inputs: Record<string, number | string>;
  result: { value: number; unit: string };
  steps: MachineStep[];
  correlation: string;
  source: 'python-container' | 'local-deterministic-replay';
  uncertaintyPercent: number;
}

export interface CompressorInput {
  fluid: string;
  suctionPressureBar: number;
  dischargePressureBar: number;
  suctionTemperatureC: number;
  massFlowKgs: number;
  efficiency: number;
}

const ENGINEERING_URL = process.env.ENGINEERING_SERVICE_URL ?? 'http://127.0.0.1:8001';

/**
 * Compressor head/outlet-temperature/shaft-power. Prefers the sovereign Python
 * engineering container (CoolProp properties); falls back to ideal-gas.
 */
export async function computeCompressor(input: CompressorInput): Promise<MachineResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${ENGINEERING_URL}/calculate/compressor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fluid: input.fluid,
        suctionPressure: { value: input.suctionPressureBar, unit: 'bar' },
        dischargePressure: { value: input.dischargePressureBar, unit: 'bar' },
        suctionTemperature: { value: input.suctionTemperatureC, unit: 'C' },
        massFlow: { value: input.massFlowKgs, unit: 'kg/s' },
        efficiency: input.efficiency,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as {
        result: { value: number; unit: string };
        correlation: string;
        steps: Array<{ step: number; name: string; formula: string; intermediateValue: number; unit: string; notes?: string }>;
        uncertainty?: { tolerancePercent: number };
      };
      return {
        kind: 'compressor',
        inputs: { ...input },
        result: data.result,
        steps: data.steps.map((s) => ({
          step: s.step,
          name: s.name,
          formula: s.formula,
          value: s.intermediateValue,
          unit: s.unit,
          ...(s.notes ? { notes: s.notes } : {}),
        })),
        correlation: data.correlation,
        source: 'python-container',
        uncertaintyPercent: data.uncertainty?.tolerancePercent ?? 4.0,
      };
    }
  } catch {
    // fall through to deterministic local model
  }

  const { suctionPressureBar, dischargePressureBar, suctionTemperatureC, massFlowKgs, efficiency } = input;
  const T1 = suctionTemperatureC + 273.15;
  const PR = dischargePressureBar / suctionPressureBar;
  const k = 1.4;
  const cp = 1005;
  const T2s = T1 * Math.pow(PR, (k - 1) / k);
  const headIsentropic = cp * (T2s - T1);
  const T2 = T1 + (T2s - T1) / efficiency;
  const powerKw = (massFlowKgs * cp * (T2 - T1)) / 1000;

  return {
    kind: 'compressor',
    inputs: { ...input },
    result: { value: Number(powerKw.toFixed(3)), unit: 'kW' },
    steps: [
      { step: 1, name: 'Pressure Ratio', formula: 'PR = P2 / P1', value: Number(PR.toFixed(3)), unit: 'dimensionless' },
      { step: 2, name: 'Isentropic Exponent', formula: 'k = cp / cv', value: k, unit: 'dimensionless' },
      { step: 3, name: 'Isentropic Outlet Temperature', formula: 'T2s = T1 * PR^((k-1)/k)', value: Number(T2s.toFixed(2)), unit: 'K' },
      { step: 4, name: 'Isentropic Head', formula: 'H = cp * (T2s - T1)', value: Number(headIsentropic.toFixed(1)), unit: 'J/kg' },
      { step: 5, name: 'Actual Outlet Temperature', formula: 'T2 = T1 + (T2s - T1) / eta', value: Number(T2.toFixed(2)), unit: 'K', notes: `eta = ${efficiency}` },
      { step: 6, name: 'Shaft Power', formula: 'W = mdot * cp * (T2 - T1)', value: Number(powerKw.toFixed(3)), unit: 'kW' },
    ],
    correlation: 'Isentropic compression / ideal-gas head (k=1.4, cp=1005 J/kgK)',
    source: 'local-deterministic-replay',
    uncertaintyPercent: 4.0,
  };
}

export interface ValveInput {
  flowRateM3h: number;
  deltaPBar: number;
  specificGravity: number;
}

export async function computeValve(input: ValveInput): Promise<MachineResult> {
  const bridge = new EngineeringBridge();
  const { result, source } = await bridge.computeControlValveCv({
    flowRate: { value: input.flowRateM3h, unit: 'm**3/h' },
    deltaP: { value: input.deltaPBar, unit: 'bar' },
    specificGravity: input.specificGravity,
  });
  return toMachineResult(result, 'valve', source, { ...input });
}

function toMachineResult(
  calc: CalcResult,
  kind: MachineResult['kind'],
  source: MachineResult['source'],
  inputs: Record<string, number | string>,
): MachineResult {
  return {
    kind,
    inputs,
    result: { value: calc.result.value, unit: calc.result.unit },
    steps: calc.steps.map((s) => ({
      step: s.ordinal,
      name: s.description,
      formula: s.expression ?? '',
      value: s.result?.value ?? 0,
      unit: s.result?.unit ?? '',
    })),
    correlation: calc.correlation,
    source,
    uncertaintyPercent: Number(((calc.result.uncertainty ?? 0.025) * 100).toFixed(1)),
  };
}
