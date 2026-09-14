import { categoryOf, type EquipmentRecord } from '../data/equipment.js';
import { computeCompressor, computeValve } from './compute.js';

const G = 9.80665;
const WATER_CP = 4186; // J/kgK
const OIL_CP = 2100; // J/kgK

export interface SimOutput {
  name: string;
  value: number;
  unit: string;
  formula?: string;
}

export interface SimStep {
  step: number;
  name: string;
  formula: string;
  value: number;
  unit: string;
  notes?: string;
}

export interface EquipmentSimResult {
  equipment: EquipmentRecord;
  category: string;
  inputs: Record<string, number | string>;
  outputs: SimOutput[];
  steps: SimStep[];
  correlation: string;
  source: 'python-container' | 'local-deterministic-replay';
  warnings: string[];
  /** Drives the animated schematic on the client. */
  visual: { kind: string; data: Record<string, number | string> };
}

type Overrides = Record<string, number>;

function pick(overrides: Overrides, key: string, fallback: number | undefined, hardDefault: number): number {
  const v = overrides[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback;
  return hardDefault;
}

function num(record: EquipmentRecord, key: keyof EquipmentRecord): number | undefined {
  const v = record[key];
  return typeof v === 'number' ? v : undefined;
}

export async function simulateEquipment(
  record: EquipmentRecord,
  overrides: Overrides = {},
): Promise<EquipmentSimResult> {
  const category = categoryOf(record);
  switch (category) {
    case 'pump':
      return pump(record, overrides);
    case 'compressor':
      return compressor(record, overrides);
    case 'blower':
      return blower(record, overrides);
    case 'heat-exchanger':
      return heatExchanger(record, overrides);
    case 'valve':
      return valve(record, overrides);
    case 'turbine':
      return turbine(record, overrides);
    case 'boiler':
      return boiler(record, overrides);
    case 'vessel':
      return vessel(record, overrides);
    case 'tank':
      return tank(record, overrides);
    case 'cooling-tower':
      return coolingTower(record, overrides);
    case 'column':
      return column(record, overrides);
    case 'reactor':
      return reactor(record, overrides);
    case 'furnace':
      return furnace(record, overrides);
    case 'motor':
      return motor(record, overrides);
    case 'transformer':
      return transformer(record, overrides);
  }
}

function base(
  record: EquipmentRecord,
  category: string,
): Pick<EquipmentSimResult, 'equipment' | 'category' | 'warnings'> {
  return { equipment: record, category, warnings: [] };
}

// --- Pumps -----------------------------------------------------------------

function pump(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'pump');
  const service = (record.service ?? '').toLowerCase();
  const isWater = service.includes('water');
  const density = pick(o, 'densityKgM3', undefined, isWater ? 998 : 850);
  const speedPct = pick(o, 'speedPercent', undefined, 100);
  const s = speedPct / 100;
  const ratedFlow = num(record, 'flowM3Hr') ?? 100;
  const ratedHead = num(record, 'headM') ?? 50;
  const effRated = (num(record, 'efficiency') ?? 85) / 100;

  const flow = ratedFlow * s;
  const head = ratedHead * s * s;
  const q = flow / 3600;
  const hydraulicKw = (density * G * q * head) / 1000;
  const shaftKw = hydraulicKw / effRated;
  const dischargeBar = (density * G * head) / 1e5;
  const npshMargin = 3.0;

  b.warnings = [];
  if (record.maxPressureBar && dischargeBar > record.maxPressureBar) {
    b.warnings.push(`Discharge ${dischargeBar.toFixed(1)} bar exceeds casing max ${record.maxPressureBar} bar`);
  }
  if (record.powerKW && shaftKw > record.powerKW * 1.05) {
    b.warnings.push(`Shaft power ${shaftKw.toFixed(0)} kW exceeds rated motor ${record.powerKW} kW`);
  }
  if (head > ratedHead * 1.05) {
    b.warnings.push('Operating point above rated head - check affinity limit');
  }

  return {
    ...b,
    inputs: { speedPercent: speedPct, densityKgM3: density, ratedFlowM3Hr: ratedFlow, ratedHeadM: ratedHead },
    outputs: [
      { name: 'Flow', value: r2(flow), unit: 'm3/h', formula: 'Q = Q_rated x (N/N_rated)' },
      { name: 'Head', value: r2(head), unit: 'm', formula: 'H = H_rated x (N/N_rated)^2' },
      { name: 'Hydraulic power', value: r2(hydraulicKw), unit: 'kW', formula: 'P_hyd = rho g Q H' },
      { name: 'Shaft power', value: r2(shaftKw), unit: 'kW', formula: 'P_shaft = P_hyd / eta' },
      { name: 'Discharge pressure', value: r2(dischargeBar), unit: 'bar', formula: 'dp = rho g H' },
      { name: 'Net suction margin', value: npshMargin, unit: 'm', formula: 'NPSHa - NPSHr' },
    ],
    steps: [
      { step: 1, name: 'Speed ratio', formula: 's = N / N_rated', value: r3(s), unit: '-', notes: `${speedPct}% of ${record.rpm ?? 2980} rpm` },
      { step: 2, name: 'Affinity flow', formula: 'Q = Q_rated x s', value: r2(flow), unit: 'm3/h' },
      { step: 3, name: 'Affinity head', formula: 'H = H_rated x s^2', value: r2(head), unit: 'm' },
      { step: 4, name: 'Hydraulic power', formula: 'P = rho g Q H / 1000', value: r2(hydraulicKw), unit: 'kW' },
      { step: 5, name: 'Shaft power', formula: 'P_shaft = P / eta', value: r2(shaftKw), unit: 'kW' },
    ],
    correlation: 'Pump affinity laws + hydraulic power (ISO 9906 / API 610)',
    source: 'local-deterministic-replay',
    visual: { kind: 'pump', data: { speedPct, flow: r2(flow), head: r2(head), powerKw: r2(shaftKw), density } },
  };
}

