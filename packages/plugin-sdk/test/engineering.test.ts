import { describe, it, expect } from 'vitest';
import {
  PluginHost,
  admitPlugin,
  calculateControlValveCv,
  createValveCalcPlugin,
  EngineeringBridge,
} from '../src/index.js';
import { generateEd25519KeyPair } from '@outskirts/sovereignty';

describe('Engineering Capability Services & Tools', () => {
  const trustedOrgKey = generateEd25519KeyPair();
  const trustedKeyId = 'trusted-org-key-eng';
  const trustedRoots = new Map([[trustedKeyId, trustedOrgKey.publicKeyPem]]);

  describe('ISA-75.01 Control Valve Sizing (calculateControlValveCv)', () => {
    it('calculates valve Cv accurately with intermediate steps and Pint uncertainty', () => {
      // Input: 50 m3/h liquid, 2.5 bar pressure drop, SG = 0.85
      const result = calculateControlValveCv({
        flowRate: { value: 50, unit: 'm**3/h' },
        deltaP: { value: 2.5, unit: 'bar' },
        specificGravity: 0.85,
      });

      expect(result.calcId).toMatch(/^calc-[a-f0-9]+$/);
      expect(result.tool).toBe('control_valve_cv');
      expect(result.correlation).toContain('ISA-75.01.01');
      expect(result.reference).toContain('IEC 60534-2-1');

      // Manual verification:
      // Q_gpm = 50 * 4.40286754 = 220.14 gpm
      // dP_psi = 2.5 * 14.5037738 = 36.26 psi
      // Cv = 220.14 * sqrt(0.85 / 36.26) = 220.14 * sqrt(0.02344) = 220.14 * 0.1531 = 33.70
      expect(result.result.unit).toBe('Cv');
      expect(result.result.value).toBeCloseTo(33.70, 0.5);

      // Pint uncertainty propagation (2.5%)
      expect(result.result.uncertainty).toBeDefined();
      expect(result.result.uncertainty).toBeCloseTo(result.result.value * 0.025, 0.1);

      // Working steps
      expect(result.steps.length).toBe(3);
      expect(result.steps[0]!.expression).toContain('Q_gpm');
      expect(result.steps[1]!.expression).toContain('dP_psi');
      expect(result.steps[2]!.expression).toContain('Cv = Q_gpm * sqrt');

      // Assumptions
      expect(result.assumptions.length).toBeGreaterThanOrEqual(3);
    });

    it('rejects non-positive pressure drop strictly', () => {
      expect(() => {
        calculateControlValveCv({
          flowRate: { value: 10, unit: 'm**3/h' },
          deltaP: { value: 0, unit: 'bar' },
        });
      }).toThrow('Differential pressure must be strictly positive');
    });

    it('flags validity warnings for high pressure drops susceptible to cavitation', () => {
      const res = calculateControlValveCv({
        flowRate: { value: 10, unit: 'gpm' },
        deltaP: { value: 60, unit: 'psi' },
      });
      expect(res.validityWarnings.length).toBeGreaterThan(0);
      expect(res.validityWarnings[0]).toContain('High pressure drop detected');
    });
  });

  describe('Control Valve Plugin Integration', () => {
    it('admits and invokes calculate_valve_cv via PluginHost', async () => {
      const host = new PluginHost();
      const { manifest, handlers } = createValveCalcPlugin(trustedKeyId, trustedOrgKey.privateKeyPem);
      const admission = admitPlugin(manifest, trustedRoots);

      expect(admission.admitted).toBe(true);
      host.registerPlugin(admission.record, handlers);

      const output = (await host.executeTool('control-valve-calc-plugin', 'calculate_valve_cv', {
        flowRate: { value: 100, unit: 'gpm' },
        deltaP: { value: 16, unit: 'psi' },
        specificGravity: 1.0,
      })) as ReturnType<typeof calculateControlValveCv>;

      // Cv = 100 * sqrt(1.0 / 16) = 100 * 0.25 = 25.0
      expect(output.result.value).toBe(25.0);
      expect(output.result.unit).toBe('Cv');
      expect(output.result.uncertainty).toBe(0.63);
    });
  });

  describe('EngineeringBridge', () => {
    it('gracefully performs local deterministic replay when Python container is offline', async () => {
      // Connect to non-existent port to test offline robustness
      const bridge = new EngineeringBridge({
        serviceUrl: 'http://127.0.0.1:59999',
        timeoutMs: 100,
      });

      const health = await bridge.checkHealth();
      expect(health.available).toBe(false);

      // Pipe calculation fallback
      const pipeRes = await bridge.computePipePressureDrop({
        length: { value: 100, unit: 'm' },
        diameter: { value: 0.15, unit: 'm' },
        roughness: { value: 0.000045, unit: 'm' },
        flow: { value: 120, unit: 'm**3/h' },
      });

      expect(pipeRes.source).toBe('local-deterministic-replay');
      expect(pipeRes.result.result.unit).toBe('bar');
      expect(pipeRes.result.result.value).toBeGreaterThan(0);
      expect(pipeRes.result.steps.length).toBe(5);

      // Valve calculation fallback
      const valveRes = await bridge.computeControlValveCv({
        flowRate: { value: 40, unit: 'm**3/h' },
        deltaP: { value: 2.0, unit: 'bar' },
        specificGravity: 0.82,
      });

      expect(valveRes.source).toBe('local-deterministic-replay');
      expect(valveRes.result.result.unit).toBe('Cv');
      expect(valveRes.result.result.value).toBeGreaterThan(0);
    });
  });
});
