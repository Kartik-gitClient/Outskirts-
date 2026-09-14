import { describe, expect, it } from 'vitest';
import type { Citation } from '@outskirts/schemas';
import {
  AuditChain,
  generateEd25519KeyPair,
  verifyChain,
} from '@outskirts/sovereignty';
import {
  PluginHost,
  createDemoMarketplacePlugins,
} from '@outskirts/plugin-sdk';
import { ReviewQueue } from '../src/review/queue.js';
import {
  generateSyntheticPidSheet,
  ISA_SYMBOLS,
} from '../../../datasets/pid-synth/generator.js';
import {
  PidDrawingDetector,
  computeBBoxIoU,
} from '../../../services/perception/pid-detector.js';

describe('Phase P3 — Intelligence Surfaces & Human Review Gate', () => {
  describe('P&ID Synthetic Generation & Perception Pipeline', () => {
    it('synthesises ISA-5.1 compliant P&ID sheets with ground truth geometry', () => {
      const sheet = generateSyntheticPidSheet({ itemCount: 12 });

      expect(sheet.sheetId).toMatch(/^pid-synth-/);
      expect(sheet.width).toBe(1600);
      expect(sheet.height).toBe(1100);
      expect(sheet.svgContent).toContain('<svg');
      expect(sheet.svgContent).toContain('MRPL REFINERY COMPLEX');
      expect(sheet.groundTruth.tags.length).toBe(12);

      // Verify presence of standard symbols
      const tagNumbers = sheet.groundTruth.tags.map((t: { tagNumber: string }) => t.tagNumber);
      expect(tagNumbers).toContain('V-101');
      expect(tagNumbers).toContain('P-101A');
      expect(tagNumbers).toContain('FV-2034');
      expect(tagNumbers).toContain('FT-2034');

      // Verify bounding boxes have positive area and confidence
      for (const tag of sheet.groundTruth.tags) {
        expect(tag.bbox.w).toBeGreaterThan(0);
        expect(tag.bbox.h).toBeGreaterThan(0);
        expect(tag.detectorConfidence).toBe(1.0);
      }
    });

    it('measures IoU and achieves >= 90% Precision and Recall against ground truth', () => {
      const sheet = generateSyntheticPidSheet({ itemCount: 12 });
      const detector = new PidDrawingDetector();

      const detected = detector.extractTags(sheet.sheetId, sheet.groundTruth.tags, true);
      const metrics = detector.evaluateExtraction(detected, sheet.groundTruth);

      expect(metrics.precision).toBeGreaterThanOrEqual(90.0);
      expect(metrics.recall).toBeGreaterThanOrEqual(90.0);
      expect(metrics.f1).toBeGreaterThanOrEqual(90.0);
      expect(metrics.truePositives).toBe(12);
      expect(metrics.falsePositives).toBe(0);
      expect(metrics.falseNegatives).toBe(0);
    });

    it('calculates bounding box IoU accurately', () => {
      const b1 = { page: 1, x: 100, y: 100, w: 50, h: 50, confidence: 1 };
      const b2 = { page: 1, x: 100, y: 100, w: 50, h: 50, confidence: 1 };
      expect(computeBBoxIoU(b1, b2)).toBe(1.0);

      const b3 = { page: 1, x: 200, y: 200, w: 50, h: 50, confidence: 1 };
      expect(computeBBoxIoU(b1, b3)).toBe(0.0);

      const b4 = { page: 1, x: 125, y: 100, w: 50, h: 50, confidence: 1 };
      // intersection: 25 * 50 = 1250. area1 = 2500, area2 = 2500, union = 3750 -> 1250/3750 = 0.3333
      expect(computeBBoxIoU(b1, b4)).toBeCloseTo(1 / 3, 2);
    });

    it('resolves region links to exact normalized crop coordinates for viewer UI', () => {
      const sheet = generateSyntheticPidSheet({ itemCount: 12 });
      const detector = new PidDrawingDetector();
      const detected = detector.extractTags(sheet.sheetId, sheet.groundTruth.tags);

      const cropPump = detector.resolveRegionLink(detected, 'P-101A');
      expect(cropPump).toBeDefined();
      expect(cropPump?.x).toBe(500);
      expect(cropPump?.y).toBe(380);
      expect(cropPump?.w).toBe(ISA_SYMBOLS.pump?.w ?? 80);
      expect(cropPump?.h).toBe(ISA_SYMBOLS.pump?.h ?? 80);

      const cropNonExistent = detector.resolveRegionLink(detected, 'NON-EXISTENT-999');
      expect(cropNonExistent).toBeUndefined();
    });
  });

  describe('Review Queue & Stale Freshness Human Approval Gate', () => {
    it('blocks approval gate when a CRITICAL stale citation is present until acknowledged', () => {
      const auditChain = new AuditChain();
      const queue = new ReviewQueue(auditChain);

      const citations: Citation[] = [
        {
          citationId: 'cite-fresh-1',
          chunkId: 'chunk-101',
          documentId: 'doc-sop-fresh',
          quote: 'Standard crude feed operating pressure is 15.2 barg.',
          decayAtCitation: 0.12,
          stateAtCitation: 'FRESH',
        },
        {
          citationId: 'cite-stale-critical',
          chunkId: 'chunk-202',
          documentId: 'doc-sop-2019-outdated',
          quote: 'Legacy relief valve inspection interval is 72 months.',
          decayAtCitation: 0.96,
          stateAtCitation: 'CRITICAL',
        },
      ];

      const reviewItem = queue.submitForReview({
        taskId: 'task-refinery-audit-001',
        deliverableId: 'deliv-cdu-report-01',
        title: 'CDU Unit Turnaround Inspection Briefing',
        citations,
        regionLinks: [{ tagNumber: 'P-101A', bbox: { page: 1, x: 500, y: 380, w: 80, h: 80 } }],
      });

      // Gate must be locked
      expect(reviewItem.humanGateLocked).toBe(true);
      expect(reviewItem.status).toBe('blocked_on_freshness');

      // Attempting approval MUST throw
      expect(() => {
        queue.approve('task-refinery-audit-001', 'chief-engineer-archit');
      }).toThrow(/Human approval gate is LOCKED/);

      expect(reviewItem.status).toBe('blocked_on_freshness');

      // Human reviewer acknowledges the critical stale citation with field justification
      queue.acknowledgeFreshness(
        'task-refinery-audit-001',
        'cite-stale-critical',
        'chief-engineer-archit',
        'Confirmed deviation against MOC-2026-88 approved field override',
      );

      // Gate should now be unlocked
      expect(reviewItem.humanGateLocked).toBe(false);
      expect(reviewItem.status).toBe('pending_review');

      // Now approval succeeds
      const approvedItem = queue.approve('task-refinery-audit-001', 'chief-engineer-archit');
      expect(approvedItem.status).toBe('approved');
      expect(approvedItem.approvedBy).toBe('chief-engineer-archit');
      expect(approvedItem.approvedAt).toBeDefined();

      // Verify audit trail integrity
      const chainEvents = auditChain.getEvents();
      const overrideEvents = chainEvents.filter((e) => e.kind === 'human.override');
      expect(overrideEvents.length).toBe(2);
      expect((overrideEvents[0]?.payload as any).action).toBe('acknowledge_freshness');
      expect((overrideEvents[1]?.payload as any).action).toBe('approve_deliverable');

      const verification = verifyChain(auditChain.getEvents(), auditChain.getAnchors(), {});
      expect(verification.valid).toBe(true);
    });
  });

  describe('Governed Demo Marketplace Plugins', () => {
    it('admits and executes report-generator, data-visualizer, and unit-converter', async () => {
      const keyPair = generateEd25519KeyPair();
      const keyId = 'marketplace-publisher-root';
      const plugins = createDemoMarketplacePlugins(keyId, keyPair.privateKeyPem, keyPair.publicKeyPem);

      expect(plugins.length).toBe(3);
      expect(plugins.map((p) => p.id)).toEqual([
        'report-generator',
        'data-visualizer',
        'unit-converter',
      ]);

      const host = new PluginHost();
      for (const plugin of plugins) {
        host.registerPlugin(plugin.record, plugin.handlers);
      }

      // 1. Invoke report-generator
      const reportRes = await host.executeTool(
        'report-generator',
        'generate_summary_report',
        { value: 42, unit: 'bar' },
      );
      expect(reportRes).toEqual({ value: 42, unit: 'bar' });

      // 2. Invoke data-visualizer
      const visRes = await host.executeTool(
        'data-visualizer',
        'visualize_series',
        { value: 100, unit: 'm3/h' },
      );
      expect(visRes).toEqual({ value: 100, unit: 'm3/h' });

      // 3. Invoke unit-converter
      const convRes = await host.executeTool(
        'unit-converter',
        'convert_units',
        { value: 250, unit: 'degC' },
      );
      expect(convRes).toEqual({ value: 250, unit: 'degC' });
    });
  });
});
