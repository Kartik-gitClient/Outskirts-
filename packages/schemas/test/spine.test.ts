import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { SCHEMA_REGISTRY, resolveSchema, type SchemaName } from '../src/index.js';

/**
 * The spine's load-bearing claim is that TypeScript and Python are validating
 * the same contract. Python is not in this process, but the artefact it
 * consumes is -- so the test is that the generated JSON Schema accepts exactly
 * what the Zod source accepts. If those two ever disagree, the two planes have
 * silently diverged and no amount of type-checking on either side would notice.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '..', 'build', 'schema');

function loadGenerated(name: string): object {
  const path = join(SCHEMA_DIR, `${name}.json`);
  if (!existsSync(path)) throw new Error(`${name}.json not generated. Run: pnpm schema:build`);
  return JSON.parse(readFileSync(path, 'utf8')) as object;
}

function makeAjv() {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv;
}

/**
 * Ajv caches by $id and refuses to compile the same schema twice into one
 * instance, so validators are memoised per name rather than compiled per
 * assertion.
 */
function validatorFactory() {
  const ajv = makeAjv();
  const cache = new Map<string, ReturnType<typeof ajv.compile>>();
  return (name: string) => {
    let v = cache.get(name);
    if (!v) {
      v = ajv.compile(loadGenerated(name));
      cache.set(name, v);
    }
    return v;
  };
}

const NAMES = Object.keys(SCHEMA_REGISTRY) as SchemaName[];

describe('registry', () => {
  it('exports a non-trivial number of contracts', () => {
    expect(NAMES.length).toBeGreaterThan(40);
  });

  it('resolves every registered name', () => {
    for (const name of NAMES) {
      expect(resolveSchema(name)).toBeDefined();
    }
  });

  it('fails loudly on an unknown ref, listing what is valid', () => {
    expect(() => resolveSchema('NoSuchSchema')).toThrowError(/Unknown schema ref "NoSuchSchema"/);
    expect(() => resolveSchema('NoSuchSchema')).toThrowError(/PlanStep/);
  });
});

describe('generated artefact', () => {
  it('has one committed file per registry entry', () => {
    for (const name of NAMES) {
      expect(() => loadGenerated(name)).not.toThrow();
    }
  });

  it('compiles under a standards-compliant JSON Schema validator', () => {
    const compile = validatorFactory();
    for (const name of NAMES) {
      expect(() => compile(name), `${name} failed to compile`).not.toThrow();
    }
  });

  it('records a matching index with per-schema hashes', () => {
    const index = JSON.parse(readFileSync(join(SCHEMA_DIR, 'index.json'), 'utf8')) as {
      count: number;
      schemas: Array<{ name: string; sha256: string }>;
    };
    expect(index.count).toBe(NAMES.length);
    expect(index.schemas.every((s) => /^[a-f0-9]{64}$/.test(s.sha256))).toBe(true);
  });
});

/**
 * Representative fixtures spanning every kind of construct in the spine:
 * enums, nested objects, arrays, optionals, defaults, records and a
 * discriminated union.
 */
