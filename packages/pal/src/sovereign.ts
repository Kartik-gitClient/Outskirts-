import type {
  ProviderId,
  RegistryEntry,
} from '@outskirts/schemas';
import type { ProviderAdapter } from './adapter.js';
import { ModelRegistry } from './registry.js';
import { PAL, type PalOptions } from './pal.js';
import { OllamaAdapter } from './ollama.js';
import { VllmAdapter } from './vllm.js';

/**
 * Sovereign-only build target.
 * Principle 4 & Section 18: The `outskirts-sovereign` build target compiles out
 * any remote adapter or outside-perimeter network endpoints.
 */
export function createSovereignRegistry(): ModelRegistry {
  const registry = new ModelRegistry();

  // 1. Local resident GPU model (vLLM)
  registry.register({
    modelId: 'qwen2.5-coder-7b-awq',
    providerId: 'vllm',
    locality: 'loopback',
    trustBoundary: 'inside-perimeter',
    taskTypes: ['code'],
    capabilities: ['text', 'tool-use', 'guided-json', 'seeded', 'streaming'],
    modelDigest: 'sha256:4a65b8c9d0123456789abcdef0123456789abcdef0123456789abcdef0123456',
    quantisation: 'AWQ',
    contextWindow: 32768,
    quality: 0.92,
    estLoadS: 0,
    pinned: true,
    status: 'enabled',
    license: 'Apache-2.0',
    licenseUrl: 'https://spdx.org/licenses/Apache-2.0.html',
  });

  // 2. Local CPU / swapped model (Ollama)
  registry.register({
    modelId: 'qwen2.5-7b-instruct-q4',
    providerId: 'ollama',
    locality: 'loopback',
    trustBoundary: 'inside-perimeter',
    taskTypes: ['document', 'retrieve', 'calculation'],
    capabilities: ['text', 'guided-json', 'seeded', 'streaming'],
    modelDigest: 'sha256:7f8e9d0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e',
    quantisation: 'Q4_K_M',
    contextWindow: 16384,
    quality: 0.85,
    estLoadS: 6.5,
    pinned: false,
    status: 'enabled',
    license: 'Apache-2.0',
    licenseUrl: 'https://spdx.org/licenses/Apache-2.0.html',
  });

  // 3. Dedicated LAN air-gapped server
  registry.register({
    modelId: 'deepseek-r1-distill-qwen-14b-lan',
    providerId: 'vllm',
    locality: 'lan',
    trustBoundary: 'inside-perimeter',
    taskTypes: ['calculation'],
    capabilities: ['text', 'guided-json', 'seeded'],
    modelDigest: 'sha256:9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    quantisation: 'FP8',
    contextWindow: 65536,
    quality: 0.96,
    estLoadS: 0,
    pinned: true,
    status: 'enabled',
    license: 'MIT',
    licenseUrl: 'https://spdx.org/licenses/MIT.html',
  });

  // Notice: NO internet / outside-perimeter models are present.
  return registry;
}

export function createSovereignPAL(options?: Partial<PalOptions>): PAL {
  const registry = options?.registry ?? createSovereignRegistry();
  const adapters = new Map<ProviderId, ProviderAdapter>();

  // Only register loopback/LAN inside-perimeter adapters
  adapters.set('vllm', new VllmAdapter());
  adapters.set('ollama', new OllamaAdapter());

  return new PAL({
    mode: 'SOVEREIGN',
    registry,
    adapters,
    ...options,
  });
}
