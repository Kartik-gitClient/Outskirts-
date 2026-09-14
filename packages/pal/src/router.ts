import type {
  ChatRequest,
  HealthReport,
  ProviderMode,
  RegistryEntry,
} from '@outskirts/schemas';
import type { ModelRegistry } from './registry.js';

export interface RouterOptions {
  latencyBudgetS?: number;
  latencyWeight?: number;
}

export interface RouteResolution {
  model: RegistryEntry;
  score: number;
  loaded: boolean;
  reason: string;
}

export class RoutingRefusalError extends Error {
  constructor(
    public readonly reason: 'refused-locality' | 'no-admissible-model' | 'context-exceeded' | 'capability-missing',
    message: string,
  ) {
    super(message);
    this.name = 'RoutingRefusalError';
  }
}

function estimateTokens(req: ChatRequest): number {
  let totalChars = 0;
  for (const m of req.messages) {
    totalChars += m.content.length;
  }
  return Math.ceil(totalChars / 4) + 128;
}

/**
 * Route resolution implementing Section 5.3:
 * Admissibility filter (mode, boundary, health, capabilities, context)
 * then rank by quality - wL * (loaded ? 0 : estLoadS / latencyBudget).
 */
export function resolveRoute(
  req: ChatRequest,
  mode: ProviderMode,
  registry: ModelRegistry,
  healthReports?: Map<string, HealthReport>,
  options?: RouterOptions,
): RouteResolution {
  const allModels = registry.getAll();
  const latencyBudget = options?.latencyBudgetS ?? 30;
  const wL = options?.latencyWeight ?? 0.3;
  const promptTokens = estimateTokens(req);

  // Track if any candidate was rejected specifically for locality boundary
  let rejectedForLocalityCount = 0;
  let candidatesForTaskType = 0;

  const admissible: Array<{ model: RegistryEntry; score: number; loaded: boolean }> = [];

  for (const model of allModels) {
    if (model.status !== 'enabled') {
      continue;
    }

    if (!model.taskTypes.includes(req.taskType)) {
      continue;
    }

    candidatesForTaskType++;

    // 1. Mode and Perimeter Guard
    if (mode === 'SOVEREIGN' && model.trustBoundary === 'outside-perimeter') {
      rejectedForLocalityCount++;
      continue;
    }

    // 2. Capability requirements
    if (req.outputSchemaRef && !model.capabilities.includes('guided-json')) {
      continue;
    }
    if (req.toolNames.length > 0 && !model.capabilities.includes('tool-use')) {
      continue;
    }
    if (req.seed !== null && !model.capabilities.includes('seeded')) {
      continue;
    }
    if (req.stream && !model.capabilities.includes('streaming')) {
      continue;
    }

    // 3. Context budget
    if (promptTokens > model.contextWindow) {
      continue;
    }

    // 4. Provider Health
    const health = healthReports?.get(model.providerId);
    if (health && !health.healthy) {
      continue;
    }

    // 5. Residency & Ranking
    const residentInHealth = health?.residentModels.includes(model.modelId) ?? false;
    const loaded = model.pinned || residentInHealth;
    const loadPenalty = loaded ? 0 : model.estLoadS / latencyBudget;
    const score = model.quality - wL * loadPenalty;

    admissible.push({ model, score, loaded });
  }

  if (admissible.length === 0) {
    if (candidatesForTaskType > 0 && rejectedForLocalityCount === candidatesForTaskType) {
      throw new RoutingRefusalError(
        'refused-locality',
        `All candidates for task "${req.taskType}" were refused: outside organisation perimeter in SOVEREIGN mode`,
      );
    }
    throw new RoutingRefusalError(
      'no-admissible-model',
      `No admissible model found for taskType="${req.taskType}" under mode="${mode}"`,
    );
  }

  // Sort descending by score
  admissible.sort((a, b) => b.score - a.score);

  const best = admissible[0]!;
  const reason = `Selected ${best.model.modelId} (score: ${best.score.toFixed(3)}, loaded: ${best.loaded}, provider: ${best.model.providerId})`;

  return {
    model: best.model,
    score: best.score,
    loaded: best.loaded,
    reason,
  };
}
