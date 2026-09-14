import { describe, it, expect } from 'vitest';
import {
  AuditChain,
  verifyChain,
  generateSyntheticChain,
  generateEd25519KeyPair,
  signEd25519,
  canonicalJsonStringify,
  projectDecisionDna,
  exportInTotoLinks,
} from '../src/index.js';
import type { AuditEvent } from '@outskirts/schemas';

describe('Audit Chain and Verification', () => {
  it('builds a sequential, hash-chained series of audit events', () => {
    const chain = new AuditChain();
    const e1 = chain.append('mode.transition', { mode: 'SOVEREIGN', reason: 'boot' });
    const e2 = chain.append('pal.call', { model: 'qwen2.5-coder-7b', promptTokens: 120 });
    const e3 = chain.append('tool.call', { tool: 'fluids-pressure-drop', pipeId: 'P-101' });

    expect(e1.seq).toBe(1);
    expect(e1.prevHash).toBe('0'.repeat(64));
    expect(e2.seq).toBe(2);
    expect(e2.prevHash).not.toBe('0'.repeat(64));
    expect(e3.seq).toBe(3);

    const events = chain.getEvents();
    expect(events.length).toBe(3);
  });

  it('signs anchors with Ed25519 and verifies successfully', () => {
    const keyPair = generateEd25519KeyPair();
    const chain = new AuditChain();

    for (let i = 0; i < 10; i++) {
      chain.append('pal.call', { index: i, note: 'test' });
    }

    const anchor = chain.createAnchor('test-key-01', keyPair.privateKeyPem);
    expect(anchor.seqLow).toBe(1);
    expect(anchor.seqHigh).toBe(10);
    expect(anchor.eventCount).toBe(10);
    expect(anchor.signature).toBeDefined();

    const result = verifyChain(chain.getEvents(), chain.getAnchors(), {
      'test-key-01': keyPair.publicKeyPem,
    });

    expect(result.valid).toBe(true);
    expect(result.eventsWalked).toBe(10);
    expect(result.anchorsVerified).toBe(1);
  });

  describe('P0 Exit Criterion: Synthetic 1000-event chain', () => {
    it('passes verification on a synthetic 1000-event chain', () => {
      const synthetic = generateSyntheticChain({
        eventCount: 1000,
        anchorInterval: 500,
        keyId: 'tpm-key-primary-01',
      });

      expect(synthetic.events.length).toBe(1000);
      expect(synthetic.anchors.length).toBe(2);
      expect(synthetic.anchors[0]!.seqLow).toBe(1);
      expect(synthetic.anchors[0]!.seqHigh).toBe(500);
      expect(synthetic.anchors[1]!.seqLow).toBe(501);
      expect(synthetic.anchors[1]!.seqHigh).toBe(1000);

      const result = verifyChain(synthetic.events, synthetic.anchors, {
        [synthetic.keyId]: synthetic.keyPair.publicKeyPem,
      });

      expect(result.valid).toBe(true);
      expect(result.eventsWalked).toBe(1000);
      expect(result.anchorsVerified).toBe(2);
      expect(result.reason).toBeUndefined();
    });

    it('fails verification on a truncated chain (deleting tail events)', () => {
      const synthetic = generateSyntheticChain({
        eventCount: 1000,
        anchorInterval: 500,
        keyId: 'tpm-key-primary-01',
      });

      // Attacker lops off the last 40 events
      const truncatedEvents = synthetic.events.slice(0, 960);

      const result = verifyChain(truncatedEvents, synthetic.anchors, {
        [synthetic.keyId]: synthetic.keyPair.publicKeyPem,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('count-mismatch');
      expect(result.brokenAtSeq).toBe(961);
    });

    it('fails verification if expectedEventCount is provided and tail events were truncated before anchor', () => {
      const synthetic = generateSyntheticChain({
        eventCount: 1000,
        anchorInterval: 500,
        keyId: 'tpm-key-primary-01',
      });

      const truncatedEvents = synthetic.events.slice(0, 999);

      const result = verifyChain(
        truncatedEvents,
        synthetic.anchors,
        { [synthetic.keyId]: synthetic.keyPair.publicKeyPem },
        { expectedEventCount: 1000 },
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('count-mismatch');
    });
  });

  describe('Tampering and Attack Detection', () => {
    it('detects modified payload in an event', () => {
      const synthetic = generateSyntheticChain({ eventCount: 20, anchorInterval: 20 });
      const tamperedEvents: AuditEvent[] = JSON.parse(JSON.stringify(synthetic.events));

      // Attacker secretly tampers with event 5 payload
      tamperedEvents[4]!.payload['tampered'] = true;

      const result = verifyChain(tamperedEvents, synthetic.anchors, {
        [synthetic.keyId]: synthetic.keyPair.publicKeyPem,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('hash-mismatch');
      expect(result.brokenAtSeq).toBe(5);
    });

    it('detects intermediate event deletion / splicing', () => {
      const synthetic = generateSyntheticChain({ eventCount: 20, anchorInterval: 20 });
      // Remove event 7
      const splicedEvents = [
        ...synthetic.events.slice(0, 6),
        ...synthetic.events.slice(7),
      ];

      const result = verifyChain(splicedEvents, synthetic.anchors, {
        [synthetic.keyId]: synthetic.keyPair.publicKeyPem,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('hash-mismatch');
    });

    it('detects signature forgery or corruption', () => {
      const synthetic = generateSyntheticChain({ eventCount: 50, anchorInterval: 50 });
      const tamperedAnchors = JSON.parse(JSON.stringify(synthetic.anchors));

      // Corrupt anchor signature
      tamperedAnchors[0]!.signature = 'badbeef'.repeat(18);

      const result = verifyChain(synthetic.events, tamperedAnchors, {
        [synthetic.keyId]: synthetic.keyPair.publicKeyPem,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('signature-invalid');
      expect(result.brokenAtSeq).toBe(1);
    });

    it('rejects anchors signed by untrusted keys', () => {
      const synthetic = generateSyntheticChain({ eventCount: 50, anchorInterval: 50 });

      // Verifier does not have key in trusted list
      const result = verifyChain(synthetic.events, synthetic.anchors, {
        'some-other-key': synthetic.keyPair.publicKeyPem,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('untrusted-key');
      expect(result.brokenAtSeq).toBe(1);
    });

    it('detects anchor sequence gaps', () => {
      const keyPair = generateEd25519KeyPair();
      const synthetic = generateSyntheticChain({
        eventCount: 100,
        anchorInterval: 50,
        keyPair,
      });
      const tamperedAnchors = JSON.parse(JSON.stringify(synthetic.anchors));

      // Re-sign anchor 2 with a gapped seqLow (55 instead of 51)
      tamperedAnchors[1]!.seqLow = 55;
      tamperedAnchors[1]!.eventCount = 46;
      const body = {
        anchorId: tamperedAnchors[1]!.anchorId,
        seqLow: tamperedAnchors[1]!.seqLow,
        seqHigh: tamperedAnchors[1]!.seqHigh,
        eventCount: tamperedAnchors[1]!.eventCount,
        merkleRoot: tamperedAnchors[1]!.merkleRoot,
        prevAnchorHash: tamperedAnchors[1]!.prevAnchorHash,
        prevAnchorSignature: tamperedAnchors[1]!.prevAnchorSignature,
        keyId: tamperedAnchors[1]!.keyId,
        signedAt: tamperedAnchors[1]!.signedAt,
      };
      tamperedAnchors[1]!.signature = signEd25519(
        canonicalJsonStringify(body),
        keyPair.privateKeyPem,
      );

      const result = verifyChain(synthetic.events, tamperedAnchors, {
        [synthetic.keyId]: keyPair.publicKeyPem,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('anchor-gap');
    });
  });

  describe('Decision DNA and in-toto projection', () => {
    it('projects task execution into validated Decision DNA record', () => {
      const dna = projectDecisionDna({
        taskId: 'task-101',
        goal: 'Generate approval note for Vessel V-101 inspection',
        recipeId: 'recipe-inspection-approval',
        modeAtLaunch: 'SOVEREIGN',
        steps: [
          {
            stepId: 'step-1-ocr',
            kind: 'vision',
            model: 'docling-paddle-v6',
            modelDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            providerId: 'vllm',
            locality: 'loopback',
            trustBoundary: 'inside-perimeter',
            promptTemplateHash: 'hash-tpl-01',
            seed: 42,
            toolCalls: [
              {
                tool: 'paddle-layout',
                inputHash: 'a'.repeat(64),
                outputHash: 'b'.repeat(64),
              },
            ],
          },
        ],
        citations: [
          {
            citationId: 'cite-01',
            documentId: 'doc-sop-44',
            decayAtCitation: 0.95,
            stateAtCitation: 'FRESH',
          },
        ],
        criticGate: 'pass',
        deterministicPass: true,
        artifactHashes: ['c'.repeat(64)],
        chainSeqLow: 1,
        chainSeqHigh: 45,
      });

      expect(dna.taskId).toBe('task-101');
      expect(dna.modeAtLaunch).toBe('SOVEREIGN');
      expect(dna.criticGate).toBe('pass');
      expect(dna.steps.length).toBe(1);

      const inTotoLinks = exportInTotoLinks(dna);
      expect(inTotoLinks.length).toBe(1);
      expect(inTotoLinks[0]!._type).toBe('https://in-toto.io/Statement/v1');
      expect(inTotoLinks[0]!.predicate.byproducts.locality).toBe('loopback');
    });
  });
});