// --- Compressors -----------------------------------------------------------

async function compressor(record: EquipmentRecord, o: Overrides): Promise<EquipmentSimResult> {
  const b = base(record, 'compressor');
  const isHydrogen = (record.service ?? '').toLowerCase().includes('hydrogen');
  const suctionPressureBar = pick(o, 'suctionPressureBar', undefined, 1.0);
  const dischargePressureBar = pick(o, 'dischargePressureBar', num(record, 'dischargePressureBar'), 8);
  const suctionTempC = pick(o, 'suctionTemperatureC', undefined, 35);
  const speedPct = pick(o, 'speedPercent', undefined, 100);
  const gasDensity = isHydrogen ? 0.09 : 1.2;
  const flowM3Hr = (num(record, 'flowM3Hr') ?? 1000) * (speedPct / 100);
  const massFlowKgs = (flowM3Hr * gasDensity) / 3600;
  const efficiency = (num(record, 'efficiency') ?? 82) / 100;

  const result = await computeCompressor({
    fluid: isHydrogen ? 'Hydrogen' : 'Air',
    suctionPressureBar,
    dischargePressureBar,
    suctionTemperatureC: suctionTempC,
    massFlowKgs: r4(massFlowKgs),
    efficiency,
  });

  const outlet = result.steps.find((s) => /outlet temperature/i.test(s.name));
  const head = result.steps.find((s) => /head/i.test(s.name));
  const pr = result.steps.find((s) => /pressure ratio/i.test(s.name));

  if (record.powerKW && result.result.value > record.powerKW * 1.05) {
    b.warnings.push(`Shaft power ${result.result.value.toFixed(0)} kW exceeds rated ${record.powerKW} kW`);
  }
  if (outlet && outlet.value - 273.15 > 150) {
    b.warnings.push(`Outlet temperature ${(outlet.value - 273.15).toFixed(0)} C is high for standard seals`);
  }

  return {
    ...b,
    inputs: {
      suctionPressureBar,
      dischargePressureBar,
      suctionTemperatureC: suctionTempC,
      speedPercent: speedPct,
      massFlowKgs: r4(massFlowKgs),
      efficiency,
    },
    outputs: [
      { name: 'Mass flow', value: r4(massFlowKgs), unit: 'kg/s' },
      { name: 'Pressure ratio', value: pr?.value ?? r2(dischargePressureBar / suctionPressureBar), unit: '-' },
      { name: 'Isentropic head', value: head?.value ?? 0, unit: 'J/kg' },
      { name: 'Outlet temperature', value: r2((outlet?.value ?? 0) - 273.15), unit: 'C' },
      { name: 'Shaft power', value: result.result.value, unit: 'kW' },
    ],
    steps: result.steps.map((s) => ({ step: s.step, name: s.name, formula: s.formula, value: s.value, unit: s.unit, ...(s.notes ? { notes: s.notes } : {}) })),
    correlation: result.correlation,
    source: result.source,
    visual: {
      kind: 'compressor',
      data: {
        speedPct,
        pressureRatio: pr?.value ?? r2(dischargePressureBar / suctionPressureBar),
        outletTempC: r2((outlet?.value ?? 0) - 273.15),
        powerKw: result.result.value,
      },
    },
  };
}

