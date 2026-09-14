import { RegistryEntry, type ProviderCapability } from '@outskirts/schemas';

export class ModelRegistry {
  private models = new Map<string, RegistryEntry>();

  constructor(initialEntries?: RegistryEntry[]) {
    if (initialEntries) {
      for (const entry of initialEntries) {
        this.register(entry);
      }
    }
  }

  public register(raw: unknown): RegistryEntry {
    const validated = RegistryEntry.parse(raw);
    this.models.set(validated.modelId, validated);
    return validated;
  }

  public unregister(modelId: string): boolean {
    return this.models.delete(modelId);
  }

  public get(modelId: string): RegistryEntry | undefined {
    return this.models.get(modelId);
  }

  public getAll(): RegistryEntry[] {
    return Array.from(this.models.values());
  }

  public updateCapabilities(modelId: string, capabilities: ProviderCapability[]): void {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model "${modelId}" not found in registry`);
    }
    this.models.set(
      modelId,
      RegistryEntry.parse({
        ...model,
        capabilities,
        status: model.status === 'untested' ? 'enabled' : model.status,
      }),
    );
  }

  public setStatus(modelId: string, status: 'enabled' | 'disabled' | 'untested'): void {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model "${modelId}" not found in registry`);
    }
    this.models.set(modelId, RegistryEntry.parse({ ...model, status }));
  }
}

/**
 * Baseline industrial model shelf matching the architecture plan.
 */
export function createDefaultModelRegistry(): ModelRegistry {
  const registry = new ModelRegistry();

  // Local resident GPU model (vLLM) - Coding specialist
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

  // Local CPU / swapped model (Ollama)
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

  // Dedicated LAN air-gapped server for heavy reasoning and calculation
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

  // External / cloud model (ASSIST mode only; refused in SOVEREIGN mode)
  registry.register({
    modelId: 'external-assist-frontier',
    providerId: 'nim',
    locality: 'internet',
    trustBoundary: 'outside-perimeter',
    taskTypes: ['code', 'document', 'vision', 'calculation'],
    capabilities: ['text', 'vision', 'tool-use', 'guided-json', 'seeded', 'streaming'],
    modelDigest: 'sha256:11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
    quantisation: 'none',
    contextWindow: 128000,
    quality: 0.98,
    estLoadS: 0,
    pinned: false,
    status: 'enabled',
    license: 'Commercial',
  });

  // Local vision specialist (vLLM / RF-DETR perception host)
  registry.register({
    modelId: 'qwen2.5-vl-7b-instruct',
    providerId: 'vllm',
    locality: 'loopback',
    trustBoundary: 'inside-perimeter',
    taskTypes: ['vision'],
    capabilities: ['text', 'vision', 'tool-use', 'guided-json', 'seeded', 'streaming'],
    modelDigest: 'sha256:5b76c9d0123456789abcdef0123456789abcdef0123456789abcdef01234570',
    quantisation: 'AWQ',
    contextWindow: 32768,
    quality: 0.93,
    estLoadS: 0,
    pinned: true,
    status: 'enabled',
    license: 'Apache-2.0',
    licenseUrl: 'https://spdx.org/licenses/Apache-2.0.html',
  });

  return registry;
}
