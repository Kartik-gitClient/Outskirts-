import { randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import type {
  CalcResult,
  PipePressureDropInput,
  Quantity,
} from '@outskirts/schemas';
import { defineSignedManifest } from '../manifest.js';

export function calculatePipePressureDrop(input: PipePressureDropInput): CalcResult {
  const calcId = `calc-${randomUUID().slice(0, 8)}`;

  // Normalise inputs to SI units (m, kg/s or m3/s, Pa.s, kg/m3)
  const L = input.length.value; // meters
  const D = input.diameter.value; // meters
  const eps = input.roughness.value; // meters
  const Q = input.flow.value / 3600; // assume m3/h -> m3/s
  const rho = input.density?.value ?? 998.2; // kg/m3 (water default)
  const mu = input.viscosity?.value ?? 0.001002; // Pa.s (water at 20C)

  // Step 1: Cross-sectional Area
  const A = (Math.PI * Math.pow(D, 2)) / 4;

  // Step 2: Mean Flow Velocity
  const v = Q / A;

  // Step 3: Reynolds Number
  const Re = (rho * v * D) / mu;

  // Step 4: Friction factor (Swamee-Jain explicit approximation of Colebrook)
  let f: number;
  let regime = 'turbulent';
  if (Re < 2300) {
    regime = 'laminar';
    f = 64 / Re;
  } else {
    // Swamee-Jain equation for full turbulence in commercial pipes
    const term = eps / (3.7 * D) + 5.74 / Math.pow(Re, 0.9);
    f = 0.25 / Math.pow(Math.log10(term), 2);
  }

  // Step 5: Darcy-Weisbach Pressure Drop: deltaP = f * (L / D) * (rho * v^2 / 2)
  const deltaP = f * (L / D) * ((rho * Math.pow(v, 2)) / 2);
  const deltaP_bar = deltaP / 100_000;

  const steps = [
    {
      ordinal: 1,
      description: 'Compute pipe cross-sectional area',
      expression: 'A = pi * (D / 2)**2',
      result: { value: Number(A.toFixed(6)), unit: 'm**2' },
    },
    {
      ordinal: 2,
      description: 'Compute mean fluid velocity',
      expression: 'v = Q / A',
      result: { value: Number(v.toFixed(3)), unit: 'm/s' },
    },
    {
      ordinal: 3,
      description: `Compute Reynolds number (${regime})`,
      expression: 'Re = rho * v * D / mu',
      result: { value: Number(Re.toFixed(1)), unit: 'dimensionless' },
    },
    {
      ordinal: 4,
      description: 'Compute Darcy friction factor via Swamee-Jain',
      expression: 'f = 0.25 / (log10(eps / (3.7 * D) + 5.74 / Re**0.9))**2',
      result: { value: Number(f.toFixed(5)), unit: 'dimensionless' },
    },
    {
      ordinal: 5,
      description: 'Compute total frictional head loss / pressure drop',
      expression: 'deltaP = f * (L / D) * (rho * v**2 / 2)',
      result: { value: Number(deltaP_bar.toFixed(4)), unit: 'bar' },
    },
  ];

  const resultQuantity: Quantity = {
    value: Number(deltaP_bar.toFixed(4)),
    unit: 'bar',
    uncertainty: 0.005,
  };

  return {
    calcId,
    tool: 'pipe-pressure-drop',
    correlation: 'Darcy-Weisbach / Swamee-Jain',
    reference: 'Crane Technical Paper 410 / ISO 5167',
    inputs: {
      length: input.length,
      diameter: input.diameter,
      roughness: input.roughness,
      flow: input.flow,
      density: { value: rho, unit: 'kg/m**3' },
      viscosity: { value: mu, unit: 'Pa*s' },
    },
    result: resultQuantity,
    steps,
    assumptions: [
      'Newtonian single-phase incompressible fluid',
      'Fully developed steady flow',
      'Isothermal conditions',
    ],
    validityWarnings: [],
  };
}

export function createPipeCalcPlugin(
  keyId: string,
  privateKey: string | KeyObject,
) {
  const { manifest } = defineSignedManifest({
    id: 'pipe-calc-plugin',
    version: '1.0.0',
    minCore: '>=0.1.0',
    runtime: 'wasm',
    tools: [
      {
        name: 'calculate_pressure_drop',
        description: 'Calculate frictional pressure drop in a piping segment using Darcy-Weisbach',
        inputSchemaRef: 'PipePressureDropInput',
        outputSchemaRef: 'CalcResult',
      },
    ],
    keyId,
    privateKey,
  });

  const handlers = {
    calculate_pressure_drop: (input: unknown) =>
      calculatePipePressureDrop(input as PipePressureDropInput),
  };

  return { manifest, handlers };
}
