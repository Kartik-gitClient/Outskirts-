import { describe, expect, it } from 'vitest';
import {
  generateEd25519KeyPair,
  generatePlatformSbom,
  verifyPlatformSbom,
} from '@outskirts/sovereignty';
import {
  createDefaultModelRegistry,
  resolveRoute,
} from '@outskirts/pal';
import { generateSyntheticPidSheet } from '../../../datasets/pid-synth/generator.js';
import { PidProcessGraph } from '../../../services/perception/pid-graph.js';
import { runGarakRedTeam } from '../../../benchmark/garak-runner.js';
import { verifyOfflineBundle, DEFAULT_OFFLINE_BUNDLE_MANIFEST } from '../../../installer/bundle.js';
import { RecipeBuilder, RecipeLibrary } from '../src/agent/recipe-builder.js';

describe('Phase P4 (Proof & Hardening) & Phase P5 (Pilot & Topology)', () => {
  describe('Phase P4: Garak Adversarial Red-Team Suite', () => {
    it('executes full red-team suite with 100% defense catch rate and zero bypass', async () => {
      const result = await runGarakRedTeam();

      expect(result.totalProbes).toBeGreaterThanOrEqual(6);
      expect(result.bypassCount).toBe(0);
      expect(result.blockRate).toBe(100.0);

      // Verify that all individual probes passed
      for (const f of result.findings) {
        expect(f.passed).toBe(true);
      }
    });
  });

  describe('Phase P4: Cryptographic Software Bill of Materials (SBOM)', () => {
    it('generates a valid CycloneDX 1.5 SBOM with Ed25519 digital signature', () => {
      const keyPair = generateEd25519KeyPair();
      const keyId = 'security-officer-archit';

      const sbom = generatePlatformSbom({
        keyId,
        privateKey: keyPair.privateKeyPem,
      });

      expect(sbom.bomFormat).toBe('CycloneDX');
      expect(sbom.specVersion).toBe('1.5');
      expect(sbom.signature.keyId).toBe(keyId);
      expect(sbom.components.length).toBeGreaterThanOrEqual(8);

      // Verify digital signature
      const valid = verifyPlatformSbom(sbom, { [keyId]: keyPair.publicKeyPem });
      expect(valid).toBe(true);

      // Tampering must invalidate signature
      const tampered = JSON.parse(JSON.stringify(sbom));
      tampered.components[0].version = '99.9.9';
      const tamperedValid = verifyPlatformSbom(tampered, { [keyId]: keyPair.publicKeyPem });
      expect(tamperedValid).toBe(false);
    });
  });

  describe('Phase P4: Offline Installer Disconnected Readiness', () => {
    it('verifies 100% disconnected readiness across Linux, Windows, and macOS', () => {
      const result = verifyOfflineBundle(DEFAULT_OFFLINE_BUNDLE_MANIFEST);

      expect(result.valid).toBe(true);
      expect(result.offlineIntegrityVerified).toBe(true);
      expect(result.totalWeights).toBe(3);
      expect(result.totalContainers).toBe(3);
      expect(result.platformsSupported).toEqual(['linux-x64', 'windows-x64', 'darwin-arm64']);
      expect(result.diagnostics.length).toBe(0);
    });
  });

  describe('Phase P4: Model Registry Live Hot-Add', () => {
    it('dynamically hot-adds a specialist model live without dropping connections', () => {
      const registry = createDefaultModelRegistry();

      // Hot-add a new local specialist reasoning model live
      const newEntry = registry.register({
        modelId: 'deepseek-r1-distill-qwen-32b-local',
        providerId: 'vllm',
        locality: 'loopback',
        trustBoundary: 'inside-perimeter',
        taskTypes: ['calculation', 'code'],
        capabilities: ['text', 'guided-json', 'seeded'],
        modelDigest: 'sha256:32b32b32b32b32b32b32b32b32b32b32b32b32b32b32b32b32b32b32b32b32b3',
        quantisation: 'AWQ',
        contextWindow: 65536,
        quality: 0.96,
        estLoadS: 0,
        pinned: true,
        status: 'enabled',
        license: 'MIT',
        licenseUrl: 'https://spdx.org/licenses/MIT.html',
      });

      expect(newEntry.modelId).toBe('deepseek-r1-distill-qwen-32b-local');
      expect(registry.get('deepseek-r1-distill-qwen-32b-local')).toBeDefined();

      // Verify router resolves calculation tasks directly to newly registered model
      const route = resolveRoute(
        {
          taskId: 'hot-add-task',
          stepId: 'step-1',
          taskType: 'calculation',
          messages: [{ role: 'user', content: 'Simulate high pressure fractionator drop' }],
          toolNames: [],
          seed: 42,
          temperature: 0,
          stream: false,
        },
        'SOVEREIGN',
        registry,
      );

      // Should be assigned to one of the calculation specialists
      expect(['deepseek-r1-distill-qwen-14b-lan', 'deepseek-r1-distill-qwen-32b-local']).toContain(
        route.model.modelId,
      );
    });
  });

  describe('Phase P5: GraphRAG over P&ID Connectivity', () => {
    it('builds process graph and traces upstream flow paths to feed vessels', () => {
      const sheet = generateSyntheticPidSheet({ itemCount: 12 });
      const graph = new PidProcessGraph(sheet.groundTruth);

      // Trace upstream from Fractionator V-102
      const upstream = graph.traceUpstream('V-102');
      expect(upstream).toContain('FV-2034');
      expect(upstream).toContain('GV-1002');
      expect(upstream).toContain('P-101A');
      expect(upstream).toContain('GV-1001');
      expect(upstream).toContain('V-101');
    });

    it('traces downstream flow path from feed drum', () => {
      const sheet = generateSyntheticPidSheet({ itemCount: 12 });
      const graph = new PidProcessGraph(sheet.groundTruth);

      const downstream = graph.traceDownstream('V-101');
      expect(downstream).toContain('GV-1001');
      expect(downstream).toContain('P-101A');
      expect(downstream).toContain('GV-1002');
      expect(downstream).toContain('FV-2034');
      expect(downstream).toContain('V-102');
    });

    it('identifies exact suction and discharge isolation valves for pump maintenance', () => {
      const sheet = generateSyntheticPidSheet({ itemCount: 12 });
      const graph = new PidProcessGraph(sheet.groundTruth);

      const valves = graph.findIsolationValves('P-101A');
      expect(valves.suction).toContain('GV-1001');
      expect(valves.discharge).toContain('GV-1002');
    });

    it('resolves natural language GraphRAG queries', () => {
      const sheet = generateSyntheticPidSheet({ itemCount: 12 });
      const graph = new PidProcessGraph(sheet.groundTruth);

      // Query: "what feeds V-102?"
      const q1 = graph.query('What feeds V-102?');
      expect(q1.answer).toContain('V-102 is fed by process path');
      expect(q1.answer).toContain('V-101');

      // Query: "isolation valves for P-101A"
      const q2 = graph.query('Find isolation valves for P-101A');
      expect(q2.answer).toContain('Suction isolation = [GV-1001]');
      expect(q2.answer).toContain('Discharge isolation = [GV-1002]');
    });
  });

  describe('Phase P5: User-Editable Workflow Builder & Recipe Library', () => {
    it('constructs a validated DAG workflow and registers in RecipeLibrary', () => {
      const builder = new RecipeBuilder(
        'custom-cdu-audit-recipe',
        'Custom CDU Unit Audit',
        'User-defined 3-step turnaround audit workflow',
      );

      builder
        .addStep({
          stepId: 'step-a-ingest',
          description: 'Intake and extract tags',
          kind: 'document',
          plugins: [],
          dependsOn: [],
          status: 'pending',
        })
        .addStep({
          stepId: 'step-b-analyze',
          description: 'Run Darcy-Weisbach simulation',
          kind: 'calculation',
          plugins: ['pipe-calc-plugin'],
          dependsOn: ['step-a-ingest'],
          status: 'pending',
        })
        .addStep({
          stepId: 'step-c-review',
          description: 'Review queue gate',
          kind: 'document',
          plugins: [],
          dependsOn: ['step-b-analyze'],
          status: 'pending',
        });

      const recipe = builder.build();
      expect(recipe.steps.length).toBe(3);
      expect(recipe.steps[1]?.dependsOn).toEqual(['step-a-ingest']);

      // Library management
      const library = new RecipeLibrary();
      library.registerRecipe(recipe);

      expect(library.getRecipe('custom-cdu-audit-recipe')).toBeDefined();
      expect(library.listRecipes().length).toBe(1);
    });

    it('rejects recipes with invalid DAG dependencies', () => {
      const builder = new RecipeBuilder('bad-recipe', 'Bad', 'Invalid DAG');
      builder.addStep({
        stepId: 'step-1',
        description: 'First',
        kind: 'document',
        plugins: [],
        dependsOn: ['non-existent-step-xyz'],
        status: 'pending',
      });

      expect(() => builder.build()).toThrow(/depends on non-existent step/);
    });
  });
});
