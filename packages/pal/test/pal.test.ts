import { describe, it, expect, vi } from 'vitest';
import {
  PAL,
  ModelRegistry,
  createDefaultModelRegistry,
  resolveRoute,
  RoutingRefusalError,
  OllamaAdapter,
  VllmAdapter,
  runConformanceSuite,
  type ProviderAdapter,
  type ChatResponse,
} from '../src/index.js';
import type { ChatRequest, PalAuditEvent } from '@outskirts/schemas';

describe('Provider Adapter Layer (PAL)', () => {
  describe('Routing Resolution', () => {
    it('routes code tasks to code specialists and document tasks to document models', () => {
      const registry = createDefaultModelRegistry();

      const codeReq: ChatRequest = {
        taskId: 't-code',
        stepId: 's-1',
        taskType: 'code',
        messages: [{ role: 'user', content: 'Write a python script for Darcy-Weisbach' }],
        toolNames: [],
        seed: 42,
        temperature: 0,
        stream: false,
      };

      const route = resolveRoute(codeReq, 'SOVEREIGN', registry);
      expect(route.model.taskTypes).toContain('code');
      expect(route.model.modelId).toBe('qwen2.5-coder-7b-awq');
    });

    it('enforces SOVEREIGN mode perimeter guard by refusing outside-perimeter models', () => {
      const registry = new ModelRegistry();
      // Only an external model registered for vision
      registry.register({
        modelId: 'external-vision-frontier',
        providerId: 'nim',
        locality: 'internet',
        trustBoundary: 'outside-perimeter',
        taskTypes: ['vision'],
        capabilities: ['text', 'vision'],
        modelDigest: 'sha256:abcd0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd',
        quantisation: 'none',
        contextWindow: 128000,
        quality: 0.99,
        estLoadS: 0,
        pinned: false,
        status: 'enabled',
        license: 'Commercial',
      });

      const visionReq: ChatRequest = {
        taskId: 't-vis',
        stepId: 's-vis',
        taskType: 'vision',
        messages: [{ role: 'user', content: 'Extract P&ID diagram' }],
        toolNames: [],
        seed: null,
        temperature: 0,
        stream: false,
      };

      // In SOVEREIGN mode, outside-perimeter model must be refused
      expect(() => resolveRoute(visionReq, 'SOVEREIGN', registry)).toThrow(
        RoutingRefusalError,
      );

      try {
        resolveRoute(visionReq, 'SOVEREIGN', registry);
      } catch (err) {
        expect(err).toBeInstanceOf(RoutingRefusalError);
        expect((err as RoutingRefusalError).reason).toBe('refused-locality');
      }

      // In ASSIST mode, it is admissible
      const assistRoute = resolveRoute(visionReq, 'ASSIST', registry);
      expect(assistRoute.model.modelId).toBe('external-vision-frontier');
    });

    it('ranks resident (loaded/pinned) models higher when cold-load penalty is significant', () => {
      const registry = new ModelRegistry();

      // Cold model with slightly higher raw quality (0.93), but takes 15s to load
      registry.register({
        modelId: 'cold-high-quality',
        providerId: 'ollama',
        locality: 'loopback',
        trustBoundary: 'inside-perimeter',
        taskTypes: ['calculation'],
        capabilities: ['text'],
        modelDigest: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        quantisation: 'Q4_K_M',
        contextWindow: 16384,
        quality: 0.93,
        estLoadS: 15,
        pinned: false,
        status: 'enabled',
        license: 'Apache-2.0',
      });

      // Warm/pinned model with slightly lower raw quality (0.90), but 0s load penalty
      registry.register({
        modelId: 'warm-resident',
        providerId: 'vllm',
        locality: 'loopback',
        trustBoundary: 'inside-perimeter',
        taskTypes: ['calculation'],
        capabilities: ['text'],
        modelDigest: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
        quantisation: 'AWQ',
        contextWindow: 32768,
        quality: 0.90,
        estLoadS: 0,
        pinned: true,
        status: 'enabled',
        license: 'Apache-2.0',
      });

      const req: ChatRequest = {
        taskId: 't-calc',
        stepId: 's-calc',
        taskType: 'calculation',
        messages: [{ role: 'user', content: 'Compute head loss' }],
        toolNames: [],
        seed: null,
        temperature: 0,
        stream: false,
      };

      // With latency budget = 20s, cold model penalty = 0.3 * (15/20) = 0.225.
      // Net score for cold model = 0.93 - 0.225 = 0.705.
      // Warm model score = 0.90 - 0 = 0.90.
      const route = resolveRoute(req, 'SOVEREIGN', registry, undefined, { latencyBudgetS: 20 });
      expect(route.model.modelId).toBe('warm-resident');
      expect(route.loaded).toBe(true);
    });
  });

  describe('Conformance Suite', () => {
    it('conformance passes for Ollama adapter mock and discovers capabilities', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/chat')) {
          const body = JSON.parse(init?.body as string);
          if (body.messages?.[0]?.content?.includes('random numbers')) {
            return new Response(JSON.stringify({
              message: { content: '14, 28, 57' },
              prompt_eval_count: 10,
              eval_count: 8,
            }));
          }
          if (body.format === 'json' || (body.format && typeof body.format === 'object')) {
            return new Response(JSON.stringify({
              message: { content: JSON.stringify({ status: 'ok', version: 1 }) },
              prompt_eval_count: 15,
              eval_count: 12,
            }));
          }
          if (body.stream) {
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: { content: '1, 2, ' }, done: false }) + '\n'));
                controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: { content: '3, 4, 5' }, done: true }) + '\n'));
                controller.close();
              },
            });
            return new Response(stream);
          }
          return new Response(JSON.stringify({
            message: { content: 'Outskirts Sovereign AI Workbench' },
            prompt_eval_count: 8,
            eval_count: 6,
          }));
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new OllamaAdapter({ fetchFn: mockFetch as typeof fetch });
      const registry = createDefaultModelRegistry();
      const model = registry.get('qwen2.5-7b-instruct-q4')!;

      const report = await runConformanceSuite(adapter, model);

      expect(report.passed).toBe(true);
      expect(report.capabilities).toContain('text');
      expect(report.capabilities).toContain('guided-json');
      expect(report.capabilities).toContain('seeded');
      expect(report.capabilities).toContain('streaming');
    });

    it('conformance passes for vLLM adapter mock and discovers capabilities', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/v1/chat/completions')) {
          const body = JSON.parse(init?.body as string);
          if (body.messages?.[0]?.content?.includes('random numbers')) {
            return new Response(JSON.stringify({
              choices: [{ message: { content: '42, 84, 126', role: 'assistant' } }],
              usage: { prompt_tokens: 12, completion_tokens: 8 },
            }));
          }
          if (body.guided_json || body.response_format) {
            return new Response(JSON.stringify({
              choices: [{ message: { content: JSON.stringify({ status: 'ok', version: 1 }), role: 'assistant' } }],
              usage: { prompt_tokens: 15, completion_tokens: 10 },
            }));
          }
          if (body.stream) {
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Chunk 1 ' } }] }) + '\n\n'));
                controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Chunk 2' } }] }) + '\n\n'));
                controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                controller.close();
              },
            });
            return new Response(stream);
          }
          return new Response(JSON.stringify({
            choices: [{ message: { content: 'Outskirts Sovereign AI Workbench verified', role: 'assistant' } }],
            usage: { prompt_tokens: 10, completion_tokens: 7 },
          }));
        }
        return new Response('Not found', { status: 404 });
      });

      const adapter = new VllmAdapter({ fetchFn: mockFetch as typeof fetch });
      const registry = createDefaultModelRegistry();
      const model = registry.get('qwen2.5-coder-7b-awq')!;

      const report = await runConformanceSuite(adapter, model);

      expect(report.passed).toBe(true);
      expect(report.capabilities).toContain('text');
      expect(report.capabilities).toContain('guided-json');
      expect(report.capabilities).toContain('seeded');
      expect(report.capabilities).toContain('streaming');
    });
  });

  describe('Cassettes & PAL Execution with Audit Tagging', () => {
    it('records and replays responses deterministically with cacheHit flag', async () => {
      const auditedEvents: PalAuditEvent[] = [];
      const pal = new PAL({
        mode: 'SOVEREIGN',
        auditListener: (evt) => auditedEvents.push(evt),
      });

      // Mock adapter
      let callCount = 0;
      const mockAdapter: ProviderAdapter = {
        id: 'vllm',
        locality: 'loopback',
        trustBoundary: 'inside-perimeter',
        endpointHost: '127.0.0.1:8000',
        capabilities: ['text', 'guided-json', 'seeded'],
        chat: async () => {
          callCount++;
          return {
            content: 'Simulated calculation response: Reynolds number = 4500',
            role: 'assistant',
            tokensIn: 25,
            tokensOut: 15,
            latencyMs: 120,
            loadMs: 0,
          };
        },
        stream: async function* () {
          yield { contentChunk: 'done', done: true };
        },
        health: async () => ({
          providerId: 'vllm',
          healthy: true,
          checkedAt: new Date().toISOString(),
          residentModels: ['qwen2.5-coder-7b-awq'],
          devicePlacement: 'gpu',
        }),
      };

      pal.registerAdapter(mockAdapter);

      const req: ChatRequest = {
        taskId: 't-cassette-test',
        stepId: 'step-1',
        taskType: 'code',
        messages: [{ role: 'user', content: 'Compute Reynolds number for water at 20C' }],
        toolNames: [],
        seed: 42,
        temperature: 0,
        stream: false,
      };

      // 1. Record mode
      pal.setCassetteMode('record');
      const res1 = await pal.executeChat(req);
      expect(callCount).toBe(1);
      expect(res1.auditEvent.cacheHit).toBe(false);
      expect(res1.auditEvent.status).toBe('ok');
      expect(res1.auditEvent.locality).toBe('loopback');
      expect(res1.auditEvent.trustBoundary).toBe('inside-perimeter');

      // 2. Replay mode: adapter should NOT be called again
      pal.setCassetteMode('replay');
      const res2 = await pal.executeChat(req);
      expect(callCount).toBe(1); // Still 1! No model socket opened!
      expect(res2.auditEvent.cacheHit).toBe(true);
      expect(res2.response.content).toBe(res1.response.content);

      // Audit stream received both events
      expect(auditedEvents.length).toBe(2);
      expect(auditedEvents[0]!.cacheHit).toBe(false);
      expect(auditedEvents[1]!.cacheHit).toBe(true);
    });
  });
});
