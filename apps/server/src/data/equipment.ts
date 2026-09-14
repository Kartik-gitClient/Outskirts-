export interface EquipmentRecord {
  id: string;
  tag: string;
  equipmentType: string;
  manufacturer: string;
  model?: string;
  service?: string;
  powerKW?: number;
  powerMW?: number;
  rpm?: number;
  flowM3Hr?: number;
  headM?: number;
  maxPressureBar?: number;
  temperatureRangeC?: number[];
  efficiency?: number;
  sensors?: string[];
  commonFailures?: string[];
  dischargePressureBar?: number;
  heatDutyMW?: number;
  tubeCount?: number;
  shellPressureBar?: number;
  tubePressureBar?: number;
  inletTempC?: number;
  outletTempC?: number;
  steamPressureBar?: number;
  steamTempC?: number;
  steamTemperatureC?: number;
  steamCapacityTPH?: number;
  fuel?: string;
  designPressureBar?: number;
  designTemperatureC?: number;
  volumeM3?: number;
  capacityKL?: number;
  diameterM?: number;
  heightM?: number;
  product?: string;
  sizeInch?: number;
  pressureClass?: number;
  actuator?: string;
  setPressureBar?: number;
  coolingCapacityMW?: number;
  waterFlowM3Hr?: number;
  trayCount?: number;
  operatingPressureBar?: number;
  operatingTemperatureC?: number;
  catalyst?: string;
  outletTemperatureC?: number;
  voltageKV?: number;
  ratingMVA?: number;
  primaryKV?: number;
  secondaryKV?: number;
  cv?: number;
  lineSizeInch?: number;
  pressureRiseBar?: number;
}

export type EquipmentCategory =
  | 'pump'
  | 'compressor'
  | 'blower'
  | 'heat-exchanger'
  | 'turbine'
  | 'boiler'
  | 'vessel'
  | 'tank'
  | 'valve'
  | 'cooling-tower'
  | 'column'
  | 'reactor'
  | 'furnace'
  | 'motor'
  | 'transformer';

export function categoryOf(record: EquipmentRecord): EquipmentCategory {
  const t = record.equipmentType.toLowerCase();
  if (t.includes('pump')) return 'pump';
  if (t.includes('compressor')) return 'compressor';
  if (t.includes('blower')) return 'blower';
  if (t.includes('heat exchanger')) return 'heat-exchanger';
  if (t.includes('turbine')) return 'turbine';
  if (t.includes('boiler')) return 'boiler';
  if (t.includes('vessel')) return 'vessel';
  if (t.includes('tank')) return 'tank';
  if (t.includes('valve')) return 'valve';
  if (t.includes('cooling tower')) return 'cooling-tower';
  if (t.includes('column')) return 'column';
  if (t.includes('reactor')) return 'reactor';
  if (t.includes('furnace')) return 'furnace';
  if (t.includes('motor')) return 'motor';
  if (t.includes('transformer')) return 'transformer';
  return 'vessel';
}