// --- Blowers ---------------------------------------------------------------

function blower(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'blower');
  const speedPct = pick(o, 'speedPercent', undefined, 100);
  const flow = (num(record, 'flowM3Hr') ?? 1000) * (speedPct / 100);
  const riseBar = pick(o, 'pressureRiseBar', num(record, 'pressureRiseBar'), 1.0);
  const efficiency = pick(o, 'efficiency', undefined, 0.72);
  const powerKw = ((flow / 3600) * (riseBar * 1e5)) / efficiency / 1000;

  if (record.powerKW && powerKw > record.powerKW * 1.05) {
    b.warnings.push(`Required ${powerKw.toFixed(0)} kW exceeds installed ${record.powerKW} kW`);
  }

  return {
    ...b,
    inputs: { speedPercent: speedPct, pressureRiseBar: riseBar, efficiency },
    outputs: [
      { name: 'Flow', value: r2(flow), unit: 'm3/h' },
      { name: 'Pressure rise', value: riseBar, unit: 'bar' },
      { name: 'Shaft power', value: r2(powerKw), unit: 'kW', formula: 'P = Q dp / eta' },
    ],
    steps: [
      { step: 1, name: 'Flow', formula: 'Q = Q_rated x (N/N_rated)', value: r2(flow), unit: 'm3/h' },
      { step: 2, name: 'Shaft power', formula: 'P = (Q/3600) x dp / eta', value: r2(powerKw), unit: 'kW' },
    ],
    correlation: 'Fan/blower power law (P = Q dp / eta)',
    source: 'local-deterministic-replay',
    visual: { kind: 'blower', data: { speedPct, flow: r2(flow), powerKw: r2(powerKw) } },
  };
}

// --- Heat exchangers -------------------------------------------------------

function heatExchanger(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'heat-exchanger');
  const dutyDesign = num(record, 'heatDutyMW') ?? 10;
  const hotIn = num(record, 'inletTempC') ?? 180;
  const hotOut = num(record, 'outletTempC') ?? 95;
  const flowKgs = pick(o, 'hotFlowKgs', undefined, 120);
  const cp = pick(o, 'cpJkgK', undefined, OIL_CP);
  const deltaT = hotIn - hotOut;
  const dutyMw = (flowKgs * cp * deltaT) / 1e6;
  const coldIn = 30;
  const coldOut = 70;
  const lmtd = ((hotIn - coldOut) - (hotOut - coldIn)) / Math.log((hotIn - coldOut) / (hotOut - coldIn));
  const uaWk = lmtd > 0 ? (dutyMw * 1e6) / lmtd / 1000 : 0;
  const tubes = num(record, 'tubeCount');
  const flux = tubes ? dutyMw / tubes : undefined;

  if (dutyMw > dutyDesign * 1.15) {
    b.warnings.push(`Duty ${dutyMw.toFixed(1)} MW exceeds design ${dutyDesign} MW - fouling/overload risk`);
  }

  return {
    ...b,
    inputs: { hotFlowKgs: flowKgs, cpJkgK: cp, hotInletC: hotIn, hotOutletC: hotOut },
    outputs: [
      { name: 'Heat duty', value: r3(dutyMw), unit: 'MW', formula: 'Q = mdot cp dT' },
      { name: 'LMTD', value: r2(lmtd), unit: 'K' },
      { name: 'UA (overall)', value: r1(uaWk), unit: 'kW/K', formula: 'UA = Q / LMTD' },
      ...(flux !== undefined ? [{ name: 'Duty per tube', value: r3(flux * 1000), unit: 'kW/tube' }] : []),
      { name: 'Design margin', value: r1(((dutyDesign - dutyMw) / dutyDesign) * 100), unit: '%' },
    ],
    steps: [
      { step: 1, name: 'Temperature drop', formula: 'dT = T_in - T_out', value: r1(deltaT), unit: 'K' },
      { step: 2, name: 'Heat duty', formula: 'Q = mdot cp dT', value: r3(dutyMw), unit: 'MW' },
      { step: 3, name: 'LMTD', formula: 'LMTD = (dT1 - dT2)/ln(dT1/dT2)', value: r2(lmtd), unit: 'K' },
      { step: 4, name: 'Overall UA', formula: 'UA = Q / LMTD', value: r1(uaWk), unit: 'kW/K' },
    ],
    correlation: 'Steady-state energy balance + LMTD (TEMA / Kern)',
    source: 'local-deterministic-replay',
    visual: { kind: 'heat-exchanger', data: { hotIn, hotOut, dutyMw: r3(dutyMw), lmtd: r2(lmtd) } },
  };
}

