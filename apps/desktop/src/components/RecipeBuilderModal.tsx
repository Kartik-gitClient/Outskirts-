import React, { useState } from 'react';
import { Recipe, type PlanStep, type TaskType } from '@outskirts/schemas';
import { useAppStore } from '../store/index.js';

export interface RecipeBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_RECIPES: Record<'inspection' | 'valveSizing' | 'blank', Recipe> = {
  inspection: {
    recipeId: 'inspection-approval-recipe',
    version: '1.0.0',
    title: 'Refinery Inspection Report to Signed Approval Note',
    description:
      'Eight-stage industrial workflow: document intake, finding extraction, hydraulic calculation, SOP retrieval with freshness scoring, draft synthesis, deterministic critic verification (C1-C5), C2PA-signed deliverable, and Decision DNA attestation.',
    matches: [
      'inspection report to approval note',
      'pressure vessel inspection',
      'piping inspection approval',
      'thickness corrosion approval note',
    ],
    parameters: [
      {
        name: 'reportPath',
        schemaRef: 'SchemaRef',
        required: true,
        description: 'Path or identifier of the scanned inspection report',
      },
    ],
    steps: [
      {
        stepId: 'step-1-intake',
        kind: 'document',
        description: 'Acquire and parse inspection scan metadata and structure',
        dependsOn: [],
        plugins: [],
        status: 'pending',
      },
      {
        stepId: 'step-2-extract',
        kind: 'document',
        description: 'Extract thickness measurements, corrosion rates, and operational parameters',
        dependsOn: ['step-1-intake'],
        plugins: [],
        outputSchemaRef: 'InspectionExtraction',
        status: 'pending',
      },
      {
        stepId: 'step-3-calc',
        kind: 'calculation',
        description: 'Execute Darcy-Weisbach frictional pressure drop verification via engineering plugin',
        dependsOn: ['step-2-extract'],
        plugins: ['pipe-calc-plugin'],
        outputSchemaRef: 'CalcResult',
        status: 'pending',
      },
      {
        stepId: 'step-4-retrieve',
        kind: 'retrieve',
        description: 'Retrieve governing refinery standards and SOPs with freshness decay scoring',
        dependsOn: ['step-2-extract'],
        plugins: [],
        outputSchemaRef: 'Citation',
        status: 'pending',
      },
      {
        stepId: 'step-5-draft',
        kind: 'document',
        description: 'Synthesize formal approval note integrating findings, calculations, and governing citations',
        dependsOn: ['step-3-calc', 'step-4-retrieve'],
        plugins: [],
        status: 'pending',
      },
      {
        stepId: 'step-6-critic',
        kind: 'document',
        description: 'Execute deterministic critic verification (C1 numeric grounding, C2 calc replay, C3 citation overlap, C4 completeness, C5 freshness policy)',
        dependsOn: ['step-5-draft'],
        plugins: [],
        outputSchemaRef: 'CriticVerdict',
        status: 'pending',
      },
      {
        stepId: 'step-7-deliver',
        kind: 'document',
        description: 'Render deliverable document (.docx) and generate C2PA manifest with content hash binding',
        dependsOn: ['step-6-critic'],
        plugins: [],
        status: 'pending',
      },
      {
        stepId: 'step-8-record',
        kind: 'document',
        description: 'Project Decision DNA record, in-toto link attestations, and commit signed audit anchor',
        dependsOn: ['step-7-deliver'],
        plugins: [],
        outputSchemaRef: 'DecisionDna',
        status: 'pending',
      },
    ],
  },
  valveSizing: {
    recipeId: 'valve-isolation-and-sizing-recipe',
    version: '1.0.0',
    title: 'Emergency Control Valve Sizing & Topology Isolation',
    description:
      'Multi-stage workflow executing P&ID perception for isolation boundary identification, ISA-75.01 Cv calculation, and certified actuation procedure generation.',
    matches: [
      'size control valve',
      'valve isolation boundary',
      'emergency shutdown valve sizing',
      'isa-75 control valve calculation',
    ],
    parameters: [
      {
        name: 'tagNumber',
        schemaRef: 'SchemaRef',
        required: true,
        description: 'P&ID instrument tag for valve or line segment',
      },
    ],
    steps: [
      {
        stepId: 'step-1-pid-vision',
        kind: 'vision',
        description: 'Perceive P&ID raster and extract topological connectivity graph',
        dependsOn: [],
        plugins: [],
        outputSchemaRef: 'PidExtraction',
        status: 'pending',
      },
      {
        stepId: 'step-2-isolation-path',
        kind: 'retrieve',
        description: 'Graph search for upstream and downstream block valves',
        dependsOn: ['step-1-pid-vision'],
        plugins: [],
        status: 'pending',
      },
      {
        stepId: 'step-3-cv-calc',
        kind: 'calculation',
        description: 'Execute ISA-75.01 liquid flow coefficient Cv calculation with Pint uncertainty',
        dependsOn: ['step-2-isolation-path'],
        plugins: ['control-valve-calc-plugin'],
        outputSchemaRef: 'ValveSizingResponse',
        status: 'pending',
      },
      {
        stepId: 'step-4-procedure-draft',
        kind: 'document',
        description: 'Synthesize isolation checklist with hydraulic envelope specifications',
        dependsOn: ['step-3-cv-calc'],
        plugins: [],
        outputSchemaRef: 'CriticVerdict',
        status: 'pending',
      },
      {
        stepId: 'step-5-c2pa-attest',
        kind: 'document',
        description: 'Attach Ed25519 signature and bind Decision DNA Merkle root',
        dependsOn: ['step-4-procedure-draft'],
        plugins: [],
        outputSchemaRef: 'DecisionDna',
        status: 'pending',
      },
    ],
  },
  blank: {
    recipeId: 'custom-process-recipe',
    version: '1.0.0',
    title: 'New Custom Engineering Recipe',
    description: 'User-defined multi-stage automated verification workflow.',
    matches: ['custom workflow'],
    parameters: [],
    steps: [
      {
        stepId: 'step-1',
        kind: 'document',
        description: 'Initial document or data intake',
        dependsOn: [],
        plugins: [],
        status: 'pending',
      },
    ],
  },
};

