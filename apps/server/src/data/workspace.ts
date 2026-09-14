import { EQUIPMENT_CATALOG } from './equipment.js';

export interface ContractRow {
  contractId: string;
  vendor: string;
  department: string;
  scope: string;
  valueInrCr: number;
  startDate: string;
  endDate: string;
  obligations: number;
  status: 'Active' | 'Expiring' | 'Closed';
}

/**
 * Seeded local workspace data standing in for the ERP contract export.
 * Persisted into SQLite on first boot and read back from the DB by the executor,
 * so contract-driven goals query a real local store rather than a constant.
 */
export const CONTRACT_REGISTER: ContractRow[] = [
  { contractId: 'MRPL/2021/ME-0142', vendor: 'Larsen & Toubro', department: 'Mechanical', scope: 'CDU pump overhaul & spares', valueInrCr: 12.4, startDate: '2021-04-01', endDate: '2026-03-31', obligations: 8, status: 'Active' },
  { contractId: 'MRPL/2021/EL-0098', vendor: 'Siemens Energy', department: 'Electrical', scope: 'Substation protection relays', valueInrCr: 7.85, startDate: '2021-07-15', endDate: '2025-07-14', obligations: 5, status: 'Expiring' },
  { contractId: 'MRPL/2022/IN-0210', vendor: 'Emerson Electric', department: 'Instrumentation', scope: 'DCS migration & loop tuning', valueInrCr: 22.1, startDate: '2022-01-10', endDate: '2026-12-31', obligations: 11, status: 'Active' },
  { contractId: 'MRPL/2022/CI-0165', vendor: 'Tata Projects', department: 'Civil', scope: 'Tank farm bunding & drainage', valueInrCr: 9.6, startDate: '2022-05-01', endDate: '2025-04-30', obligations: 6, status: 'Expiring' },
  { contractId: 'MRPL/2023/ME-0277', vendor: 'BHEL', department: 'Mechanical', scope: 'Boiler feed water pump sets', valueInrCr: 18.75, startDate: '2023-02-20', endDate: '2027-02-19', obligations: 9, status: 'Active' },
  { contractId: 'MRPL/2023/SF-0311', vendor: 'Bureau Veritas', department: 'Safety', scope: 'Third-party HSE audits', valueInrCr: 4.3, startDate: '2023-06-01', endDate: '2026-05-31', obligations: 4, status: 'Active' },
  { contractId: 'MRPL/2024/IT-0359', vendor: 'Honeywell', department: 'IT/OT', scope: 'OT network segmentation & SOC', valueInrCr: 15.2, startDate: '2024-01-05', endDate: '2028-01-04', obligations: 12, status: 'Active' },
  { contractId: 'MRPL/2020/ME-0054', vendor: 'Godrej & Boyce', department: 'Mechanical', scope: 'Warehouse racking & cranes', valueInrCr: 3.15, startDate: '2020-09-01', endDate: '2025-08-31', obligations: 3, status: 'Closed' },
];

export const WORKSPACE_DATASETS: Array<{ key: string; payload: unknown }> = [
  { key: 'mrpl-contracts', payload: CONTRACT_REGISTER },
  { key: 'equipment-catalog', payload: EQUIPMENT_CATALOG },
];
