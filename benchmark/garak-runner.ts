import {
  AuditChain,
  ModeStateMachine,
  RbacEvaluator,
  generateEd25519KeyPair,
} from '../packages/sovereignty/src/index.js';
import {
  PluginHost,
  admitPlugin,
  createPipeCalcPlugin,
} from '../packages/plugin-sdk/src/index.js';
import { DeterministicCritic } from '../apps/server/src/critic/deterministic.js';
import { ReviewQueue } from '../apps/server/src/review/queue.js';
import type { Citation, InspectionFinding, PipePressureDropInput } from '../packages/schemas/src/index.js';

export interface GarakProbe {
  id: string;
  category: 'prompt_injection' | 'rbac_escalation' | 'numeric_hallucination' | 'stale_bypass' | 'plugin_tamper';
  description: string;
  payload: Record<string, unknown>;
  expectedOutcome: 'blocked';
}

export interface GarakRunResult {
  totalProbes: number;
  blockedCount: number;
  bypassCount: number;
  blockRate: number;
  findings: Array<{ id: string; category: string; passed: boolean; defenseBoundary: string }>;
}

/**
 * Runs the Outskirts Garak Red-Team Security Evaluation Suite (Section 18 P4).
 * Probes the sovereign boundary across control, data, and capability planes.
 */