const VALID: Partial<Record<SchemaName, unknown>> = {
  PlanStep: {
    stepId: 'step-1',
    kind: 'vision',
    description: 'Extract findings from the scanned report',
    dependsOn: [],
    plugins: ['perception'],
    outputSchemaRef: 'InspectionExtraction',
    status: 'pending',
  },
  CriticVerdict: {
    taskId: 'task-1',
    stepId: 'step-4',
    gate: 'fail',
    deterministicPass: false,
    verdicts: [
      {
        claimId: 'claim-2',
        check: 'C1_NUMERIC_GROUNDING',
        pass: false,
        offending: '4.7 mm',
        note: 'No source contains this value',
      },
    ],
    repairTarget: 'step-4',
    repairsUsed: 1,
    escalated: false,
  },
  PalAuditEvent: {
    eventId: 'evt-1',
    seq: 42,
    ts: '2026-09-12T10:00:00.000Z',
    taskId: 'task-1',
    stepId: 'step-2',
    providerId: 'ollama',
    locality: 'loopback',
    trustBoundary: 'inside-perimeter',
    endpointHost: '127.0.0.1:11434',
    model: 'qwen3.8:27b',
    modelDigest: 'sha256:abc',
    quantisation: 'Q4_K_M',
    contextWindow: 32768,
    promptTemplateHash: 'tmpl-9f2c',
    seed: 7,
    cacheHit: false,
    tokensIn: 1200,
    tokensOut: 340,
    latencyMs: 8100,
    loadMs: 0,
    status: 'ok',
  },
  InspectionExtraction: {
    documentId: 'doc-1',
    findings: [
      {
        findingId: 'f-1',
        equipmentTag: 'P-101A',
        description: 'Casing wall thinning at the discharge nozzle',
        measuredValue: 6.2,
        measuredUnit: 'mm',
        limitValue: 7.0,
        limitUnit: 'mm',
        severity: 'major',
      },
    ],
  },
  CalcResult: {
    calcId: 'calc-1',
    tool: 'pipe_pressure_drop',
    correlation: 'Darcy-Weisbach / Colebrook',
    inputs: { length: { value: 120, unit: 'm' } },
    result: { value: 1.83, unit: 'bar', uncertainty: 0.04 },
    steps: [{ ordinal: 0, description: 'Reynolds number', expression: 'rho*v*D/mu' }],
    assumptions: ['Isothermal flow'],
    validityWarnings: [],
  },
  ServerEvent: {
    type: 'router.decision',
    seq: 3,
    ts: '2026-09-12T10:00:00.000Z',
    taskId: 'task-1',
    stepId: 'step-2',
    taskType: 'vision',
    model: 'qwen3.8:27b',
    providerId: 'ollama',
    locality: 'loopback',
    trustBoundary: 'inside-perimeter',
    reason: 'drawing understanding requires the vision specialist',
    wasFallback: false,
  },
  AuditEvent: {
    eventId: 'evt-2',
    seq: 43,
    ts: '2026-09-12T10:00:01.000Z',
    kind: 'mode.transition',
    prevHash: 'a'.repeat(64),
    payloadHash: 'b'.repeat(64),
    payload: { from: 'ASSIST', to: 'SOVEREIGN', actor: 'admin-1' },
  },
};

describe('Zod and the generated schema agree', () => {
  const validatorFor = validatorFactory();

  for (const [name, fixture] of Object.entries(VALID) as Array<[SchemaName, unknown]>) {
    it(`${name}: both accept a valid instance`, () => {
      const zodResult = resolveSchema(name).safeParse(fixture);
      expect(zodResult.success, `Zod rejected: ${JSON.stringify(zodResult.error?.issues)}`).toBe(true);

      const validate = validatorFor(name);
      expect(validate(fixture), `ajv rejected: ${JSON.stringify(validate.errors)}`).toBe(true);
    });

    it(`${name}: both reject an unknown field`, () => {
      const polluted = { ...(fixture as object), __injected: 'should not be accepted' };
      const validate = validatorFor(name);
      // Closed objects are what stop a constrained decoder inventing fields.
      expect(validate(polluted)).toBe(false);
    });
  }

  it('both reject a wrong enum value', () => {
    const bad = { ...(VALID.PlanStep as object), kind: 'telepathy' };
    expect(resolveSchema('PlanStep').safeParse(bad).success).toBe(false);
    expect(validatorFor('PlanStep')(bad)).toBe(false);
  });

  it('both reject a missing required field', () => {
    const { stepId: _omitted, ...bad } = VALID.PlanStep as Record<string, unknown>;
    expect(resolveSchema('PlanStep').safeParse(bad).success).toBe(false);
    expect(validatorFor('PlanStep')(bad)).toBe(false);
  });

  it('both reject a wrong discriminator variant payload', () => {
    const bad = { type: 'router.decision', seq: 1, ts: '2026-09-12T10:00:00.000Z', taskId: 't' };
    expect(resolveSchema('ServerEvent').safeParse(bad).success).toBe(false);
    expect(validatorFor('ServerEvent')(bad)).toBe(false);
  });
});

describe('decoding-constraint suitability', () => {
  it('closes every object that is a model output contract', () => {
    // If any of these were open, a model could invent fields and still validate.
    for (const name of ['PlanStep', 'Plan', 'InspectionExtraction', 'DrawingExtraction', 'CalcResult'] as const) {
      const schema = loadGenerated(name) as Record<string, unknown>;
      expect(schema['additionalProperties'], `${name} is not closed`).toBe(false);
    }
  });

  it('keeps deliberately open records open', () => {
    const auditEvent = loadGenerated('AuditEvent') as {
      properties: { payload: Record<string, unknown> };
    };
    // AuditEvent.payload is a z.record: kind-specific, so it cannot be closed.
    expect(auditEvent.properties.payload['additionalProperties']).not.toBe(false);
  });

  it('does not require fields that carry defaults', () => {
    // Forcing a model to emit defaulted fields wastes tokens for no benefit.
    const planStep = loadGenerated('PlanStep') as { required: string[] };
    expect(planStep.required).toEqual(['stepId', 'kind', 'description']);
    expect(planStep.required).not.toContain('status');
    expect(planStep.required).not.toContain('dependsOn');
  });
});
