import { describe, expect, it } from 'vitest';
import { Recipe } from '@outskirts/schemas';
import { useAppStore } from '../src/store/index.js';

describe('Workflow Recipe Builder & DAG Validation (Section 18 / P5)', () => {
  it('validates canonical presets against the Schema Spine Recipe schema', () => {
    const valveRecipeData = {
      recipeId: 'valve-isolation-and-sizing-recipe',
      version: '1.0.0',
      title: 'Emergency Control Valve Sizing & Topology Isolation',
      description: 'Multi-stage workflow executing P&ID perception and ISA-75.01 Cv sizing',
      matches: ['size control valve', 'valve isolation boundary'],
      parameters: [],
      steps: [
        {
          stepId: 'step-1-vision',
          kind: 'vision',
          description: 'Perceive P&ID raster and extract topology',
          dependsOn: [],
          plugins: [],
          status: 'pending',
        },
        {
          stepId: 'step-2-calc',
          kind: 'calculation',
          description: 'Execute ISA-75.01 Cv calculation',
          dependsOn: ['step-1-vision'],
          plugins: ['control-valve-calc-plugin'],
          outputSchemaRef: 'ValveSizingResponse',
          status: 'pending',
        },
      ],
    };

    const parsed = Recipe.safeParse(valveRecipeData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.recipeId).toBe('valve-isolation-and-sizing-recipe');
      expect(parsed.data.steps.length).toBe(2);
      expect(parsed.data.steps[1]?.plugins).toContain('control-valve-calc-plugin');
    }
  });

  it('rejects recipes with invalid semver or empty steps', () => {
    const invalidVersion = {
      recipeId: 'bad-recipe',
      version: 'v1.0', // invalid semver format
      title: 'Bad Recipe',
      description: 'Test',
      matches: ['bad'],
      steps: [],
    };
    const res = Recipe.safeParse(invalidVersion);
    expect(res.success).toBe(false);
  });

  it('applies recipe to workbench store and synchronises Plan DAG nodes', () => {
    const store = useAppStore.getState();

    const newRecipe = {
      taskId: 'task-recipe-applied-01',
      recipeId: 'valve-isolation-and-sizing-recipe',
      steps: [
        {
          stepId: 'step-1-vision',
          kind: 'vision' as const,
          description: 'P&ID Vision Perception',
          dependsOn: [],
          plugins: [],
          status: 'pending' as const,
        },
        {
          stepId: 'step-2-sizing',
          kind: 'calculation' as const,
          description: 'ISA-75.01 Control Valve Sizing',
          dependsOn: ['step-1-vision'],
          plugins: ['control-valve-calc-plugin'],
          status: 'pending' as const,
        },
      ],
    };

    store.setPlan(newRecipe as any);

    const updated = useAppStore.getState();
    expect(updated.activeTaskId).toBe('task-recipe-applied-01');
    expect(updated.nodes.length).toBe(2);
    expect(updated.nodes[0]?.id).toBe('step-1-vision');
    expect(updated.nodes[1]?.id).toBe('step-2-sizing');
    expect(updated.nodes[1]?.dependsOn).toEqual(['step-1-vision']);
  });
});