// --- Valves ----------------------------------------------------------------

async function valve(record: EquipmentRecord, o: Overrides): Promise<EquipmentSimResult> {
  const b = base(record, 'valve');
  const flowRateM3h = pick(o, 'flowRateM3h', num(record, 'flowM3Hr'), 180);
  const deltaPBar = pick(o, 'deltaPBar', undefined, 2.5);
  const sg = pick(o, 'specificGravity', undefined, 0.85);

  const isRelief = (record.equipmentType ?? '').toLowerCase().includes('relief');
  const ratedCv = num(record, 'cv') ?? (num(record, 'sizeInch') ?? 6) * 60;

  const result = await computeValve({ flowRateM3h, deltaPBar, specificGravity: sg });
  const requiredCv = result.result.value;
  const opening = Math.min(100, (requiredCv / ratedCv) * 100);

  if (!isRelief) {
    if (requiredCv > ratedCv) b.warnings.push('Required Cv exceeds rated valve capacity - valve will be wide open / undersized');
    if (opening < 10) b.warnings.push('Opening below 10% - poor control resolution');
    if (opening > 90) b.warnings.push('Opening above 90% - limited range for control');
  }

  const outputs: SimOutput[] = [
    { name: 'Required Cv', value: requiredCv, unit: 'Cv', formula: 'Cv = Q sqrt(SG/dp)' },
    { name: 'Rated Cv', value: r1(ratedCv), unit: 'Cv' },
    { name: 'Travel / opening', value: r1(opening), unit: '%' },
    { name: 'Pressure drop', value: deltaPBar, unit: 'bar' },
  ];
  if (isRelief) {
    const rho = sg * 1000;
    const areaMm2 = ((flowRateM3h / 3600) * 1e6) / (38 * 0.65 * Math.sqrt((2 * deltaPBar * 1e5) / rho));
    outputs.push({ name: 'Required orifice area', value: r1(areaMm2), unit: 'mm2', formula: 'API 520 liquid sizing' });
  }

  return {
    ...b,
    inputs: { flowRateM3h, deltaPBar, specificGravity: sg, ratedCv: r1(ratedCv) },
    outputs,
    steps: result.steps.map((s) => ({ step: s.step, name: s.name, formula: s.formula, value: s.value, unit: s.unit, ...(s.notes ? { notes: s.notes } : {}) })),
    correlation: isRelief ? 'API 520 relief sizing + ISA-75.01' : result.correlation,
    source: result.source,
    visual: { kind: 'valve', data: { opening: r1(opening), requiredCv, ratedCv: r1(ratedCv), deltaPBar } },
  };
}

// --- Turbines --------------------------------------------------------------

function turbine(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'turbine');
  const powerMw = num(record, 'powerMW') ?? 10;
  const efficiency = (num(record, 'efficiency') ?? 82) / 100;
  const steamIn = num(record, 'steamTempC') ?? 400;
  const steamPressure = num(record, 'steamPressureBar') ?? 48;
  const enthalpyDrop = pick(o, 'enthalpyDropKJkg', undefined, 620);
  const loadPct = pick(o, 'loadPercent', undefined, 100);

  const power = powerMw * (loadPct / 100);
  const steamFlowKgs = (power * 1000) / (enthalpyDrop * efficiency);
  const specificConsumption = steamFlowKgs / (power || 1) * 1;

  return {
    ...b,
    inputs: { loadPercent: loadPct, enthalpyDropKJkg: enthalpyDrop, efficiency, steamPressureBar: steamPressure, steamTempC: steamIn },
    outputs: [
      { name: 'Shaft power', value: r2(power), unit: 'MW', formula: 'P = mdot x dh x eta' },
      { name: 'Steam mass flow', value: r2(steamFlowKgs), unit: 'kg/s', formula: 'mdot = P / (dh eta)' },
      { name: 'Specific steam consumption', value: r2(specificConsumption), unit: 'kg/kWh' },
    ],
    steps: [
      { step: 1, name: 'Available enthalpy drop', formula: 'dh_isen = h1 - h2s', value: enthalpyDrop, unit: 'kJ/kg' },
      { step: 2, name: 'Actual work', formula: 'dh_act = dh_isen x eta', value: r1(enthalpyDrop * efficiency), unit: 'kJ/kg' },
      { step: 3, name: 'Steam flow', formula: 'mdot = P / dh_act', value: r2(steamFlowKgs), unit: 'kg/s' },
    ],
    correlation: 'Steam turbine isentropic expansion (API 611/612)',
    source: 'local-deterministic-replay',
    visual: { kind: 'turbine', data: { loadPct, powerMw: r2(power), steamFlowKgs: r2(steamFlowKgs), rpm: record.rpm ?? 6000 } },
  };
}

