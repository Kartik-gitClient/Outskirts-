import { randomUUID } from 'node:crypto';
import { EngineeringBridge, calculatePipePressureDrop } from '@outskirts/plugin-sdk';
import type { CalcResult, PipePressureDropInput } from '@outskirts/schemas';
import { generateSyntheticPidSheet } from '../../../../datasets/pid-synth/generator.js';
import { PidProcessGraph } from '../../../../services/perception/pid-graph.js';

export type TwinScenarioType =
  | 'pressure_change'
  | 'shutdown'
  | 'feedstock_change'
  | 'equipment_replacement';

export interface TwinScenario {
  type: TwinScenarioType;
  /** Equipment tag the scenario acts on (shutdown / replacement). */
  target?: string;
  description?: string;
  /** pressure_change: delta applied to the upstream vessel setpoint, bar. */
  deltaPressureBar?: number;
  /** feedstock_change: new operating conditions. */
  flowM3h?: number;
  densityKgM3?: number;
  viscosityPaS?: number;
  /** equipment_replacement: new nameplate values. */
  replacement?: { ratedFlowM3h?: number; designPressureBar?: number; pipeDiameterM?: number };
}

export interface TwinMetricDelta {
  metric: string;
  unit: string;
  baseline: number;
  simulated: number;
  delta: number;
  withinDesign: boolean;
  limit?: number;
}

export interface TwinState {
  flowM3h: number;
  densityKgM3: number;
  viscosityPaS: number;
  velocityMs: number;
  reynolds: number;
  frictionFactor: number;
  linePressureDropBar: number;
  upstreamPressureBar: number;
  pumpDischargeBar: number;
  terminalPressureBar: number;
  controlValveLossBar: number;
  pumpDutyKw: number;
  blocked: boolean;
}

export interface TwinResult {
  twinId: string;
  scenario: TwinScenario;
  executedAt: string;
  baseline: TwinState;
  simulated: TwinState;
  deltas: TwinMetricDelta[];
  affectedEquipment: string[];
  safetyVerdict: 'pass' | 'warn' | 'fail';
  findings: string[];
  recommendations: string[];
  steps: CalcResult['steps'];
  calculationSource: 'python-container' | 'local-deterministic-replay';
  correlation: string;
}

export interface TwinComponent {
  tag: string;
  name: string;
  kind: 'vessel' | 'pump' | 'valve' | 'transmitter' | 'piping';
  designPressureBar: number;
  normalPressureBar: number;
}

export const TWIN_COMPONENTS: TwinComponent[] = [
  { tag: 'V-101', name: 'Feed Surge Drum', kind: 'vessel', designPressureBar: 18.0, normalPressureBar: 3.0 },
  { tag: 'GV-1001', name: 'Suction Isolation Valve', kind: 'valve', designPressureBar: 20.0, normalPressureBar: 3.0 },
  { tag: 'P-101A', name: 'Charge Pump A', kind: 'pump', designPressureBar: 22.0, normalPressureBar: 11.0 },
  { tag: 'GV-1002', name: 'Discharge Isolation Valve', kind: 'valve', designPressureBar: 22.0, normalPressureBar: 10.6 },
  { tag: 'FV-2034', name: 'Charge Flow Control Valve', kind: 'valve', designPressureBar: 20.0, normalPressureBar: 10.1 },
  { tag: 'V-102', name: 'Crude Fractionator', kind: 'vessel', designPressureBar: 6.0, normalPressureBar: 3.5 },
];

export const PIPING_SEGMENT = {
  id: 'L-101..L-103',
  lengthM: 120,
  diameterM: 0.154,
  roughnessM: 0.000045,
};

