import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import {
  createServer,
  verifyC2paManifest,
  TaskWebSocketGateway,
  CancellationToken,
} from '../src/index.js';
import { verifyChain } from '@outskirts/sovereignty';
import type { ServerEvent } from '@outskirts/schemas';

describe('Phase P1: Walking Skeleton & Flagship Acceptance Suite', () => {
  it('passes flagship pipeline in cassette mode and produces verifiable C2PA manifest & Decision DNA', async () => {
    const ctx = createServer();
    const taskId = 'task-flagship-01';
    const goal = 'Produce engineering approval note for Refinery Line P-101A';

    const result = await ctx.executor.executeTask(taskId, goal, {
      mode: 'SOVEREIGN',
    });

    // 1. Pipeline Completion
    expect(result.status).toBe('completed');
    expect(result.stepsCompleted.length).toBe(8);
    expect(result.stepsCompleted).toEqual([
      'step-1-intake',
      'step-2-extract',
      'step-3-calc',
      'step-4-retrieve',
      'step-5-draft',
      'step-6-critic',
      'step-7-deliver',
      'step-8-record',
    ]);

    // 2. Deliverable & C2PA Manifest Verification
    expect(result.artifactContent).toBeDefined();
    expect(result.c2paManifest).toBeDefined();

    const c2paCheck = verifyC2paManifest(
      result.c2paManifest!,
      result.artifactContent!,
      ctx.publicKeyPem,
    );
    expect(c2paCheck.valid).toBe(true);

    // Tampering with content invalidates C2PA binding
    const tamperedContent = result.artifactContent + '\nTAMPERED LINE';
    const tamperedCheck = verifyC2paManifest(
      result.c2paManifest!,
      tamperedContent,
      ctx.publicKeyPem,
    );
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.reason).toContain('Content hash mismatch');

    // 3. Decision DNA & Offline Audit Chain Verification
    expect(result.dna).toBeDefined();
    expect(result.dna!.taskId).toBe(taskId);
    expect(result.dna!.criticGate).toBe('pass');
    expect(result.dna!.deterministicPass).toBe(true);

    const chainVerification = verifyChain(
      ctx.auditChain.getEvents(),
      ctx.auditChain.getAnchors(),
      { [ctx.keyId]: ctx.publicKeyPem },
    );
    expect(chainVerification.valid).toBe(true);
    expect(chainVerification.eventsWalked).toBeGreaterThanOrEqual(6);
    expect(chainVerification.anchorsVerified).toBeGreaterThanOrEqual(1);
  });

  it('cooperative cancellation mid-step leaves a consistent DB and audit record', async () => {
    const ctx = createServer();
    const taskId = 'task-cancel-test';
    const token = new CancellationToken();

    // Hook to cancel when step-3 is reached
    ctx.timeline.subscribe(taskId, (evt) => {
      if (evt.type === 'step.update' && evt.stepId === 'step-3-calc' && evt.status === 'running') {
        token.cancel('Operator initiated cancellation mid-calculation');
      }
    });

    const result = await ctx.executor.executeTask(taskId, 'Piping inspection approval cancel test', {
      mode: 'SOVEREIGN',
      token,
    });

    expect(result.status).toBe('cancelled');
    expect(result.stepsCompleted.length).toBeLessThan(8);

    // Checkpoint must reflect cancelled state and recorded progress
    const events = ctx.timeline.getAllEvents(taskId);
    const cancelEvt = events.find((e) => e.type === 'step.update' && e.status === 'cancelled');
    expect(cancelEvt).toBeDefined();

    const auditEvents = ctx.auditChain.getEvents();
    const guardAlert = auditEvents.find((e) => e.kind === 'guard.alert');
    expect(guardAlert).toBeDefined();
  });

  it('killing WebSocket mid-run and reconnecting reproduces the identical timeline without gaps', async () => {
    const ctx = createServer();
    const server = http.createServer(ctx.app);
    const wsGateway = new TaskWebSocketGateway(server, ctx.timeline);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    const wsUrl = `ws://127.0.0.1:${port}/ws`;

    const taskId = 'task-ws-reconnect-01';

    // 1. First client connects to stream
    const firstClientEvents: ServerEvent[] = [];
    const ws1 = new WebSocket(`${wsUrl}?taskId=${taskId}&since=0`);

    let ws1Killed = false;
    const ws1ClosedPromise = new Promise<void>((resolve) => {
      ws1.on('close', () => resolve());
    });

    ws1.on('message', (data) => {
      if (ws1Killed) return;
      const evt = JSON.parse(data.toString()) as ServerEvent;
      firstClientEvents.push(evt);

      // Kill the socket intentionally when we reach 3 events
      if (firstClientEvents.length === 3) {
        ws1Killed = true;
        ws1.terminate();
      }
    });

    // Launch task in background
    const taskPromise = ctx.executor.executeTask(taskId, 'WS Reconnection Test');

    // Wait for ws1 to be killed
    await ws1ClosedPromise;
    expect(firstClientEvents.length).toBe(3);
    const lastSeqSeen = firstClientEvents[firstClientEvents.length - 1]!.seq;

    // 2. Client reconnects requesting events since `lastSeqSeen`
    const reconnectedEvents: ServerEvent[] = [];
    const ws2 = new WebSocket(`${wsUrl}?taskId=${taskId}&since=${lastSeqSeen}`);

    ws2.on('message', (data) => {
      const evt = JSON.parse(data.toString()) as ServerEvent;
      reconnectedEvents.push(evt);
    });

    // Wait for task completion
    await taskPromise;

    // Wait a brief moment for remaining WS messages to flush
    await new Promise((r) => setTimeout(r, 100));

    ws2.close();
    await wsGateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // 3. Assert continuity
    const allTimelineEvents = ctx.timeline.getAllEvents(taskId);
    expect(allTimelineEvents.length).toBeGreaterThan(5);

    // Combined events must equal all timeline events exactly in monotonic sequence
    const combinedEvents = [...firstClientEvents, ...reconnectedEvents];
    expect(combinedEvents.length).toBe(allTimelineEvents.length);

    for (let i = 0; i < combinedEvents.length; i++) {
      expect(combinedEvents[i]!.seq).toBe(i + 1);
      expect(combinedEvents[i]!.type).toBe(allTimelineEvents[i]!.type);
    }
  });
});