// --- Boilers & furnaces ----------------------------------------------------

function boiler(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'boiler');
  const capacityTph = num(record, 'steamCapacityTPH') ?? 100;
  const loadPct = pick(o, 'loadPercent', undefined, 85);
  const efficiency = pick(o, 'efficiency', undefined, 0.88);
  const steamEnthalpy = 2790;
  const feedwaterEnthalpy = 440;
  const lhv = record.fuel === 'Natural Gas' ? 50000 : 45000;
  const steamKgh = (capacityTph * 1000 * loadPct) / 100;
  const fuelKgh = (steamKgh * (steamEnthalpy - feedwaterEnthalpy)) / (lhv * efficiency);
  const thermalMw = (fuelKgh * lhv) / 3600 / 1000;

  return {
    ...b,
    inputs: { loadPercent: loadPct, efficiency, fuel: record.fuel ?? 'Natural Gas' },
    outputs: [
      { name: 'Steam output', value: r1(steamKgh / 1000), unit: 't/h' },
      { name: 'Fuel consumption', value: r0(fuelKgh), unit: 'kg/h', formula: 'mdot_fuel = mdot_steam(h_s - h_fw)/(LHV eta)' },
      { name: 'Thermal input', value: r2(thermalMw), unit: 'MW' },
    ],
    steps: [
      { step: 1, name: 'Steam enthalpy rise', formula: 'dh = h_steam - h_feedwater', value: steamEnthalpy - feedwaterEnthalpy, unit: 'kJ/kg' },
      { step: 2, name: 'Fuel mass flow', formula: 'mdot_fuel = mdot_steam dh / (LHV eta)', value: r0(fuelKgh), unit: 'kg/h' },
      { step: 3, name: 'Thermal input', formula: 'Q = mdot_fuel x LHV', value: r2(thermalMw), unit: 'MW' },
    ],
    correlation: 'Boiler energy balance (ASME PTC 4)',
    source: 'local-deterministic-replay',
    visual: { kind: 'boiler', data: { loadPct, steamTph: r1(steamKgh / 1000), fuelKgh: r0(fuelKgh) } },
  };
}

function furnace(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'furnace');
  const dutyMw = num(record, 'heatDutyMW') ?? 30;
  const efficiency = pick(o, 'efficiency', undefined, 0.85);
  const lhv = record.fuel === 'Refinery Gas' ? 45000 : 50000;
  const fuelKgh = (dutyMw * 1e6) / (lhv * efficiency);
  const outlet = num(record, 'outletTemperatureC') ?? 390;

  return {
    ...b,
    inputs: { dutyMW: dutyMw, efficiency, fuel: record.fuel ?? 'Refinery Gas' },
    outputs: [
      { name: 'Heat duty', value: dutyMw, unit: 'MW' },
      { name: 'Fuel consumption', value: r0(fuelKgh), unit: 'kg/h' },
      { name: 'Outlet temperature', value: outlet, unit: 'C' },
    ],
    steps: [{ step: 1, name: 'Fuel flow', formula: 'mdot_fuel = Q / (LHV x eta)', value: r0(fuelKgh), unit: 'kg/h' }],
    correlation: 'Furnace heat balance (API 560)',
    source: 'local-deterministic-replay',
    visual: { kind: 'furnace', data: { dutyMW: dutyMw, fuelKgh: r0(fuelKgh), outletTempC: outlet } },
  };
}

// --- Static equipment ------------------------------------------------------