export const TWIN_BASELINE = {
  flowM3h: 180,
  densityKgM3: 850,
  viscosityPaS: 0.0032,
  upstreamPressureBar: 3.0,
  pumpHeadBar: 8.0,
  // FV-2034 absorbs the bulk of the pump discharge head so the fractionator
  // sees ~3.5 bar; this is the normal operating split, not a frictional loss.
  controlValveLossBar: 7.0,
  pumpRatedFlowM3h: 180,
  pumpEfficiency: 0.72,
  allowableDropPer100mBar: 0.5,
  allowableFlowMinM3h: 120,
  allowableFlowMaxM3h: 240,
};

const ALLOWED_DROP_BAR = (TWIN_BASELINE.allowableDropPer100mBar * PIPING_SEGMENT.lengthM) / 100;

function buildPipeInput(
  flowM3h: number,
  densityKgM3: number,
  viscosityPaS: number,
  diameterM = PIPING_SEGMENT.diameterM,
): PipePressureDropInput {
  return {
    length: { value: PIPING_SEGMENT.lengthM, unit: 'm' },
    diameter: { value: diameterM, unit: 'm' },
    roughness: { value: PIPING_SEGMENT.roughnessM, unit: 'm' },
    flow: { value: flowM3h, unit: 'm**3/h' },
    density: { value: densityKgM3, unit: 'kg/m**3' },
    viscosity: { value: viscosityPaS, unit: 'Pa*s' },
  };
}

function hydraulicState(
  flowM3h: number,
  densityKgM3: number,
  viscosityPaS: number,
  upstreamPressureBar: number,
  pumpHeadBar: number,
  calc: CalcResult,
  diameterM = PIPING_SEGMENT.diameterM,
  controlValveLossBar = TWIN_BASELINE.controlValveLossBar,
  blocked = false,
): TwinState {
  const area = (Math.PI / 4) * diameterM * diameterM;
  const q = flowM3h / 3600;
  const velocity = blocked ? 0 : q / area;
  const reStep = calc.steps.find((s) => /reynolds/i.test(s.description));
  const fStep = calc.steps.find((s) => /friction factor/i.test(s.description));
  const reynolds = blocked ? 0 : Number(reStep?.result?.value ?? 0);
  const frictionFactor = blocked ? 0 : Number(fStep?.result?.value ?? 0);
  const lineDrop = blocked ? 0 : calc.result.value;

  const pumpDischargeBar = blocked ? upstreamPressureBar : upstreamPressureBar + pumpHeadBar;
  const terminalPressureBar = blocked
    ? upstreamPressureBar
    : pumpDischargeBar - lineDrop - controlValveLossBar;
  const pumpDutyKw = blocked ? 0 : ((flowM3h / 3600) * (pumpHeadBar * 100000)) / (TWIN_BASELINE.pumpEfficiency * 1000);

  return {
    flowM3h: blocked ? 0 : flowM3h,
    densityKgM3,
    viscosityPaS,
    velocityMs: Number(velocity.toFixed(3)),
    reynolds: Number(reynolds.toFixed(0)),
    frictionFactor: Number(frictionFactor.toFixed(5)),
    linePressureDropBar: Number(lineDrop.toFixed(4)),
    upstreamPressureBar: Number(upstreamPressureBar.toFixed(3)),
    pumpDischargeBar: Number(pumpDischargeBar.toFixed(3)),
    terminalPressureBar: Number(terminalPressureBar.toFixed(3)),
    controlValveLossBar: blocked ? 0 : controlValveLossBar,
    pumpDutyKw: Number(pumpDutyKw.toFixed(2)),
    blocked,
  };
}

async function computeDrop(
  bridge: EngineeringBridge,
  input: PipePressureDropInput,
): Promise<{ calc: CalcResult; source: TwinResult['calculationSource'] }> {
  const { result, source } = await bridge.computePipePressureDrop(input);
  if (source === 'python-container') return { calc: result, source };
  return { calc: calculatePipePressureDrop(input), source };
}