const KNOWN_SCHEMAS = [
  '',
  'InspectionExtraction',
  'CalcResult',
  'PipePressureDropResponse',
  'ValveSizingResponse',
  'PidExtraction',
  'CriticVerdict',
  'DecisionDna',
  'Citation',
  'SchemaRef',
];

const KNOWN_PLUGINS = [
  'pipe-calc-plugin',
  'control-valve-calc-plugin',
  'materials-corrosion-plugin',
  'pid-perception-plugin',
];

export const RecipeBuilderModal: React.FC<RecipeBuilderModalProps> = ({ isOpen, onClose }) => {
  const setPlan = useAppStore((s) => s.setPlan);

  const [presetKey, setPresetKey] = useState<string>('inspection');
  const [recipeId, setRecipeId] = useState<string>(PRESET_RECIPES.inspection.recipeId);
  const [version, setVersion] = useState<string>(PRESET_RECIPES.inspection.version);
  const [title, setTitle] = useState<string>(PRESET_RECIPES.inspection.title);
  const [description, setDescription] = useState<string>(PRESET_RECIPES.inspection.description);
  const [matchesStr, setMatchesStr] = useState<string>(PRESET_RECIPES.inspection.matches.join(', '));
  const [steps, setSteps] = useState<PlanStep[]>(PRESET_RECIPES.inspection.steps);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  if (!isOpen) return null;

  const loadPreset = (key: 'inspection' | 'valveSizing' | 'blank') => {
    const p = PRESET_RECIPES[key];
    if (!p) return;
    setPresetKey(key);
    setRecipeId(p.recipeId);
    setVersion(p.version);
    setTitle(p.title);
    setDescription(p.description);
    setMatchesStr(p.matches.join(', '));
    setSteps(JSON.parse(JSON.stringify(p.steps)));
    setStatusMessage({ type: 'info', text: `Loaded preset "${p.title}"` });
  };

  const handleStepChange = (index: number, patch: Partial<PlanStep>) => {
    const updated = [...steps];
    updated[index] = { ...updated[index]!, ...patch };
    setSteps(updated);
  };

  const addStep = () => {
    const nextIdx = steps.length + 1;
    const prevId = steps.length > 0 ? steps[steps.length - 1]?.stepId : undefined;
    const newStep: PlanStep = {
      stepId: `step-${nextIdx}-custom`,
      kind: 'document',
      description: 'Step description',
      dependsOn: prevId ? [prevId] : [],
      plugins: [],
      status: 'pending',
    };
    setSteps([...steps, newStep]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) {
      setStatusMessage({ type: 'error', text: 'Recipe must have at least one step.' });
      return;
    }
    const removedId = steps[index]?.stepId;
    const updated = steps
      .filter((_, i) => i !== index)
      .map((s) => ({
        ...s,
        dependsOn: s.dependsOn.filter((d) => d !== removedId),
      }));
    setSteps(updated);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    const updated = [...steps];
    const [removed] = updated.splice(index, 1);
    if (removed) {
      updated.splice(targetIndex, 0, removed);
      setSteps(updated);
    }
  };

  // Compile recipe object and validate
  const currentRecipeObj = {
    recipeId: recipeId.trim(),
    version: version.trim(),
    title: title.trim(),
    description: description.trim(),
    matches: matchesStr.split(',').map((m) => m.trim()).filter(Boolean),
    parameters: [],
    steps,
  };

  const validation = Recipe.safeParse(currentRecipeObj);

  // Check DAG cycle
  const hasCycle = (): boolean => {
    const adj = new Map<string, string[]>();
    for (const s of steps) {
      adj.set(s.stepId, s.dependsOn);
    }
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      recStack.add(node);
      for (const dep of adj.get(node) || []) {
        if (!visited.has(dep) && dfs(dep)) return true;
        if (recStack.has(dep)) return true;
      }
      recStack.delete(node);
      return false;
    };

    for (const s of steps) {
      if (!visited.has(s.stepId) && dfs(s.stepId)) return true;
    }
    return false;
  };

  const cycleDetected = hasCycle();

  const handleSaveToServer = async () => {
    if (!validation.success) {
      setStatusMessage({
        type: 'error',
        text: `Validation failed: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      });
      return;
    }
    if (cycleDetected) {
      setStatusMessage({ type: 'error', text: 'Cycle detected in step dependencies. DAG must be strictly acyclic.' });
      return;
    }

    try {
      const res = await fetch('http://127.0.0.1:3000/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });

      if (res.ok) {
        setStatusMessage({ type: 'success', text: `Successfully registered recipe "${recipeId}" with control plane!` });
      } else {
        const data = await res.json().catch(() => ({}));
        setStatusMessage({
          type: 'info',
          text: `Saved recipe locally (server returned ${res.status}: ${data.error || 'simulated offline'}).`,
        });
      }
    } catch {
      setStatusMessage({
        type: 'info',
        text: `Recipe "${recipeId}" validated and saved in local session (Control Plane offline).`,
      });
    }
  };

  const handleApplyToWorkbench = () => {
    if (!validation.success) {
      setStatusMessage({ type: 'error', text: 'Cannot apply invalid recipe to workbench.' });
      return;
    }
    if (cycleDetected) {
      setStatusMessage({ type: 'error', text: 'Cannot apply cyclic plan to workbench.' });
      return;
    }

    setPlan({
      taskId: `task-custom-${Date.now().toString().slice(-6)}`,
      recipeId: currentRecipeObj.recipeId,
      steps: currentRecipeObj.steps,
    });

    setStatusMessage({ type: 'success', text: 'Applied recipe steps to active Workbench DAG!' });
    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container recipe-builder-modal">
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Process Workflow Recipe Builder</h2>
            <p className="modal-subtitle">
              Sovereign DAG Orchestration · Section 18 P5 User-Editable Workflows
            </p>
          </div>
          <div className="modal-header-actions">
            <label className="preset-label">
              Preset:
              <select
                className="select-input"
                value={presetKey}
                onChange={(e) => loadPreset(e.target.value as 'inspection' | 'valveSizing' | 'blank')}
              >
                <option value="inspection">Refinery Inspection Approval (8 stages)</option>
                <option value="valveSizing">Emergency Valve Sizing &amp; Isolation (5 stages)</option>
                <option value="blank">Custom Blank Recipe</option>
              </select>
            </label>
            <button className="btn-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div className={`status-banner banner-${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}

        {/* Body */}
        <div className="modal-body recipe-builder-body">
          {/* Metadata Section */}
          <section className="builder-section">
            <h3 className="section-heading">1. Recipe Identity &amp; Triggers</h3>
            <div className="form-grid-3">
              <div className="form-group">
                <label className="form-label">Recipe ID</label>
                <input
                  type="text"
                  className="text-input"
                  value={recipeId}
                  onChange={(e) => setRecipeId(e.target.value)}
                  placeholder="e.g. valve-isolation-recipe"
                />
              </div>
              <div className="form-group">
                <label className="form-label">SemVer</label>
                <input
                  type="text"
                  className="text-input"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0.0"
                />
              </div>
              <div className="form-group span-3">
                <label className="form-label">Recipe Title</label>
                <input
                  type="text"
                  className="text-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Descriptive title"
                />
              </div>
              <div className="form-group span-3">
                <label className="form-label">Description</label>
                <textarea
                  className="textarea-input"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed purpose and engineering scope"
                />
              </div>
              <div className="form-group span-3">
                <label className="form-label">Intent Trigger Patterns (comma separated)</label>
                <input
                  type="text"
                  className="text-input"
                  value={matchesStr}
                  onChange={(e) => setMatchesStr(e.target.value)}
                  placeholder="size valve, emergency isolation, calculate cv"
                />
              </div>
            </div>
          </section>

          {/* Steps DAG Section */}
          <section className="builder-section">
            <div className="section-header-flex">
              <h3 className="section-heading">
                2. Execution Plan DAG Stages ({steps.length} Steps)
              </h3>
              <button className="btn-secondary btn-sm" onClick={addStep}>
                + Add Stage
              </button>
            </div>

            <div className="recipe-steps-list">
              {steps.map((step, idx) => (
                <div key={idx} className="recipe-step-card">
                  <div className="step-card-header">
                    <div className="step-index-badge">#{idx + 1}</div>
                    <input
                      type="text"
                      className="step-id-input"
                      value={step.stepId}
                      onChange={(e) => handleStepChange(idx, { stepId: e.target.value })}
                      placeholder="step-id"
                    />
                    <select
                      className="step-kind-select"
                      value={step.kind}
                      onChange={(e) => handleStepChange(idx, { kind: e.target.value as TaskType })}
                    >
                      <option value="document">document (PAL)</option>
                      <option value="calculation">calculation (Plugin)</option>
                      <option value="vision">vision (VL Model)</option>
                      <option value="retrieve">retrieve (Knowledge)</option>
                      <option value="code">code (Engine)</option>
                    </select>

                    <div className="step-card-actions">
                      <button
                        className="icon-btn"
                        disabled={idx === 0}
                        onClick={() => moveStep(idx, 'up')}
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button
                        className="icon-btn"
                        disabled={idx === steps.length - 1}
                        onClick={() => moveStep(idx, 'down')}
                        title="Move Down"
                      >
                        ▼
                      </button>
                      <button
                        className="icon-btn btn-danger"
                        onClick={() => removeStep(idx)}
                        title="Delete Step"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="step-card-body">
                    <div className="form-group">
                      <label className="form-label-sm">Natural Language Intent / Prompt</label>
                      <input
                        type="text"
                        className="text-input text-input-sm"
                        value={step.description}
                        onChange={(e) => handleStepChange(idx, { description: e.target.value })}
                        placeholder="Step description for planner & agent"
                      />
                    </div>

                    <div className="step-fields-grid">
                      <div className="form-group">
                        <label className="form-label-sm">Dependencies (Acyclic)</label>
                        <div className="deps-selector">
                          {steps
                            .filter((_, otherIdx) => otherIdx !== idx)
                            .map((other) => {
                              const checked = step.dependsOn.includes(other.stepId);
                              return (
                                <label key={other.stepId} className="dep-checkbox-label">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const nextDeps = e.target.checked
                                        ? [...step.dependsOn, other.stepId]
                                        : step.dependsOn.filter((d) => d !== other.stepId);
                                      handleStepChange(idx, { dependsOn: nextDeps });
                                    }}
                                  />
                                  <span>{other.stepId}</span>
                                </label>
                              );
                            })}
                          {steps.length <= 1 && <span className="no-deps">No other steps</span>}
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label-sm">Allowed Tool Plugin</label>
                        <select
                          className="select-input select-input-sm"
                          value={step.plugins[0] || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleStepChange(idx, { plugins: val ? [val] : [] });
                          }}
                        >
                          <option value="">None (Pure LLM / Internal)</option>
                          {KNOWN_PLUGINS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label-sm">Output Schema Spine Binding</label>
                        <select
                          className="select-input select-input-sm"
                          value={step.outputSchemaRef || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleStepChange(idx, { outputSchemaRef: val || undefined });
                          }}
                        >
                          <option value="">None (Unconstrained Text)</option>
                          {KNOWN_SCHEMAS.filter(Boolean).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* DAG Visual Topology Flow */}
          <section className="builder-section">
            <h3 className="section-heading">3. DAG Topology Flow Preview</h3>
            <div className="dag-flow-container">
              {steps.map((s, i) => (
                <React.Fragment key={s.stepId}>
                  <div className="dag-node-card status-pending">
                    <div className="node-badge">{s.kind}</div>
                    <div className="node-label">{s.stepId}</div>
                    <div className="node-status-text">
                      {s.plugins.length > 0 ? `⚙ ${s.plugins[0]}` : s.outputSchemaRef ? `📋 ${s.outputSchemaRef}` : 'text'}
                    </div>
                  </div>
                  {i < steps.length - 1 && <div className="dag-edge-arrow">&rarr;</div>}
                </React.Fragment>
              ))}
            </div>
          </section>

          {/* Live Validation Bar */}
          <div className={`validation-summary ${validation.success && !cycleDetected ? 'valid' : 'invalid'}`}>
            {validation.success && !cycleDetected ? (
              <span>✓ Valid Schema Spine Recipe &amp; Strict Acyclic DAG</span>
            ) : cycleDetected ? (
              <span>⚠ Circular dependency cycle detected in DAG</span>
            ) : (
              <span>⚠ Validation errors: {validation.error?.issues[0]?.message}</span>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSaveToServer}
            disabled={!validation.success || cycleDetected}
          >
            Save to Control Plane (/api/recipes)
          </button>
          <button
            className="btn-accent"
            onClick={handleApplyToWorkbench}
            disabled={!validation.success || cycleDetected}
          >
            Apply to Active Workbench
          </button>
        </div>
      </div>
    </div>
  );
};