function vessel(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'vessel');
  const volume = num(record, 'volumeM3') ?? 50;
  const pressure = pick(o, 'internalPressureBar', num(record, 'designPressureBar'), 20);
  const allowable = 138;
  const jointEff = 1.0;
  const corrosion = 3.0;
  const diameter = Math.cbrt((4 * volume) / (3 * Math.PI));
  const radiusMm = (diameter / 2) * 1000;
  const minThickness = (pressure * 10 * radiusMm) / (allowable * jointEff - 0.6 * pressure * 10) + corrosion;
  const providedThickness = pick(o, 'shellThicknessMm', undefined, Math.ceil(minThickness) + 2);
  const hoopStress = (pressure * 10 * (radiusMm + providedThickness / 2)) / providedThickness;
  const utilization = hoopStress / allowable;

  if (utilization > 0.9) b.warnings.push(`Hoop stress utilization ${(utilization * 100).toFixed(0)}% - reduce pressure or increase wall`);
  if (providedThickness < minThickness) b.warnings.push('Provided wall below ASME VIII Div.1 minimum + corrosion allowance');

  return {
    ...b,
    inputs: {
      internalPressureBar: pressure,
      designPressureBar: num(record, 'designPressureBar') ?? 0,
      shellThicknessMm: providedThickness,
    },
    outputs: [
      { name: 'Estimated shell diameter', value: r2(diameter), unit: 'm' },
      { name: 'Min. wall thickness (ASME)', value: r2(minThickness), unit: 'mm', formula: 't = PR/(SE - 0.6P) + CA' },
      { name: 'Provided thickness', value: providedThickness, unit: 'mm' },
      { name: 'Hoop stress', value: r1(hoopStress), unit: 'MPa' },
      { name: 'Allowable stress utilization', value: r1(utilization * 100), unit: '%' },
    ],
    steps: [
      { step: 1, name: 'Shell diameter from volume', formula: 'V ~ 3 pi D^3/4', value: r2(diameter), unit: 'm' },
      { step: 2, name: 'Minimum thickness', formula: 't = P R / (S E - 0.6 P) + CA', value: r2(minThickness), unit: 'mm' },
      { step: 3, name: 'Hoop stress', formula: 'sigma = P R / t', value: r1(hoopStress), unit: 'MPa' },
    ],
    correlation: 'ASME BPVC Section VIII Div.1 (UG-27)',
    source: 'local-deterministic-replay',
    visual: { kind: 'vessel', data: { pressure, utilization: r1(utilization * 100), diameter: r2(diameter) } },
  };
}

function tank(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'tank');
  const d = num(record, 'diameterM') ?? 30;
  const h = num(record, 'heightM') ?? 15;
  const fillPct = pick(o, 'fillPercent', undefined, 65);
  const consumption = pick(o, 'consumptionM3Day', undefined, 800);
  const geometric = (Math.PI / 4) * d * d * h;
  const level = (h * fillPct) / 100;
  const stored = (Math.PI / 4) * d * d * level;
  const days = consumption > 0 ? stored / consumption : 0;

  if (fillPct > 90) b.warnings.push('Fill above 90% - overfill protection zone');

  return {
    ...b,
    inputs: { diameterM: d, heightM: h, fillPercent: fillPct, consumptionM3Day: consumption },
    outputs: [
      { name: 'Geometric volume', value: r0(geometric), unit: 'm3' },
      { name: 'Liquid level', value: r2(level), unit: 'm' },
      { name: 'Stored volume', value: r0(stored), unit: 'm3' },
      { name: 'Inventory days', value: r1(days), unit: 'days', formula: 'days = V_stored / consumption' },
    ],
    steps: [
      { step: 1, name: 'Cylindrical volume', formula: 'V = pi D^2 H / 4', value: r0(geometric), unit: 'm3' },
      { step: 2, name: 'Level at fill', formula: 'L = H x fill%', value: r2(level), unit: 'm' },
      { step: 3, name: 'Stored volume', formula: 'V_s = pi D^2 L / 4', value: r0(stored), unit: 'm3' },
    ],
    correlation: 'API 650 tank geometry & inventory',
    source: 'local-deterministic-replay',
    visual: { kind: 'tank', data: { fillPercent: fillPct, level: r2(level), stored: r0(stored) } },
  };
}