export async function runTwinScenario(
  scenario: TwinScenario,
  options?: { serviceUrl?: string; timeoutMs?: number },
): Promise<TwinResult> {
  const bridge = new EngineeringBridge({
    ...(options?.serviceUrl ? { serviceUrl: options.serviceUrl } : {}),
    ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });

  // --- Baseline ---
  const baselineCalc = await computeDrop(
    bridge,
    buildPipeInput(TWIN_BASELINE.flowM3h, TWIN_BASELINE.densityKgM3, TWIN_BASELINE.viscosityPaS),
  );
  const baseline = hydraulicState(
    TWIN_BASELINE.flowM3h,
    TWIN_BASELINE.densityKgM3,
    TWIN_BASELINE.viscosityPaS,
    TWIN_BASELINE.upstreamPressureBar,
    TWIN_BASELINE.pumpHeadBar,
    baselineCalc.calc,
  );

  // --- Scenario application ---
  let flow = TWIN_BASELINE.flowM3h;
  let density = TWIN_BASELINE.densityKgM3;
  let viscosity = TWIN_BASELINE.viscosityPaS;
  let upstream = TWIN_BASELINE.upstreamPressureBar;
  let head = TWIN_BASELINE.pumpHeadBar;
  let diameter = PIPING_SEGMENT.diameterM;
  let blocked = false;
  const findings: string[] = [];
  const recommendations: string[] = [];
  let affectedEquipment: string[] = [];

  const sheet = generateSyntheticPidSheet({ itemCount: 12 });
  const graph = new PidProcessGraph(sheet.groundTruth);

  switch (scenario.type) {
    case 'pressure_change': {
      upstream += scenario.deltaPressureBar ?? 0;
      findings.push(
        `Upstream setpoint changed by ${(scenario.deltaPressureBar ?? 0).toFixed(2)} bar; propagation evaluated across the full feed train.`,
      );
      break;
    }
    case 'shutdown': {
      const target = (scenario.target ?? 'P-101A').toUpperCase();
      const valves = graph.findIsolationValves(target);
      blocked = true;
      affectedEquipment = [target, ...valves.suction, ...valves.discharge];
      const downstream = graph.traceDownstream(target);
      findings.push(
        `Isolation boundary for ${target}: suction [${valves.suction.join(', ') || 'none'}], discharge [${valves.discharge.join(', ') || 'none'}].`,
      );
      findings.push(
        `Flow through the affected train is zero; downstream equipment [${downstream.join(', ')}] loses feed until the standby train is aligned.`,
      );
      recommendations.push(`Align standby charge pump P-101B and re-open FV-2034 before restarting ${target}.`);
      recommendations.push('Verify depressurisation of the isolated segment to flare before maintenance.');
      break;
    }
    case 'feedstock_change': {
      flow = scenario.flowM3h ?? flow;
      density = scenario.densityKgM3 ?? density;
      viscosity = scenario.viscosityPaS ?? viscosity;
      findings.push(
        `Feedstock switched to rho=${density} kg/m^3, mu=${viscosity} Pa*s at ${flow} m^3/h; hydraulics recomputed.`,
      );
      if (viscosity > TWIN_BASELINE.viscosityPaS * 1.5) {
        recommendations.push('Viscosity is materially higher; confirm pump NPSH margin and consider heat tracing.');
      }
      break;
    }
    case 'equipment_replacement': {
      const target = (scenario.target ?? 'P-101A').toUpperCase();
      head = scenario.replacement?.ratedFlowM3h
        ? TWIN_BASELINE.pumpHeadBar * (scenario.replacement.ratedFlowM3h / TWIN_BASELINE.pumpRatedFlowM3h)
        : head;
      diameter = scenario.replacement?.pipeDiameterM ?? diameter;
      affectedEquipment = [target];
      findings.push(
        `Replacement evaluated for ${target}: pump head ${head.toFixed(2)} bar, line diameter ${(diameter * 1000).toFixed(0)} mm.`,
      );
      break;
    }
  }

  const simulatedCalc = await computeDrop(bridge, buildPipeInput(flow, density, viscosity, diameter));
  const simulated = hydraulicState(
    flow,
    density,
    viscosity,
    upstream,
    head,
    simulatedCalc.calc,
    diameter,
    TWIN_BASELINE.controlValveLossBar,
    blocked,
  );

  // --- Design checks ---
  const v102 = TWIN_COMPONENTS.find((c) => c.tag === 'V-102')!;
  const pump = TWIN_COMPONENTS.find((c) => c.tag === 'P-101A')!;

  const deltas: TwinMetricDelta[] = [
    metric('Line pressure drop', 'bar', baseline.linePressureDropBar, simulated.linePressureDropBar, ALLOWED_DROP_BAR),
    metric('Pump discharge pressure', 'bar', baseline.pumpDischargeBar, simulated.pumpDischargeBar, pump.designPressureBar),
    metric('Terminal pressure (V-102)', 'bar', baseline.terminalPressureBar, simulated.terminalPressureBar, v102.designPressureBar),
    metric('Flow rate', 'm^3/h', baseline.flowM3h, simulated.flowM3h, TWIN_BASELINE.allowableFlowMaxM3h, TWIN_BASELINE.allowableFlowMinM3h),
    metric('Reynolds number', 'dimensionless', baseline.reynolds, simulated.reynolds),
    metric('Pump duty', 'kW', baseline.pumpDutyKw, simulated.pumpDutyKw),
  ];

  const failed = deltas.filter((d) => !d.withinDesign);
  let safetyVerdict: TwinResult['safetyVerdict'] = 'pass';
  if (failed.length > 0) {
    // Exceeding a design pressure is a hard fail; anything else is a warning.
    const designBreach = failed.some(
      (d) => d.metric.includes('Terminal') || d.metric.includes('Pump discharge'),
    );
    safetyVerdict = designBreach ? 'fail' : 'warn';
  }
  if (scenario.type === 'shutdown') safetyVerdict = 'warn';

  if (deltas.find((d) => d.metric.includes('Terminal'))?.withinDesign === false) {
    findings.push('Simulated terminal pressure exceeds the V-102 design pressure. Do not proceed without relief review.');
    recommendations.push('Re-run with a reduced upstream setpoint or confirm relief device capacity before execution.');
  }
  const flowDelta = deltas.find((d) => d.metric === 'Flow rate');
  if (flowDelta && !flowDelta.withinDesign) {
    findings.push(`Flow rate ${simulated.flowM3h} m^3/h is outside the pump operating band (${TWIN_BASELINE.allowableFlowMinM3h}-${TWIN_BASELINE.allowableFlowMaxM3h} m^3/h).`);
    recommendations.push('Trim the control valve or select a different pump trim to bring flow back into band.');
  }
  if (safetyVerdict === 'pass' && findings.length === 0) {
    findings.push('All simulated metrics remain within design and operating envelopes.');
  }
  recommendations.push('Scenario executed against the virtual plant only; no field device was actuated.');

  return {
    twinId: `twin-${randomUUID().slice(0, 8)}`,
    scenario,
    executedAt: new Date().toISOString(),
    baseline,
    simulated,
    deltas,
    affectedEquipment,
    safetyVerdict,
    findings,
    recommendations,
    steps: simulatedCalc.calc.steps,
    calculationSource: simulatedCalc.source,
    correlation: simulatedCalc.calc.correlation,
  };
}

function metric(
  name: string,
  unit: string,
  baselineValue: number,
  simulatedValue: number,
  limit?: number,
  lowerLimit?: number,
): TwinMetricDelta {
  let withinDesign = true;
  if (limit !== undefined && limit > 0) {
    if (name === 'Flow rate' && lowerLimit !== undefined) {
      withinDesign = simulatedValue >= lowerLimit && simulatedValue <= limit;
    } else {
      withinDesign = simulatedValue <= limit;
    }
  }
  return {
    metric: name,
    unit,
    baseline: baselineValue,
    simulated: simulatedValue,
    delta: Number((simulatedValue - baselineValue).toFixed(4)),
    withinDesign,
    ...(limit !== undefined ? { limit } : {}),
  };
}