/** Pulled equipment register for the MRPL virtual plant (20 tagged assets). */
export const EQUIPMENT_CATALOG: EquipmentRecord[] = [
  { id: 'EQ-001', tag: 'P-101', equipmentType: 'API 610 Centrifugal Pump', manufacturer: 'KSB', model: 'RPH', service: 'Crude Oil Transfer', powerKW: 250, rpm: 2980, flowM3Hr: 520, headM: 95, maxPressureBar: 19, temperatureRangeC: [-20, 180], efficiency: 88, sensors: ['Vibration', 'Bearing Temperature', 'Flow', 'Pressure', 'Motor Current'], commonFailures: ['Bearing Wear', 'Seal Leakage', 'Cavitation', 'Impeller Damage'] },
  { id: 'EQ-002', tag: 'P-102', equipmentType: 'API 610 Vertical Pump', manufacturer: 'Flowserve', model: 'VTP', service: 'Cooling Water', powerKW: 90, rpm: 1480, flowM3Hr: 720, headM: 42, maxPressureBar: 12, efficiency: 86, sensors: ['Flow', 'Pressure', 'Vibration', 'Motor Current'], commonFailures: ['Bearing Failure', 'Motor Failure', 'Impeller Wear'] },
  { id: 'EQ-003', tag: 'C-101', equipmentType: 'API 617 Centrifugal Compressor', manufacturer: 'Siemens Energy', model: 'STC-SV', service: 'Hydrogen Compression', powerKW: 2200, rpm: 10500, flowM3Hr: 18000, dischargePressureBar: 42, efficiency: 83, sensors: ['Vibration', 'Bearing Temp', 'Pressure', 'Speed', 'Oil Pressure'], commonFailures: ['Seal Leakage', 'Surge', 'Bearing Damage'] },
  { id: 'EQ-004', tag: 'C-102', equipmentType: 'API 617 Process Compressor', manufacturer: 'MAN Energy', service: 'Recycle Gas', powerKW: 3200, rpm: 9200, flowM3Hr: 26000, dischargePressureBar: 55, efficiency: 84 },
  { id: 'EQ-005', tag: 'HX-101', equipmentType: 'Shell & Tube Heat Exchanger', manufacturer: 'Alfa Laval', heatDutyMW: 18, tubeCount: 640, shellPressureBar: 22, tubePressureBar: 25, inletTempC: 180, outletTempC: 95, commonFailures: ['Fouling', 'Tube Leakage', 'Scaling'] },
  { id: 'EQ-006', tag: 'HX-102', equipmentType: 'Plate Heat Exchanger', manufacturer: 'Alfa Laval', heatDutyMW: 8, maxPressureBar: 25, efficiency: 91 },
  { id: 'EQ-007', tag: 'T-101', equipmentType: 'Steam Turbine', manufacturer: 'Siemens', powerMW: 12, rpm: 6000, steamPressureBar: 48, steamTempC: 400, efficiency: 82 },
  { id: 'EQ-008', tag: 'B-101', equipmentType: 'Boiler', manufacturer: 'BHEL', steamCapacityTPH: 120, steamPressureBar: 42, steamTemperatureC: 400, fuel: 'Natural Gas' },
  { id: 'EQ-009', tag: 'V-101', equipmentType: 'Pressure Vessel', manufacturer: 'L&T', designPressureBar: 32, designTemperatureC: 320, volumeM3: 55 },
  { id: 'EQ-010', tag: 'TK-101', equipmentType: 'Storage Tank', manufacturer: 'Tankage India', capacityKL: 50000, diameterM: 42, heightM: 18, product: 'Diesel' },
  { id: 'EQ-011', tag: 'CV-101', equipmentType: 'Control Valve', manufacturer: 'Fisher', sizeInch: 8, pressureClass: 300, actuator: 'Pneumatic' },
  { id: 'EQ-012', tag: 'RV-101', equipmentType: 'Pressure Relief Valve', manufacturer: 'LESER', setPressureBar: 21, sizeInch: 6 },
  { id: 'EQ-013', tag: 'CT-101', equipmentType: 'Cooling Tower', manufacturer: 'Paharpur', coolingCapacityMW: 55, waterFlowM3Hr: 5400 },
  { id: 'EQ-014', tag: 'DC-101', equipmentType: 'Distillation Column', manufacturer: 'L&T', heightM: 46, diameterM: 4.8, trayCount: 48, operatingPressureBar: 3.2 },
  { id: 'EQ-015', tag: 'R-101', equipmentType: 'Hydrotreating Reactor', manufacturer: 'Technip', volumeM3: 82, operatingPressureBar: 65, operatingTemperatureC: 360, catalyst: 'CoMo' },
  { id: 'EQ-016', tag: 'F-101', equipmentType: 'Industrial Furnace', manufacturer: 'John Zink', heatDutyMW: 42, fuel: 'Refinery Gas', outletTemperatureC: 390 },
  { id: 'EQ-017', tag: 'M-101', equipmentType: 'Electric Motor', manufacturer: 'ABB', powerKW: 315, voltageKV: 6.6, rpm: 2980, efficiency: 96 },
  { id: 'EQ-018', tag: 'TR-101', equipmentType: 'Power Transformer', manufacturer: 'Hitachi Energy', ratingMVA: 25, primaryKV: 33, secondaryKV: 6.6 },
  { id: 'EQ-019', tag: 'FCV-101', equipmentType: 'Flow Control Valve', manufacturer: 'Emerson Fisher', cv: 620, lineSizeInch: 10, pressureClass: 600 },
  { id: 'EQ-020', tag: 'PG-101', equipmentType: 'Process Gas Blower', manufacturer: 'Atlas Copco', powerKW: 480, flowM3Hr: 9000, pressureRiseBar: 1.8 },
];