function coolingTower(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'cooling-tower');
  const capacityMw = num(record, 'coolingCapacityMW') ?? 40;
  const waterFlow = num(record, 'waterFlowM3Hr') ?? 4000;
  const loadPct = pick(o, 'loadPercent', undefined, 100);
  const duty = (capacityMw * loadPct) / 100;
  const mdot = (waterFlow * 1000) / 3600;
  const range = (duty * 1e6) / (mdot * WATER_CP);
  const evaporation = (waterFlow * 0.015 * range) / 10;

  return {
    ...b,
    inputs: { loadPercent: loadPct, waterFlowM3Hr: waterFlow },
    outputs: [
      { name: 'Heat rejection', value: r2(duty), unit: 'MW' },
      { name: 'Cooling range', value: r2(range), unit: 'K', formula: 'dT = Q / (mdot cp)' },
      { name: 'Evaporation loss', value: r1(evaporation), unit: 'm3/h' },
    ],
    steps: [
      { step: 1, name: 'Water mass flow', formula: 'mdot = Q_vol x rho / 3600', value: r1(mdot), unit: 'kg/s' },
      { step: 2, name: 'Cooling range', formula: 'dT = Q / (mdot cp)', value: r2(range), unit: 'K' },
    ],
    correlation: 'Cooling tower heat balance (CTI ATC-105)',
    source: 'local-deterministic-replay',
    visual: { kind: 'cooling-tower', data: { loadPct, range: r2(range), duty: r2(duty) } },
  };
}

function column(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'column');
  const d = num(record, 'diameterM') ?? 4;
  const h = num(record, 'heightM') ?? 40;
  const trays = num(record, 'trayCount') ?? 40;
  const vaporFlow = pick(o, 'vaporFlowM3Hr', undefined, 30000);
  const area = (Math.PI / 4) * d * d;
  const volume = area * h;
  const hetp = h / trays;
  const velocity = vaporFlow / 3600 / area;
  const flood = (velocity / 1.5) * 100;

  if (flood > 85) b.warnings.push(`Vapour velocity ${velocity.toFixed(2)} m/s near flooding (${flood.toFixed(0)}% of design)`);

  return {
    ...b,
    inputs: { diameterM: d, heightM: h, trayCount: trays, vaporFlowM3Hr: vaporFlow },
    outputs: [
      { name: 'Internal volume', value: r0(volume), unit: 'm3' },
      { name: 'HETP', value: r2(hetp), unit: 'm/tray' },
      { name: 'Vapour velocity', value: r3(velocity), unit: 'm/s' },
      { name: 'Flooding approach', value: r1(flood), unit: '%' },
    ],
    steps: [
      { step: 1, name: 'Column area', formula: 'A = pi D^2/4', value: r2(area), unit: 'm2' },
      { step: 2, name: 'HETP', formula: 'HETP = H / N_trays', value: r2(hetp), unit: 'm' },
      { step: 3, name: 'Vapour velocity', formula: 'u = Q_v / (3600 A)', value: r3(velocity), unit: 'm/s' },
    ],
    correlation: 'Distillation hydraulics (Fair flooding correlation)',
    source: 'local-deterministic-replay',
    visual: { kind: 'column', data: { velocity: r3(velocity), flood: r1(flood), trays } },
  };
}

function reactor(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'reactor');
  const volume = num(record, 'volumeM3') ?? 80;
  const feed = pick(o, 'feedFlowM3Hr', undefined, 220);
  const lhsv = feed / volume;
  const residenceMin = (volume / feed) * 60;
  const pressure = num(record, 'operatingPressureBar') ?? 60;
  const temp = num(record, 'operatingTemperatureC') ?? 350;

  if (lhsv > 3) b.warnings.push(`LHSV ${lhsv.toFixed(2)} 1/h is high for hydrotreating service`);

  return {
    ...b,
    inputs: { volumeM3: volume, feedFlowM3Hr: feed, operatingPressureBar: pressure, operatingTemperatureC: temp },
    outputs: [
      { name: 'LHSV', value: r2(lhsv), unit: '1/h', formula: 'LHSV = Q_feed / V_reactor' },
      { name: 'Residence time', value: r1(residenceMin), unit: 'min' },
      { name: 'Operating pressure', value: pressure, unit: 'bar' },
      { name: 'Operating temperature', value: temp, unit: 'C' },
    ],
    steps: [
      { step: 1, name: 'Space velocity', formula: 'LHSV = Q / V', value: r2(lhsv), unit: '1/h' },
      { step: 2, name: 'Residence time', formula: 'tau = V / Q', value: r1(residenceMin), unit: 'min' },
    ],
    correlation: 'Catalytic reactor space velocity (LHSV/WHSV)',
    source: 'local-deterministic-replay',
    visual: { kind: 'reactor', data: { lhsv: r2(lhsv), residenceMin: r1(residenceMin), temp } },
  };
}

