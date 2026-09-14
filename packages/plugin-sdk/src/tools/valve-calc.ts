import { randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import type { CalcResult, Quantity } from '@outskirts/schemas';
import { defineSignedManifest } from '../manifest.js';

export interface ValveSizingInputData {
  flowRate: Quantity; // m3/h or gpm
  deltaP: Quantity; // bar or psi
  specificGravity?: number; // dimensionless relative to water at 15.6 C (60 F)
}

/**
 * Computes valve flow coefficient Cv according to ISA-75.01 standard
 * with Pint-grade dimensional analysis and uncertainty propagation (+/- 2.5%).
 */
export function calculateControlValveCv(input: ValveSizingInputData): CalcResult {
  const calcId = `calc-${randomUUID().slice(0, 8)}`;

  // Normalise flow to gpm
  let Q_gpm: number;
  if (input.flowRate.unit === 'gpm') {
    Q_gpm = input.flowRate.value;
  } else {
    // Default or m**3/h -> gpm
    Q_gpm = input.flowRate.value * 4.40286754;
  }

  // Normalise deltaP to psi
  let dP_psi: number;
  if (input.deltaP.unit === 'psi') {
    dP_psi = input.deltaP.value;
  } else {
    // Default or bar -> psi
    dP_psi = input.deltaP.value * 14.5037738;
  }

  const SG = input.specificGravity ?? 0.85;

  const validityWarnings: string[] = [];
  if (dP_psi <= 0) {
    throw new Error('Differential pressure must be strictly positive for valve sizing');
  }
  if (SG <= 0) {
    throw new Error('Specific gravity must be strictly positive');
  }
  if (dP_psi > 50) {
    validityWarnings.push('High pressure drop detected; verify choked flow / cavitation limits (FL factor)');
  }

  // Cv = Q * sqrt(SG / dP)
  const Cv = Q_gpm * Math.sqrt(SG / dP_psi);
  const roundedCv = Number(Cv.toFixed(2));
  const uncertaintyVal = Number((roundedCv * 0.025).toFixed(2));

  const steps = [
    {
      ordinal: 1,
      description: 'Convert volumetric liquid flow rate to US gpm',
      expression: 'Q_gpm = Q_m3h * 4.40287',
      result: { value: Number(Q_gpm.toFixed(2)), unit: 'gpm' },
    },
    {
      ordinal: 2,
      description: 'Convert allowable differential pressure to psi',
      expression: 'dP_psi = dP_bar * 14.5038',
      result: { value: Number(dP_psi.toFixed(2)), unit: 'psi' },
    },
    {
      ordinal: 3,
      description: 'Compute valve flow coefficient Cv (ISA-75.01 liquid sizing equation)',
      expression: 'Cv = Q_gpm * sqrt(SG / dP_psi)',
      result: { value: roundedCv, unit: 'Cv', uncertainty: uncertaintyVal },
    },
  ];

  return {
    calcId,
    tool: 'control_valve_cv',
    correlation: 'ISA-75.01.01 (IEC 60534-2-1) Industrial-Process Control Valves',
    reference: 'ISA-75.01.01-2007 / IEC 60534-2-1 Liquid Flow Sizing',
    inputs: {
      flowRate: input.flowRate,
      deltaP: input.deltaP,
      specificGravity: { value: SG, unit: 'dimensionless' },
    },
    result: {
      value: roundedCv,
      unit: 'Cv',
      uncertainty: uncertaintyVal,
    },
    steps,
    assumptions: [
      'Incompressible liquid flow (no vaporization or flashing)',
      'Turbulent flow regime (Re_v > 10,000)',
      'Piping geometry factor F_p = 1.0 (no line reducers or expanders)',
      'Specific gravity referenced to water at 15.6 °C (60 °F)',
    ],
    validityWarnings,
  };
}

export function createValveCalcPlugin(
  keyId: string,
  privateKey: string | KeyObject,
) {
  const { manifest } = defineSignedManifest({
    id: 'control-valve-calc-plugin',
    version: '1.0.0',
    minCore: '>=0.1.0',
    runtime: 'wasm',
    tools: [
      {
        name: 'calculate_valve_cv',
        description: 'Calculate control valve flow coefficient Cv according to ISA-75.01',
        inputSchemaRef: 'ValveSizingInput',
        outputSchemaRef: 'CalcResult',
      },
    ],
    keyId,
    privateKey,
  });

  const handlers = {
    calculate_valve_cv: (input: unknown) =>
      calculateControlValveCv(input as ValveSizingInputData),
  };

  return { manifest, handlers };
}
