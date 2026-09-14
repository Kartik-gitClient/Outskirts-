import { describe, expect, it } from 'vitest';
import { useAppStore } from '../src/store/index.js';
import type { Plan } from '@outskirts/schemas';

describe('Desktop Client: 5 Zustand Slices & UI State Machines (Section 14)', () => {
  it('workbenchSlice: initializes and reflects Plan DAG and streaming events', () => {
    const store = useAppStore.getState();

    const plan: Plan = {
      taskId: 'task-test-01',
      recipeId: 'inspection-approval-recipe',
      steps: [
        {
          stepId: 'step-1',
          description: 'Document intake',
          kind: 'document',
          plugins: [],
          dependsOn: [],
          status: 'pending',
        },
        {
          stepId: 'step-2',
          description: 'Calculations',
          kind: 'calculation',
          plugins: ['pipe-calc-plugin'],
          dependsOn: ['step-1'],
          status: 'pending',
        },
      ],
    };

    store.setPlan(plan);
    const state = useAppStore.getState();
    expect(state.activeTaskId).toBe('task-test-01');
    expect(state.nodes.length).toBe(2);
    expect(state.nodes[0]?.id).toBe('step-1');
    expect(state.nodes[0]?.status).toBe('pending');

    store.updateStepStatus('step-1', 'done');
    expect(useAppStore.getState().nodes[0]?.status).toBe('done');

    store.appendTimelineEvent({
      seq: 1 as any,
      ts: '2026-09-13T10:00:00Z',
      type: 'step.update',
      stepId: 'step-1',
      status: 'done',
    } as any);

    expect(useAppStore.getState().timeline.length).toBe(1);
  });

  it('sovereigntySlice: enforces SOVEREIGN default, tracks locality logs and perimeter alerts', () => {
    const store = useAppStore.getState();

    expect(store.mode).toBe('SOVEREIGN');
    expect(store.egressPacketCount).toBe(0);

    store.recordLocalityCall({
      id: 'call-01',
      timestamp: '14:00:00Z',
      model: 'qwen2.5-coder-7b-awq',
      locality: 'loopback',
      trustBoundary: 'inside-perimeter',
      endpoint: 'http://127.0.0.1:8001/v1',
      resolvedHostname: 'localhost',
    });

    const state = useAppStore.getState();
    expect(state.localityCounts.loopback).toBe(1);
    expect(state.localityLogs.length).toBe(1);
    expect(state.localityLogs[0]?.resolvedHostname).toBe('localhost');

    store.recordAlert({
      alertId: 'alert-egress-01' as any,
      seq: 1 as any,
      ts: '2026-09-13T14:00:00Z',
      kind: 'egress-attempt-blocked' as any,
      pluginId: 'rogue-plugin',
      pluginVersion: '1.0.0',
      detail: 'Network socket blocked',
    });

    expect(useAppStore.getState().alerts.length).toBe(1);
  });

  it('marketplaceSlice: toggles plugin activation state', () => {
    const store = useAppStore.getState();

    store.setPlugins([
      {
        manifest: {
          id: 'report-generator',
          version: '1.0.0',
          minCore: '0.1.0',
          runtime: 'wasm',
          entry: 'plugin.wasm',
          network: 'deny-all',
          fs: { read: [], write: [] },
          resources: { cpu: 1, mem: '128MB', timeoutS: 30 },
          tools: [],
          keyId: 'root-key',
          signature: 'sig-123',
        },
        installedAt: '2026-09-13',
        signatureValid: true,
        keyTrusted: true,
        enabled: true,
        roleGates: ['admin'],
        manifestHash: 'hash-123',
      },
    ]);

    expect(useAppStore.getState().plugins[0]?.enabled).toBe(true);
    store.togglePluginEnabled('report-generator', false);
    expect(useAppStore.getState().plugins[0]?.enabled).toBe(false);
  });

  it('adminSlice: controls user roles and model statuses', () => {
    const store = useAppStore.getState();

    store.setUserRole('senior');
    expect(useAppStore.getState().activeUserRole).toBe('senior');

    store.setModels([
      {
        modelId: 'test-model',
        providerId: 'vllm',
        locality: 'loopback',
        trustBoundary: 'inside-perimeter',
        taskTypes: ['code'],
        capabilities: ['text'],
        modelDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        quantisation: 'AWQ',
        contextWindow: 32768,
        quality: 0.9,
        estLoadS: 0,
        pinned: true,
        status: 'enabled',
        license: 'Apache-2.0',
      },
    ]);

    store.setModelStatus('test-model', 'disabled');
    expect(useAppStore.getState().models[0]?.status).toBe('disabled');
  });

  it('reviewSlice: blocks human approval gate on stale freshness citations until acknowledged', () => {
    const store = useAppStore.getState();

    store.setReviewItems([
      {
        reviewId: 'rev-01',
        taskId: 'task-test-review',
        deliverableId: 'deliv-01',
        title: 'Inspection Briefing',
        status: 'blocked_on_freshness',
        humanGateLocked: true,
        citations: [
          {
            citationId: 'cite-01',
            chunkId: 'chunk-1',
            documentId: 'doc-stale-sop',
            quote: 'Required thickness is 4.2mm',
            decayAtCitation: 0.95,
            stateAtCitation: 'CRITICAL',
          },
        ],
        regionLinks: [],
      },
    ]);

    const item = useAppStore.getState().reviewItems[0]!;
    expect(item.humanGateLocked).toBe(true);
    expect(item.status).toBe('blocked_on_freshness');

    // Attempting to approve must fail
    expect(() => {
      store.approveDeliverable('task-test-review', 'reviewer-archit');
    }).toThrow(/gate is locked/);

    // Reviewer acknowledges freshness
    store.acknowledgeFreshness('task-test-review', 'cite-01', 'reviewer-archit');

    const updated = useAppStore.getState().reviewItems[0]!;
    expect(updated.humanGateLocked).toBe(false);
    expect(updated.status).toBe('pending_review');
    expect(updated.citations[0]?.acknowledgedBy).toBe('reviewer-archit');

    // Now approval succeeds
    store.approveDeliverable('task-test-review', 'reviewer-archit');
    expect(useAppStore.getState().reviewItems[0]?.status).toBe('approved');
    expect(useAppStore.getState().reviewItems[0]?.approvedBy).toBe('reviewer-archit');
  });
});
