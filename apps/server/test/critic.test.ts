import { describe, it, expect } from 'vitest';
import {
  DeterministicCritic,
  evaluateSeededCorpus,
  createBaseCorpusFixture,
} from '../src/critic/index.js';
import {
  AuditChain,
  ModeStateMachine,
  projectSovereigntyDashboard,
  RbacEvaluator,
  generateEd25519KeyPair,
} from '@outskirts/sovereignty';
import { PluginHost, admitPlugin, createPipeCalcPlugin } from '@outskirts/plugin-sdk';

describe('Phase P2: Deterministic Critic, RBAC, and Sovereignty Dashboard', () => {
  const keyPair = generateEd25519KeyPair();
  const keyId = 'test-critic-key-01';

  // Stand up PluginHost for C2 calculation replay
  const pluginHost = new PluginHost();
  const { manifest, handlers } = createPipeCalcPlugin(keyId, keyPair.privateKeyPem);
  const admission = admitPlugin(manifest, { [keyId]: keyPair.publicKeyPem });
  pluginHost.registerPlugin(admission.record, handlers);

  const critic = new DeterministicCritic(pluginHost);

  // ---------------------------------------------------------------------------
  // 1. Seeded Error Corpus Benchmark (100% arithmetic, >= 90% citation)
  // ---------------------------------------------------------------------------
  describe('P2 Exit Criterion: Seeded Error Corpus Benchmark', () => {
    it('catches 100% of seeded arithmetic errors and >= 90% of seeded citation errors', async () => {
      const report = await evaluateSeededCorpus(critic);

      expect(report.arithmeticTested).toBe(20);
      expect(report.arithmeticCaught).toBe(20);
      expect(report.arithmeticCatchRate).toBe(100.0);

      expect(report.citationTested).toBe(20);
      expect(report.citationCaught).toBeGreaterThanOrEqual(18); // >= 90%
      expect(report.citationCatchRate).toBeGreaterThanOrEqual(90.0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Individual C1-C5 Checks
  // ---------------------------------------------------------------------------
  describe('Deterministic Critic Checks (C1–C5)', () => {
    it('C1: catches hallucinated numbers not present in extractions or calculations', async () => {
      const { finding, calcResult, citation, baseDraft } = createBaseCorpusFixture();
      const draftWithHallucination = baseDraft + '\nMeasured burst pressure: 99.5 bar';

      const verdict = await critic.evaluate({
        taskId: 't-c1-test',
        stepId: 's-critic',
        draftText: draftWithHallucination,
        findings: [finding],
        calcResults: [calcResult],
        citations: [citation],
      });

      expect(verdict.gate).toBe('fail');
      expect(verdict.deterministicPass).toBe(false);
      const c1 = verdict.verdicts.find((v) => v.check === 'C1_NUMERIC_GROUNDING' && !v.pass);
      expect(c1).toBeDefined();
      expect(c1?.offending).toBe('99.5');
    });

    it('C2: replays calculation and detects diverged result', async () => {
      const { finding, calcResult, citation, baseDraft } = createBaseCorpusFixture();
      // Tamper recorded calc result
      const tamperedCalc = {
        ...calcResult,
        result: { value: 0.9999, unit: 'bar' },
      };

      const verdict = await critic.evaluate({
        taskId: 't-c2-test',
        stepId: 's-critic',
        draftText: baseDraft.replace('0.0435 bar', '0.9999 bar'),
        findings: [finding],
        calcResults: [tamperedCalc],
        citations: [citation],
      });

      expect(verdict.gate).toBe('fail');
      const c2 = verdict.verdicts.find((v) => v.check === 'C2_CALCULATION_REPLAY' && !v.pass);
      expect(c2).toBeDefined();
    });

    it('C5: blocks unacknowledged CRITICAL stale citations at the gate', async () => {
      const { finding, calcResult, citation, baseDraft } = createBaseCorpusFixture();
      const criticalCite = {
        ...citation,
        stateAtCitation: 'CRITICAL' as const,
        decayAtCitation: 0.15,
      };

      // 1. Without acknowledgement -> fails
      const unackedVerdict = await critic.evaluate({
        taskId: 't-c5-unack',
        stepId: 's-critic',
        draftText: baseDraft,
        findings: [finding],
        calcResults: [calcResult],
        citations: [criticalCite],
      });

      expect(unackedVerdict.gate).toBe('fail');
      const c5Fail = unackedVerdict.verdicts.find((v) => v.check === 'C5_FRESHNESS_POLICY');
      expect(c5Fail?.pass).toBe(false);

      // 2. With acknowledgement -> passes
      const ackedCite = {
        ...criticalCite,
        acknowledgedBy: 'senior-engineer-khandelwal',
        acknowledgedAt: new Date().toISOString(),
      };
      const ackedVerdict = await critic.evaluate({
        taskId: 't-c5-ack',
        stepId: 's-critic',
        draftText: baseDraft,
        findings: [finding],
        calcResults: [calcResult],
        citations: [ackedCite],
      });

      const c5Pass = ackedVerdict.verdicts.find((v) => v.check === 'C5_FRESHNESS_POLICY');
      expect(c5Pass?.pass).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Dual-Mode State Machine & Sovereignty Dashboard Projection
  // ---------------------------------------------------------------------------
  describe('Dual Mode & Sovereignty Dashboard', () => {
    it('mode flip is live, audited, and updates dashboard metrics', () => {
      const chain = new AuditChain();
      const sm = new ModeStateMachine('SOVEREIGN');

      expect(sm.mode).toBe('SOVEREIGN');

      // 1. Initial dashboard projection
      const d1 = projectSovereigntyDashboard(chain.getEvents(), chain.getAnchors(), sm.mode);
      expect(d1.currentMode).toBe('SOVEREIGN');
      expect(d1.insidePerimeterPercentage).toBe(100);

      // 2. Flip mode to ASSIST
      const transition = sm.transitionTo(
        'ASSIST',
        'Demonstration of external assistant model',
        'operator-01',
        chain,
        keyId,
        keyPair.privateKeyPem,
      );

      expect(sm.mode).toBe('ASSIST');
      expect(transition.previousMode).toBe('SOVEREIGN');
      expect(transition.currentMode).toBe('ASSIST');
      expect(transition.auditEvent.kind).toBe('mode.transition');
      expect(transition.anchor).toBeDefined();

      // 3. Add simulated inside-perimeter and cache-hit calls
      chain.append('pal.call', {
        locality: 'loopback',
        trustBoundary: 'inside-perimeter',
        tokensIn: 100,
        tokensOut: 50,
        cacheHit: false,
      });
      chain.append('pal.call', {
        locality: 'loopback',
        trustBoundary: 'inside-perimeter',
        tokensIn: 100,
        tokensOut: 50,
        cacheHit: true, // Should be excluded from model call count
      });

      const d2 = projectSovereigntyDashboard(chain.getEvents(), chain.getAnchors(), sm.mode);
      expect(d2.currentMode).toBe('ASSIST');
      expect(d2.totalModelCalls).toBe(1); // cacheHit excluded!
      expect(d2.cacheHits).toBe(1);
      expect(d2.insidePerimeterCalls).toBe(1);
      expect(d2.insidePerimeterPercentage).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Cedar RBAC (Deny-by-default, Audited Refusals)
  // ---------------------------------------------------------------------------
  describe('Cedar RBAC Evaluator', () => {
    it('enforces deny-by-default and audits refusals into the chain', () => {
      const chain = new AuditChain();
      const rbac = new RbacEvaluator();

      // 1. Junior engineer attempting to switch system mode -> REFUSED & AUDITED
      const juniorDecision = rbac.evaluate(
        { userId: 'user-junior-01', role: 'junior' },
        'mode.switch',
        { type: 'system', id: 'global-mode' },
        undefined,
        chain,
      );

      expect(juniorDecision.allowed).toBe(false);
      expect(juniorDecision.reason).toContain('is not permitted to perform "mode.switch"');
      expect(juniorDecision.refusalAuditEvent).toBeDefined();
      expect(juniorDecision.refusalAuditEvent?.kind).toBe('rbac.refusal');

      // 2. Senior engineer switching mode -> PERMITTED
      const seniorDecision = rbac.evaluate(
        { userId: 'user-senior-01', role: 'senior' },
        'mode.switch',
        { type: 'system', id: 'global-mode' },
        undefined,
        chain,
      );

      expect(seniorDecision.allowed).toBe(true);

      // Verify refusal is in the audit chain
      const events = chain.getEvents();
      const refusalEvent = events.find((e) => e.kind === 'rbac.refusal');
      expect(refusalEvent).toBeDefined();
      expect(refusalEvent?.actorId).toBe('user-junior-01');
    });
  });
});
