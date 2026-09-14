import {
  DecisionDna,
  type AuditEvent,
  type Id,
  type Sha256,
  type Seq,
} from '@outskirts/schemas';
import { sha256Hex, canonicalJsonStringify } from './canonical.js';

export interface ProjectDnaInput {
  dnaId?: Id;
  taskId: Id;
  goal: string;
  recipeId?: Id;
  modeAtLaunch: 'SOVEREIGN' | 'ASSIST';
  planHash?: Sha256;
  planDefinition?: unknown;
  steps: Array<{
    stepId: Id;
    kind: string;
    model: string;
    modelDigest: string;
    providerId: string;
    locality: string;
    trustBoundary: string;
    promptTemplateHash: string;
    seed: number | null;
    toolCalls: Array<{ tool: string; inputHash: Sha256; outputHash: Sha256 }>;
  }>;
  citations?: Array<{
    citationId: Id;
    documentId: Id;
    decayAtCitation: number;
    stateAtCitation: string;
  }>;
  criticGate: 'pass' | 'fail';
  deterministicPass: boolean;
  overrides?: Array<{ actorId: Id; at: string; note: string }>;
  artifactHashes: Sha256[];
  c2paManifestRef?: string;
  chainSeqLow: Seq;
  chainSeqHigh: Seq;
}

/**
 * Project task execution and audit events into a validated Decision DNA record.
 */
export function projectDecisionDna(input: ProjectDnaInput): DecisionDna {
  const dnaId = input.dnaId ?? `dna-${input.taskId}`;
  const planHash =
    input.planHash ??
    (input.planDefinition ? sha256Hex(canonicalJsonStringify(input.planDefinition)) : '0'.repeat(64));

  const candidate = {
    dnaId,
    taskId: input.taskId,
    goal: input.goal,
    recipeId: input.recipeId,
    modeAtLaunch: input.modeAtLaunch,
    planHash,
    steps: input.steps,
    citations: input.citations ?? [],
    criticGate: input.criticGate,
    deterministicPass: input.deterministicPass,
    overrides: input.overrides ?? [],
    artifactHashes: input.artifactHashes,
    c2paManifestRef: input.c2paManifestRef,
    chainSeqLow: input.chainSeqLow,
    chainSeqHigh: input.chainSeqHigh,
  };

  return DecisionDna.parse(candidate);
}

/**
 * in-toto compatible attestation structure.
 * Maps plan DAG to in-toto layout, step metadata to in-toto link attestations,
 * and artifact hashes to materials/products.
 */
export interface InTotoLinkMetadata {
  _type: 'https://in-toto.io/Statement/v1';
  subject: Array<{ name: string; digest: { sha256: string } }>;
  predicateType: 'https://in-toto.io/attestation/link/v0.3';
  predicate: {
    name: string;
    command: string[];
    materials: Record<string, { sha256: string }>;
    products: Record<string, { sha256: string }>;
    byproducts: {
      model: string;
      modelDigest: string;
      providerId: string;
      locality: string;
      trustBoundary: string;
    };
    environment: {
      mode: string;
      taskType: string;
    };
  };
}

export function exportInTotoLinks(dna: DecisionDna): InTotoLinkMetadata[] {
  return dna.steps.map((step) => ({
    _type: 'https://in-toto.io/Statement/v1',
    subject: dna.artifactHashes.map((h, idx) => ({
      name: `artifact-${idx + 1}`,
      digest: { sha256: h },
    })),
    predicateType: 'https://in-toto.io/attestation/link/v0.3',
    predicate: {
      name: step.stepId,
      command: [step.kind],
      materials: Object.fromEntries(
        step.toolCalls.map((tc) => [`tool-input-${tc.tool}`, { sha256: tc.inputHash }]),
      ),
      products: Object.fromEntries(
        step.toolCalls.map((tc) => [`tool-output-${tc.tool}`, { sha256: tc.outputHash }]),
      ),
      byproducts: {
        model: step.model,
        modelDigest: step.modelDigest,
        providerId: step.providerId,
        locality: step.locality,
        trustBoundary: step.trustBoundary,
      },
      environment: {
        mode: dna.modeAtLaunch,
        taskType: step.kind,
      },
    },
  }));
}