// --- Electrical ------------------------------------------------------------

function motor(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'motor');
  const rated = num(record, 'powerKW') ?? 100;
  const loadPct = pick(o, 'loadPercent', undefined, 80);
  const efficiency = (num(record, 'efficiency') ?? 95) / 100;
  const voltageKv = num(record, 'voltageKV') ?? 6.6;
  const pf = pick(o, 'powerFactor', undefined, 0.88);
  const rpm = num(record, 'rpm') ?? 2980;
  const syncRpm = 3000;

  const shaftKw = (rated * loadPct) / 100;
  const inputKw = shaftKw / efficiency;
  const current = (inputKw * 1000) / (Math.sqrt(3) * voltageKv * 1000 * pf);
  const lossesKw = inputKw - shaftKw;
  const slip = ((syncRpm - rpm) / syncRpm) * 100;

  return {
    ...b,
    inputs: { loadPercent: loadPct, ratedPowerKW: rated, voltageKV: voltageKv, powerFactor: pf },
    outputs: [
      { name: 'Shaft power', value: r1(shaftKw), unit: 'kW' },
      { name: 'Electrical input', value: r1(inputKw), unit: 'kW', formula: 'P_in = P_shaft / eta' },
      { name: 'Line current', value: r1(current), unit: 'A', formula: 'I = P / (sqrt(3) V PF)' },
      { name: 'Losses', value: r2(lossesKw), unit: 'kW' },
      { name: 'Slip', value: r2(slip), unit: '%' },
    ],
    steps: [
      { step: 1, name: 'Shaft power', formula: 'P = P_rated x load%', value: r1(shaftKw), unit: 'kW' },
      { step: 2, name: 'Input power', formula: 'P_in = P / eta', value: r1(inputKw), unit: 'kW' },
      { step: 3, name: 'Line current', formula: 'I = P_in / (sqrt(3) V PF)', value: r1(current), unit: 'A' },
    ],
    correlation: 'Induction motor power/current (IEC 60034)',
    source: 'local-deterministic-replay',
    visual: { kind: 'motor', data: { loadPct, current: r1(current), rpm, slip: r2(slip) } },
  };
}

function transformer(record: EquipmentRecord, o: Overrides): EquipmentSimResult {
  const b = base(record, 'transformer');
  const mva = num(record, 'ratingMVA') ?? 20;
  const loadPct = pick(o, 'loadPercent', undefined, 75);
  const v1 = num(record, 'primaryKV') ?? 33;
  const v2 = num(record, 'secondaryKV') ?? 6.6;
  const loading = (mva * loadPct) / 100;
  const i1 = (loading * 1e6) / (Math.sqrt(3) * v1 * 1000);
  const i2 = (loading * 1e6) / (Math.sqrt(3) * v2 * 1000);

  if (loadPct > 90) b.warnings.push('Transformer loading above 90% - thermal limit proximity');

  return {
    ...b,
    inputs: { loadPercent: loadPct, ratingMVA: mva, primaryKV: v1, secondaryKV: v2 },
    outputs: [
      { name: 'Loading', value: r2(loading), unit: 'MVA' },
      { name: 'Primary current', value: r0(i1), unit: 'A', formula: 'I = S / (sqrt(3) V)' },
      { name: 'Secondary current', value: r0(i2), unit: 'A', formula: 'I = S / (sqrt(3) V)' },
    ],
    steps: [
      { step: 1, name: 'Loading', formula: 'S = S_rated x load%', value: r2(loading), unit: 'MVA' },
      { step: 2, name: 'Primary current', formula: 'I1 = S / (sqrt(3) V1)', value: r0(i1), unit: 'A' },
      { step: 3, name: 'Secondary current', formula: 'I2 = S / (sqrt(3) V2)', value: r0(i2), unit: 'A' },
    ],
    correlation: 'Transformer apparent power & current (IEC 60076)',
    source: 'local-deterministic-replay',
    visual: { kind: 'transformer', data: { loadPct, primaryA: r0(i1), secondaryA: r0(i2) } },
  };
}

// --- helpers ---------------------------------------------------------------

function r0(n: number): number {
  return Math.round(n);
}
function r1(n: number): number {
  return Number(n.toFixed(1));
}
function r2(n: number): number {
  return Number(n.toFixed(2));
}
function r3(n: number): number {
  return Number(n.toFixed(3));
}
function r4(n: number): number {
  return Number(n.toFixed(4));
}
