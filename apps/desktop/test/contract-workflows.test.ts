import { describe, expect, it } from 'vitest';
import { matchEnterpriseWorkflow } from '../src/store/slices/contractWorkflows.js';
import { useAppStore } from '../src/store/index.js';

describe('Enterprise Workflows: 11 Production Enterprise Scenarios', () => {
  const taskId = 'task-enterprise-test';
  const model = 'deepseek-r1-distill-qwen-7b';

  it('Workflow 1: 5-Year MRPL Contract Master Register (.xlsx)', () => {
    const wf = matchEnterpriseWorkflow('make an excel sheet of data of mrpl contracts from last 5 years', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('spreadsheet');
    expect(wf?.artifactType).toBe('xlsx');
    expect(wf?.spreadsheet).toBeDefined();
    expect(wf?.spreadsheet?.rows.length).toBe(7);
    expect(wf?.spreadsheet?.headers).toContain('Contract Ref');
    expect(wf?.spreadsheet?.headers).toContain('Value (Cr INR)');
    expect(wf?.planNodes.length).toBe(4);
  });

  it('Workflow 2: Clause-wise Obligation Tracker (.xlsx)', () => {
    const wf = matchEnterpriseWorkflow('Make a clause-wise obligation tracker of all active MRPL maintenance contracts', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('spreadsheet');
    expect(wf?.spreadsheet).toBeDefined();
    expect(wf?.spreadsheet?.headers).toContain('Clause Ref');
    expect(wf?.spreadsheet?.headers).toContain('Penalty Exposure');
    expect(wf?.spreadsheet?.rows.length).toBe(5);
  });

  it('Workflow 3: 180-Day Renewal Alert Calendar', () => {
    const wf = matchEnterpriseWorkflow('Generate a renewal alert calendar of MRPL contracts expiring in the next 180 days', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('spreadsheet');
    expect(wf?.spreadsheet).toBeDefined();
    expect(wf?.spreadsheet?.headers).toContain('Source Doc Hash (SHA-256)');
    expect(wf?.spreadsheet?.headers).toContain('Renewal Note Status');
    expect(wf?.spreadsheet?.rows.some((r) => r.includes('77 Days'))).toBe(true);
  });

  it('Workflow 4: Total Financial Exposure Matrix', () => {
    const wf = matchEnterpriseWorkflow('Calculate the total financial exposure of active MRPL contracts', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('spreadsheet');
    expect(wf?.spreadsheet).toBeDefined();
    expect(wf?.spreadsheet?.headers).toContain('LD Cap (10%)');
    expect(wf?.spreadsheet?.summaryRows?.length).toBeGreaterThan(0);
  });

  it('Workflow 5: 5-Year Vendor Scorecard', () => {
    const wf = matchEnterpriseWorkflow('Make a vendor scorecard from 5 years of MRPL work-order history', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('spreadsheet');
    expect(wf?.spreadsheet).toBeDefined();
    expect(wf?.spreadsheet?.headers).toContain('Composite Score (/100)');
    expect(wf?.spreadsheet?.headers).toContain('Safety Violations');
  });

  it('Workflow 6: Tender Bid Comparison Sheet (Crude Tank Cleaning)', () => {
    const wf = matchEnterpriseWorkflow('Generate a bid comparison sheet for a tender (e.g. crude tank cleaning)', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('spreadsheet');
    expect(wf?.spreadsheet).toBeDefined();
    expect(wf?.spreadsheet?.headers).toContain('Commercial Rank');
    expect(wf?.spreadsheet?.headers).toContain('Award Recommendation');
    expect(wf?.spreadsheet?.rows.some((r) => r.includes('L1 (Lowest Bidder)'))).toBe(true);
  });

  it('Workflow 7: Turnaround Liquidated Damages Calculator', () => {
    const wf = matchEnterpriseWorkflow('Calculate liquidated damages on the delayed CDU turnaround contract', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('calculation');
    expect(wf?.calculation).toBeDefined();
    expect(wf?.calculation?.steps.length).toBe(5);
    expect(wf?.calculation?.citation).toContain('Clause 28.2');
    expect(wf?.calculation?.recommendation).toContain('₹1,59,30,000');
  });

  it('Workflow 8: Standard GCC Contract Deviation Report (Redline Table)', () => {
    const wf = matchEnterpriseWorkflow('Make a deviation report between a draft contract and MRPL standard General Conditions of Contract', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('artifact');
    expect(wf?.deviation).toBeDefined();
    expect(wf?.deviation?.deviations.length).toBe(4);
    expect(wf?.deviation?.deviations[0]?.clause).toContain('Clause 14.1');
  });

  it('Workflow 9: Worksites HSE Safety Compliance Tracker', () => {
    const wf = matchEnterpriseWorkflow('Generate an HSE compliance tracker across all active refinery worksites', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('spreadsheet');
    expect(wf?.spreadsheet).toBeDefined();
    expect(wf?.spreadsheet?.headers).toContain('Compliance Status');
    expect(wf?.spreadsheet?.headers).toContain('Review Queue Action');
    expect(wf?.spreadsheet?.rows.some((r) => r.includes('OVERDUE'))).toBe(true);
  });

  it('Workflow 10: 1-Command Monthly Contract Governance Pack', () => {
    const wf = matchEnterpriseWorkflow('Make a monthly contract governance pack in one command (pptx + docx + xlsx)', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('presentation');
    expect(wf?.governancePack).toBeDefined();
    expect(wf?.governancePack?.pptxDeckTitle).toContain('5 Slides');
    expect(wf?.governancePack?.merkleRoot).toContain('sha256:');
  });

  it('Workflow 11: Pump P-101 NPSH Margin vs Vendor Curve', () => {
    const wf = matchEnterpriseWorkflow('Calculate the NPSH margin for pump P-101 against the vendor curve', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('calculation');
    expect(wf?.calculation).toBeDefined();
    expect(wf?.calculation?.steps.length).toBe(5);
    expect(wf?.calculation?.steps.some((s) => s.formula.includes('10.61 m'))).toBe(true);
    expect(wf?.calculation?.citation).toContain('API 610');
  });

  it('Workflow 12: Turn 1: Compare that with FY 2023-24 (YoY Variance)', () => {
    const wf = matchEnterpriseWorkflow('Compare that with FY 2023-24', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('spreadsheet');
    expect(wf?.spreadsheet).toBeDefined();
    expect(wf?.spreadsheet?.rows.length).toBe(6);
    expect(wf?.spreadsheet?.headers).toContain('Absolute Variance (₹ Cr)');
    expect(wf?.spreadsheet?.headers).toContain('YoY Growth / Variance %');
    expect(wf?.spreadsheet?.summaryRows?.some((s) => s.value.includes('+₹21.00 Cr'))).toBe(true);
  });

  it('Workflow 13: Turn 2: Show the variance as a bar chart (Interactive Micro-Tool)', () => {
    const wf = matchEnterpriseWorkflow('Show the variance as a bar chart', taskId, model);
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('microtool');
    expect(wf?.artifactType).toBe('microtool');
    expect(wf?.microToolHtml).toBeDefined();
    expect(wf?.microToolHtml).toContain('Departmental Budget Variance Visualizer');
    expect(wf?.microToolHtml).toContain('+₹12.5 Cr');
  });

  it('Workflow 14: Raw CSV Purchase Orders August 2025 (Zero Formatting)', () => {
    const wf = matchEnterpriseWorkflow(
      'Give me a raw CSV of all purchase orders issued in August 2025 containing only: PO Number, Vendor, Value, Date. No formatting.',
      taskId,
      model,
    );
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('spreadsheet');
    expect(wf?.artifactContent).toBeDefined();
    expect(wf?.artifactContent).toContain('PO Number,Vendor,Value,Date');
    expect(wf?.artifactContent).toContain('PO/2025/08/011,L&T Heavy Engineering Ltd,45000000,2025-08-04');
    expect(wf?.spreadsheet?.headers).toEqual(['PO Number', 'Vendor', 'Value', 'Date']);
    expect(wf?.spreadsheet?.rows.length).toBe(5);
  });

  it('Workflow 15: T5. Three-Table Multi-Dimensional Risk Exposure Query (3+ Entity JOIN)', () => {
    const wf = matchEnterpriseWorkflow(
      'List all vendors with active contracts AND pending LD deductions AND bank guarantees expiring within 90 days. Show the total net exposure for each vendor.',
      taskId,
      model,
    );
    expect(wf).not.toBeNull();
    expect(wf?.previewTab).toBe('spreadsheet');
    expect(wf?.spreadsheet).toBeDefined();
    expect(wf?.spreadsheet?.headers).toContain('Pending LD Deduction (₹ Cr)');
    expect(wf?.spreadsheet?.headers).toContain('Expiring BG Ref & Bank');
    expect(wf?.spreadsheet?.headers).toContain('Net Exposure / Deficit (₹ Cr)');
    expect(wf?.spreadsheet?.rows.length).toBe(3);
    expect(wf?.spreadsheet?.rows.some((r) => r.includes('Bridge & Roof Co. India Ltd'))).toBe(true);
    expect(wf?.spreadsheet?.rows.some((r) => r.includes('Petron Engineering Construction Ltd'))).toBe(true);
  });

  it('Integrates into submitUserGoal in workbenchSlice', () => {
    const store = useAppStore.getState();
    store.submitUserGoal('make an excel sheet of data of mrpl contracts from last 5 years');
    const state = useAppStore.getState();
    expect(state.previewTab).toBe('spreadsheet');
    expect(state.activeSpreadsheet).toBeDefined();
    expect(state.activeSpreadsheet?.rows.length).toBe(7);
    expect(state.nodes.length).toBe(4);
    expect(state.messages.length).toBeGreaterThan(0);
  });
});
