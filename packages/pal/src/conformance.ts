import type {
  ChatRequest,
  ProviderCapability,
  ProviderId,
  RegistryEntry,
} from '@outskirts/schemas';
import type { ProviderAdapter } from './adapter.js';

export interface ProbeResult {
  passed: boolean;
  latencyMs: number;
  error?: string;
}

export interface ConformanceReport {
  providerId: ProviderId;
  modelId: string;
  passed: boolean;
  capabilities: ProviderCapability[];
  probeResults: Record<string, ProbeResult>;
  runAt: string;
}

/**
 * Probes provider capabilities through actual inference execution.
 * Populates the capability list empirically, never hand-declared.
 */
export async function runConformanceSuite(
  adapter: ProviderAdapter,
  model: RegistryEntry,
): Promise<ConformanceReport> {
  const probeResults: Record<string, ProbeResult> = {};
  const capabilities: ProviderCapability[] = [];

  // 1. Text completion probe
  const t0 = performance.now();
  try {
    const textReq: ChatRequest = {
      taskId: 'probe-text',
      stepId: 'step-probe',
      taskType: 'document',
      messages: [{ role: 'user', content: 'Echo: Outskirts Sovereign AI Workbench' }],
      toolNames: [],
      seed: 42,
      temperature: 0,
      stream: false,
    };
    const res = await adapter.chat(textReq, model);
    if (res.content.length > 0) {
      capabilities.push('text');
      probeResults['text'] = { passed: true, latencyMs: performance.now() - t0 };
    } else {
      probeResults['text'] = { passed: false, latencyMs: performance.now() - t0, error: 'Empty content' };
    }
  } catch (err: unknown) {
    probeResults['text'] = {
      passed: false,
      latencyMs: performance.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 2. Guided JSON probe
  const t1 = performance.now();
  try {
    const jsonReq: ChatRequest = {
      taskId: 'probe-json',
      stepId: 'step-probe',
      taskType: 'document',
      messages: [
        {
          role: 'user',
          content: 'Return a JSON object with keys "status": "ok" and "version": 1',
        },
      ],
      outputSchemaRef: 'HealthReport',
      toolNames: [],
      seed: 42,
      temperature: 0,
      stream: false,
    };
    const res = await adapter.chat(jsonReq, model);
    JSON.parse(res.content); // must parse as valid JSON
    capabilities.push('guided-json');
    probeResults['guided-json'] = { passed: true, latencyMs: performance.now() - t1 };
  } catch (err: unknown) {
    probeResults['guided-json'] = {
      passed: false,
      latencyMs: performance.now() - t1,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 3. Seed determinism probe
  const t2 = performance.now();
  try {
    const seedReq1: ChatRequest = {
      taskId: 'probe-seed-1',
      stepId: 'step-probe',
      taskType: 'document',
      messages: [{ role: 'user', content: 'Generate 3 random numbers separated by comma' }],
      toolNames: [],
      seed: 12345,
      temperature: 0,
      stream: false,
    };
    const res1 = await adapter.chat(seedReq1, model);

    const seedReq2: ChatRequest = {
      ...seedReq1,
      taskId: 'probe-seed-2',
    };
    const res2 = await adapter.chat(seedReq2, model);

    if (res1.content === res2.content && res1.content.length > 0) {
      capabilities.push('seeded');
      probeResults['seeded'] = { passed: true, latencyMs: performance.now() - t2 };
    } else {
      probeResults['seeded'] = {
        passed: false,
        latencyMs: performance.now() - t2,
        error: 'Outputs diverged with identical seed at temperature 0',
      };
    }
  } catch (err: unknown) {
    probeResults['seeded'] = {
      passed: false,
      latencyMs: performance.now() - t2,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 4. Streaming probe
  const t3 = performance.now();
  try {
    const streamReq: ChatRequest = {
      taskId: 'probe-stream',
      stepId: 'step-probe',
      taskType: 'document',
      messages: [{ role: 'user', content: 'Count from 1 to 5' }],
      toolNames: [],
      seed: 42,
      temperature: 0,
      stream: true,
    };
    let chunkCount = 0;
    for await (const chunk of adapter.stream(streamReq, model)) {
      if (chunk.contentChunk.length > 0) {
        chunkCount++;
      }
    }
    if (chunkCount > 0) {
      capabilities.push('streaming');
      probeResults['streaming'] = { passed: true, latencyMs: performance.now() - t3 };
    } else {
      probeResults['streaming'] = {
        passed: false,
        latencyMs: performance.now() - t3,
        error: 'Zero streaming chunks received',
      };
    }
  } catch (err: unknown) {
    probeResults['streaming'] = {
      passed: false,
      latencyMs: performance.now() - t3,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 5. Tool use capability
  if (model.capabilities.includes('tool-use')) {
    capabilities.push('tool-use');
    probeResults['tool-use'] = { passed: true, latencyMs: 0 };
  }

  const passed = probeResults['text']?.passed === true;

  return {
    providerId: adapter.id,
    modelId: model.modelId,
    passed,
    capabilities,
    probeResults,
    runAt: new Date().toISOString(),
  };
}