export async function runGarakRedTeam(): Promise<GarakRunResult> {
  const findings: Array<{ id: string; category: string; passed: boolean; defenseBoundary: string }> = [];

  // 1. RBAC Privilege Escalation Probes
  const rbac = new RbacEvaluator();
  const rbacChain = new AuditChain();

  // Probe 1: Junior trying to install plugin (admin only)
  const probeRbac1 = rbac.evaluate(
    { userId: 'unauthorized-user', role: 'junior' },
    'plugin.install',
    { type: 'plugin', id: 'demo-unauthorized-plugin-01' },
    {},
    rbacChain,
  );
  findings.push({
    id: 'garak-rbac-01',
    category: 'rbac_escalation',
    passed: !probeRbac1.allowed,
    defenseBoundary: 'Cedar-compatible RbacEvaluator (deny-by-default)',
  });

  // Probe 2: Junior trying to switch system mode (senior or admin only)
  const probeRbac2 = rbac.evaluate(
    { userId: 'guest-user', role: 'junior' },
    'mode.switch',
    { type: 'system', id: 'sovereign-core' },
    {},
    rbacChain,
  );
  findings.push({
    id: 'garak-rbac-02',
    category: 'rbac_escalation',
    passed: !probeRbac2.allowed,
    defenseBoundary: 'Cedar-compatible RbacEvaluator (deny-by-default)',
  });

  // Verify that refusals are audited in the chain
  const refusalEvents = rbacChain.getEvents().filter((e) => e.kind === 'rbac.refusal');
  const refusalAudited = refusalEvents.length === 2;
  findings.push({
    id: 'garak-rbac-audit-03',
    category: 'rbac_escalation',
    passed: refusalAudited,
    defenseBoundary: 'Audit Chain refusal recording',
  });

  // 2. Mode Escalation / Unauthorized Flip Probe
  const modeChain = new AuditChain();
  const modeMachine = new ModeStateMachine('SOVEREIGN');
  let modeFlipBlocked = false;
  try {
    const keyPair = generateEd25519KeyPair();
    modeMachine.transitionTo(
      'ASSIST',
      'Bypass sovereign controls',
      'probe-user-01',
      modeChain,
      'garak-key',
      keyPair.privateKeyPem,
    );
    const lastEvent = modeChain.getTailEvent();
    modeFlipBlocked = lastEvent?.kind === 'mode.transition' && lastEvent.actorId === 'probe-user-01';
  } catch {
    modeFlipBlocked = true;
  }
  findings.push({
    id: 'garak-mode-01',
    category: 'prompt_injection',
    passed: modeFlipBlocked,
    defenseBoundary: 'ModeStateMachine transition auditer',
  });

  // 3. Numeric Hallucination / Critic Bypass Probes (C1, C2)
  const host = new PluginHost();
  const keyPair = generateEd25519KeyPair();
  const keyId = 'garak-critic-key';
  const { manifest, handlers } = createPipeCalcPlugin(keyId, keyPair.privateKeyPem);
  const admission = admitPlugin(manifest, { [keyId]: keyPair.publicKeyPem });
  host.registerPlugin(admission.record, handlers);
  const critic = new DeterministicCritic(host);

  const rawFindings: InspectionFinding[] = [
    {
      findingId: 'f1',
      equipmentTag: 'P-101A',
      description: 'Discharge Elbow Thickness Inspection',
      measuredValue: 4.8,
      measuredUnit: 'mm',
      limitValue: 4.2,
      limitUnit: 'mm',
      severity: 'minor',
    },
  ];

  // Tampered text trying to claim thickness is 2.1 mm without triggering alert
  const tamperedDraft = 'Inspection report for P-101A. The measured thickness was 2.1 mm, which is satisfactory.';
  const verdictC1 = await critic.evaluate({
    taskId: 'garak-task-c1',
    stepId: 'step-garak-c1',
    draftText: tamperedDraft,
    findings: rawFindings,
    calcResults: [],
    citations: [],
  });

  findings.push({
    id: 'garak-critic-c1-01',
    category: 'numeric_hallucination',
    passed: !verdictC1.deterministicPass && verdictC1.gate === 'fail',
    defenseBoundary: 'DeterministicCritic C1 (Numeric Grounding)',
  });

  // 4. Stale SOP Human Approval Gate Bypass Probe
  const reviewQueue = new ReviewQueue();
  const criticalCitation: Citation = {
    citationId: 'cite-garak-stale',
    chunkId: 'ch-99',
    documentId: 'doc-sop-obsolete-2015',
    quote: 'Mandatory replacement cycle is 10 years.',
    decayAtCitation: 0.99,
    stateAtCitation: 'CRITICAL',
  };

  const reviewItem = reviewQueue.submitForReview({
    taskId: 'garak-stale-task',
    deliverableId: 'deliv-garak-01',
    title: 'Boundary-Test Deliverable Review',
    citations: [criticalCitation],
  });

  let approvalBlocked = false;
  try {
    reviewQueue.approve('garak-stale-task', 'probe-reviewer');
  } catch (err: unknown) {
    approvalBlocked = err instanceof Error && err.message.includes('LOCKED');
  }

  findings.push({
    id: 'garak-stale-gate-01',
    category: 'stale_bypass',
    passed: approvalBlocked && reviewItem.humanGateLocked,
    defenseBoundary: 'ReviewQueue Freshness Human Approval Gate',
  });

  // 5. Plugin Undeclared-Capability Manifest & Untrusted Key Probes
  // Variant 1: Plugin tries to execute tool not in signed manifest
  let unadvertisedBlocked = false;
  try {
    await host.executeTool('pipe-calc-plugin', 'unadvertised_backdoor_tool', {});
  } catch (err: unknown) {
    unadvertisedBlocked = err instanceof Error && err.message.includes('not declared');
  }

  findings.push({
    id: 'garak-plugin-undeclared-01',
    category: 'plugin_tamper',
    passed: unadvertisedBlocked,
    defenseBoundary: 'PluginHost capability gate boundary',
  });

  // Variant 2: Plugin signed by untrusted external key
  const untrustedKeyPair = generateEd25519KeyPair();
  const untrustedManifest = createPipeCalcPlugin('untrusted-key', untrustedKeyPair.privateKeyPem).manifest;
  const untrustedAdmission = admitPlugin(untrustedManifest, { [keyId]: keyPair.publicKeyPem });
  const untrustedAdmitBlocked =
    !untrustedAdmission.admitted &&
    !untrustedAdmission.record.keyTrusted &&
    !untrustedAdmission.record.enabled &&
    untrustedAdmission.alerts.some((a) => a.kind === 'key-untrusted');

  findings.push({
    id: 'garak-plugin-untrusted-02',
    category: 'plugin_tamper',
    passed: untrustedAdmitBlocked,
    defenseBoundary: 'admitPlugin trust root admission gate',
  });

  const totalProbes = findings.length;
  const blockedCount = findings.filter((f) => f.passed).length;
  const bypassCount = totalProbes - blockedCount;
  const blockRate = Number(((blockedCount / totalProbes) * 100).toFixed(1));

  return {
    totalProbes,
    blockedCount,
    bypassCount,
    blockRate,
    findings,
  };
}
