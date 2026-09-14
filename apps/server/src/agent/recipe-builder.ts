import type { Id, PlanStep, Recipe } from '@outskirts/schemas';

export class RecipeBuilder {
  private recipeId: Id;
  private version: string;
  private title: string;
  private description: string;
  private matches: string[] = [];
  private steps: PlanStep[] = [];

  constructor(recipeId: Id, title: string, description: string, version = '1.0.0') {
    this.recipeId = recipeId;
    this.title = title;
    this.description = description;
    this.version = version;
  }

  public setMatches(matches: string[]): this {
    this.matches = matches;
    return this;
  }

  public addStep(step: PlanStep): this {
    if (this.steps.some((s) => s.stepId === step.stepId)) {
      throw new Error(`Step "${step.stepId}" already exists in recipe "${this.recipeId}"`);
    }
    this.steps.push(step);
    return this;
  }

  public removeStep(stepId: string): this {
    this.steps = this.steps.filter((s) => s.stepId !== stepId);
    return this;
  }

  /**
   * Validate DAG properties:
   * 1. No duplicate stepIds
   * 2. Step count >= 1
   * 3. Dependencies exist
   */
  public validate(): boolean {
    if (this.steps.length === 0) {
      throw new Error(`Recipe "${this.recipeId}" must have at least one step`);
    }

    const stepIds = new Set(this.steps.map((s) => s.stepId));
    for (const step of this.steps) {
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (!stepIds.has(dep)) {
            throw new Error(`Step "${step.stepId}" depends on non-existent step "${dep}"`);
          }
        }
      }
    }

    return true;
  }

  public build(): Recipe {
    this.validate();

    return {
      recipeId: this.recipeId,
      version: this.version,
      title: this.title,
      description: this.description,
      matches: this.matches.length > 0 ? this.matches : [this.title.toLowerCase()],
      parameters: [],
      steps: JSON.parse(JSON.stringify(this.steps)),
    };
  }
}

/**
 * In-memory library of editable user workflows.
 */
export class RecipeLibrary {
  private recipes = new Map<string, Recipe>();

  constructor(initialRecipes?: Recipe[]) {
    if (initialRecipes) {
      for (const r of initialRecipes) {
        this.recipes.set(r.recipeId, r);
      }
    }
  }

  public registerRecipe(recipe: Recipe): void {
    this.recipes.set(recipe.recipeId, recipe);
  }

  public getRecipe(recipeId: string): Recipe | undefined {
    return this.recipes.get(recipeId);
  }

  public listRecipes(): Recipe[] {
    return Array.from(this.recipes.values());
  }

  public deleteRecipe(recipeId: string): boolean {
    return this.recipes.delete(recipeId);
  }
}
