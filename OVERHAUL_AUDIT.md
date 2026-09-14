# Outskirts — Implementation Audit & Overhaul List

**Audited:** 12 September 2026 · working tree at `D:\Outskirts`, 0 commits  
**Against:** Final Technical Plan v2.0  
**Scale:** 21,830 lines TS/TSX/Py · 139 tests · typecheck clean · all tests green · `schema:check` green  

---

## 0. The Headline

It is not broken. It compiles under `strict` with `noUncheckedIndexedAccess`, every test passes, and the repository layout follows §17 of the plan almost exactly. That reflects real discipline and is worth stating up front.

The core issue is different and specific:

> **The shape of the plan was implemented. The substance was not.**  
> Structural fidelity ≈ 80%. Functional fidelity ≈ 30%.

Roughly 40% of the codebase is high-integrity and should be retained — the cryptographic audit chain implementation exceeds the original specification. Another 35% consists of interface contracts with simulated or stubbed internal logic. And approximately 25% of the planned architecture has not yet been implemented, including two major subsystems.

The root cause is a recurring architectural pattern: the specification called for integrating mature, vetted open-source libraries, whereas the implementation substituted hand-written TypeScript stubs. Notably, the following specified libraries are currently absent across all `package.json` manifests:

`mongodb` · `qdrant` · `text-embeddings-inference` · `langgraph` · `react-flow` · `extism` · `docling` · `paddleocr` · `rf-detr` · `sahi` · `c2pa` · `cedar` · `syft`

Similarly, in the Python services, `requirements.txt` specifies `fluids`, `CoolProp`, `Pint`, and `sympy`, yet the application code imports only standard `math`.

The rationale for the two-plane architecture (§1, Principle 6) was that these specialized libraries already solve the underlying technical challenges. Re-implementing simplified wrappers while maintaining multi-language deployment adds operational overhead without the functional capabilities of the underlying ecosystems.

---

## 1. Triage Summary

| # | Component | Verdict | Severity |
|---|---|---|---|
| 1 | `packages/sovereignty` chain + verifier | **KEEP** — exceeds spec | — |
| 2 | `packages/schemas` spine | **KEEP** — intact, 47 schemas | — |
| 3 | `packages/knowledge/freshness.ts` | **KEEP** | — |
| 4 | Plugin admission (Ed25519 + trust root) | **KEEP** | — |
| 5 | Critic C1/C3/C4/C5 logic | **KEEP**, extend | — |
| 6 | `packages/pal` adapters | **FIX** — critical guided-decoding bug | P0 |
| 7 | Engineering `/health` reports unimported dependencies | **FIX NOW** | P0 |
| 8 | P&ID detector evaluates against provided input tags | **REPLACE** | P0 |
| 9 | Negative-case plugin test lacks capability boundary | **REPLACE** | P0 |
| 10 | C2PA custom JSON shim | **REPLACE** | P1 |
| 11 | Plugin runtime lacks WASM sandbox isolation | **BUILD** | P0 |
| 12 | Checkpointer relies on in-memory `Map` | **FIX** | P1 |
| 13 | Desktop application lacks Tauri native shell | **BUILD** | P1 |
| 14 | Missing Knowledge Retrieval Layer (L6) | **BUILD** | P1 |
| 15 | Missing Perception & OCR Pipeline (L7) | **BUILD** | P1 |
| 16 | Specialized engineering libraries unutilized (L8) | **REPLACE** | P1 |
| 17 | Python schemas manually duplicated (contract drift) | **FIX** | P0 |
| 18 | Network isolation verification test unexecuted | **RUN IT** | P0 |
| 19 | `plugins/` directory empty | **BUILD** | P2 |
| 20 | Repository hygiene & scope alignment | **CLEAN** | P2 |

---

## 2. Category A — Non-Introspected Telemetry & Simulated Evaluators

Four locations where runtime telemetry or evaluation harnesses return pre-determined values rather than measuring live state. In a zero-trust, verifiable sovereign architecture, reporting unverified metrics undermines confidence in the platform's verifiable truth guarantees.

### A1. `/health` reports dependency versions without package introspection

`services/engineering/main.py:71`

```python
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "libraries": ["fluids-1.0.26", "CoolProp-6.6.0", "Pint-0.24.4", "sympy-1.13.3"],
        "network": "internal-backplane",
    }
```

The file imports only `math`, `typing`, `fastapi`, and `pydantic`. This endpoint returns a hardcoded manifest for four libraries that are neither imported nor executed by the service.

**Impact:** A health check must report live runtime status. If packages are uninstalled or missing, the endpoint continues to report static versions, preventing automated monitoring from detecting runtime degradation.

**Remediation:** Dynamically introspect installed package versions via `importlib.metadata` and expose missing dependencies transparently:

```python
import importlib.metadata as md

def _version(pkg: str) -> str | None:
    try:
        return md.version(pkg)
    except md.PackageNotFoundError:
        return None

@app.get("/health")
def health_check():
    libs = {p: _version(p) for p in ("fluids", "CoolProp", "Pint", "sympy")}
    missing = [k for k, v in libs.items() if v is None]
    return {
        "status": "degraded" if missing else "healthy",
        "libraries": libs,
        "missing": missing,
    }
```

Add a startup assertion so the service refuses to bind if essential dependencies are unresolvable.

### A2. P&ID evaluation pipeline consumes ground-truth tags as inputs

`services/perception/pid-detector.ts:38`

```ts
public extractTags(drawingId: string, groundTruthTags: DrawingTag[], noise = false): DrawingExtraction {
  for (const gt of groundTruthTags) {
    const jitterX = noise ? (Math.random() - 0.5) * 4 : 0;
    const detected: DrawingTag = {
      tagNumber: gt.tagNumber,          // echoed from input
      symbolClass: gt.symbolClass,      // echoed from input
      detectorConfidence: Number((0.95 + Math.random() * 0.04).toFixed(3)),  // synthetic score
      bbox: { x: gt.bbox.x + jitterX, ... },
    };
```

The function accepts `groundTruthTags` directly and echoes them back with random coordinate jitter and synthetic confidence scores (0.95–0.99). Precision and recall against this function yield ~1.0 by definition because the test evaluates identical data structures against themselves.

**Impact:** Milestone P3 exit criteria ("P&ID tag precision and recall measured against independently verified ground truth") cannot be measured by this implementation.

**Remediation:** Remove `extractTags`. Retain `computeBBoxIoU` and the metrics calculation structures as the valid evaluation harness. Implement the planned perception pipeline in Python per §7.2 (SAHI tiling → RF-DETR → localized crop OCR → multimodal feature extraction). Until the real vision model is wired, mark the corresponding benchmark row as `UNMEASURED`.

### A3. Negative-case plugin test relies on exception string inspection

`packages/plugin-sdk/test/negative-case.test.ts` (test handler) & `host.ts:107`:

```ts
const handlers = {
  net_call_without_capability: async () => {
    throw new Error('Egress blocked: network socket forbidden by capability sandbox');
  },
};
```

```ts
// host.ts:107
if (errStr.includes('network') || errStr.includes('socket') || errStr.includes('fetch')) {
  this.emitAlert('egress-blocked', pluginId, ...);
}
```

The guest handler raises an explicit error string, and the host inspects `errStr` for target substrings (`network`, `socket`, `fetch`) before recording an egress event. In-process execution via `PluginHost` currently uses `Map<string, ToolHandler>` with standard in-process execution authority.

**Impact:**
1. Sandboxed network denial is not enforced by a capability-restricted runtime boundary.
2. The alert pipeline is susceptible to false positives triggered by arbitrary error messages containing matching substrings.

**Remediation:** Adopt Extism (BSD-3) WebAssembly runtime. Configure plugins with explicit capability manifests (network capability omitted by default). In the negative-case test suite, execute a genuine network request from the WASM guest, verifying that the host-level WebAssembly boundary denies socket creation.

Target plugin structure:
```
plugins/demo-net-denied/     # attempts network request from WASM; rejected by host boundary
plugins/demo-foreign-key/    # signature rejection via unlisted key; fully operational
```

### A4. C2PA manifest builder uses non-conformant JSON shim

`apps/server/src/provenance/c2pa.ts:94` — specifies `claimGenerator: '... (c2pa-rs shim)'` without an underlying C2PA library dependency. The module synthesizes a custom JSON structure modeling C2PA attributes.

**Impact:** Specification §11.2 mandates C2PA compliance to enable offline verification of exported deliverables via standard external tools (`c2patool`). A proprietary JSON structure cannot be parsed or validated by standard-compliant third-party readers.

**Remediation:** Integrate the official `c2patool` CLI binary or bind `c2pa-rs` via native bindings. If direct document embedding (.docx) is unsupported by current toolchains, generate standard sidecar manifests cryptographically bound to the primary document hash. Label the current implementation `provenance-stub.ts` until standard compliance is integrated.

---

## 3. Category B — Mechanism Deficiencies

### B1. Guided JSON decoding schema omitted in model adapters

`packages/pal/src/vllm.ts:66`:
```ts
payload.guided_json = req.outputSchemaRef;   // sends the schema name string "PlanStep"
```

`packages/pal/src/ollama.ts:70`:
```ts
if (req.outputSchemaRef) payload.format = 'json';   // passes generic "json" mode string
```

vLLM's `guided_json` expects a complete JSON Schema definition object, while Ollama's structured output mode requires the schema object. `resolveSchema()` — intended to translate schema identifiers into resolved JSON Schema objects — is not invoked within `packages/pal/`.

**Impact:** Foundation models are prompted in unconstrained text mode and validated post-hoc, leading to higher retry rates and output variance on complex extraction steps.

**Remediation:** Resolve and pass the compiled JSON Schema object directly into the inference engines:

```ts
import { resolveSchema } from '@outskirts/schemas';
import { z } from 'zod';

// vLLM payload configuration
if (req.outputSchemaRef) {
  payload.response_format = {
    type: 'json_schema',
    json_schema: {
      name: req.outputSchemaRef,
      schema: z.toJSONSchema(resolveSchema(req.outputSchemaRef), { target: 'draft-7' }),
    },
  };
}

// Ollama payload configuration
if (req.outputSchemaRef) {
  payload.format = z.toJSONSchema(resolveSchema(req.outputSchemaRef), { target: 'draft-7' });
}
```

Prefer loading pre-compiled JSON schemas from `packages/schemas/build/schema/<Name>.json` to ensure bit-identical schema definitions across TypeScript and Python runtimes. Add unit tests verifying outbound adapter payloads include valid schema objects containing explicit `properties`.

### B2. Volatile in-memory task checkpointing

`apps/server/src/agent/checkpointer.ts:18`:
```ts
private store = new Map<string, TaskCheckpoint>();
```

**Impact:** Application restarts clear active execution state, precluding task recovery and long-running execution continuity. Durable storage for `auditEvents` is required to back the cryptographic event log.

**Remediation:** Implement a persistent store backed by MongoDB / SQLite behind the existing `Checkpointer` interface. Retain the `Map` implementation as an in-memory double for unit tests.

### B3. Contract drift between TypeScript and Python data models

`services/perception/main.py` maintains hand-written Pydantic models with minor structural variations:

```python
class BBoxModel(BaseModel):
    page: int = 1                      # TypeScript schema: 'page' is required, no default
class DrawingTagModel(BaseModel):
    detectorConfidence: float = 0.98   # TypeScript schema: 'detectorConfidence' is required, no default
```

**Impact:** Schema divergence between the TypeScript control plane and Python perception workers allows payload mismatches across network boundaries.

**Remediation:** Enforce single-source code generation in CI using `datamodel-code-generator`:

```bash
datamodel-codegen --input packages/schemas/build/schema \
  --input-file-type jsonschema \
  --output services/_generated/outskirts_schemas.py \
  --target-python-version 3.12 \
  --use-standard-collections
```

Remove manual Pydantic declarations and bind services to generated definitions under Python 3.12.

### B4. Network isolation verification script unexecuted

`deploy/verify-egress.sh` exists and is syntactically valid, but containerized network isolation tests have not yet been run against live daemon containers.

**Impact:** System sovereignty requires empirical verification of container network policies (`internal: true`).

**Remediation:** Execute `deploy/verify-egress.sh` in the target container environment, verify local port accessibility, and archive execution logs in the repository.

---

## 4. Category C — Unimplemented Planned Modules

| Subsystem | Specification Plan | Current Implementation |
|---|---|---|
| **L6 Knowledge** | Local ingestion, chunking, `bge-m3` embeddings, Qdrant hybrid search, RRF fusion, `bge-reranker` | `packages/knowledge/src/` provides `freshness.ts` and `index.ts`. Retrieval pipelines remain unintegrated. |
| **L7 Perception** | Docling, PaddleOCR, PP-StructureV3, Table Transformer, RF-DETR, SAHI tiling | Python service uses FastAPI, Pillow, Shapely, and NumPy without layout parsing or OCR pipelines. |
| **L1 Desktop** | Tauri 2 native shell, webview CSP restricting remote origins, loopback token binding | Vite / React application currently running in browser/standard web runtime without native Tauri container. |
| **L8 Engineering** | `fluids`, `CoolProp`, `Pint`, `SymPy` | Hand-written formulas in `math`. Unit checking, dimensional analysis, and symbolic verification are unlinked. |
| **L5 Plugins** | 6 production capabilities + 3 demo plugins + 2 negative-case tests as signed packages | `plugins/` directory is unpopulated. |

Completing L6 and L7 is critical for supporting the primary end-to-end ingestion and extraction pipeline from raw scanned documentation.

---

## 5. Category D — Scope Alignment & Repository Hygiene

| Item | Observation | Recommended Action |
|---|---|---|
| `ArchitectureBlueprintScreen.tsx` | Dedicated view displaying the application's internal architecture | Retain as an optional developer/debug view or consolidate into documentation. |
| `N8nMeshCanvas.tsx` | Component naming references an external project with non-permissive licensing | Rename to `WorkflowCanvas.tsx` and align graph rendering with standard MIT libraries (e.g., React Flow). |
| `apps/desktop/dist/` | Compiled distribution assets present in version control | Add `dist/` to `.gitignore` and remove tracked build artifacts. |
| `packages/sovereignty/src/sbom.ts` | Custom script generating an internal software bill of materials | Integrate standard tooling (e.g., Syft) to generate validated CycloneDX / SPDX SBOM manifests. |
| Version control history | Working tree contains uncommitted files across new features | Commit changes in logical, reviewable functional increments. |
| Test distribution | Test suite heavily concentrates on core cryptographic modules | Expand integration test coverage across perception, knowledge, and execution adapters. |

---

## 6. Architecture Conformance by Subsystem

| Subsystem | Structural Conformance | Functional Conformance | Notes |
|---|---|---|---|
| **L1 Desktop Shell** | 70% | 35% | UI screens and workflows complete; Tauri containerization pending. |
| **L2 API Gateway** | 80% | 50% | Fastify HTTP + WebSocket event pipeline operating; authentication intact. |
| **L3 Agent Core** | 85% | 45% | Task planner, DAG execution, and recipe definitions complete; persistent storage pending. |
| **L4 Model Routing (PAL)** | 90% | 65% | Model adapters and context budgeting implemented; guided JSON decoding needs schema binding. |
| **L5 Plugin Framework** | 60% | 30% | Ed25519 signature admission operational; WASM sandboxing required. |
| **L6 Knowledge Retrieval** | 15% | 15% | Freshness decay algorithm complete; embedding and vector search unintegrated. |
| **L7 Perception Pipeline** | 20% | 5% | Service endpoints and schema structures defined; vision/OCR models unlinked. |
| **L8 Engineering Kernels** | 70% | 25% | API contracts and formulas functional; specialized Python libraries unintegrated. |
| **L9 Sovereignty Engine** | 85% | 60% | Merkle tree and audit chain exceed spec; C2PA uses custom structure. |
| **L10 Deployment Topology** | 40% | 20% | Docker Compose and shell scripts authored; automated execution unverified. |

**Weighted Assessment: ~80% Structural Conformance, ~30% Functional Conformance.**

The core architecture, schema contracts, and interface definitions are solid and well-structured. Transitioning the platform to full operational readiness requires replacing interface stubs with the specified library ecosystems and connecting end-to-end data pipelines.

---

## 7. Remediation Roadmap

### Phase 1: Telemetry & Evaluation Sanitization (Immediate)

1. **A1** — Update `services/engineering/main.py:71` `/health` to introspect dependencies dynamically via `importlib.metadata`.
2. **A2** — Remove `extractTags` from `services/perception/pid-detector.ts`. Retain `computeBBoxIoU` evaluation logic and mark unmeasured metrics as `UNMEASURED`.
3. **A3** — Remove substring error parsing in `host.ts`. Mark negative-case plugin test as pending runtime capability implementation.
4. **A4** — Rename `c2pa.ts` to `provenance-stub.ts` and remove external shim references until official libraries are bound.
5. Record clean baseline commit in version control.

### Phase 2: Core Mechanism Restoration (Short-Term)

6. **B1** — Wire `resolveSchema()` into `vllm.ts` and `ollama.ts` to pass structured JSON Schema objects to inference endpoints; add payload regression tests.
7. **B3** — Configure `datamodel-codegen` in CI to generate Python data models directly from `packages/schemas/build/schema`.
8. **B4** — Execute `deploy/verify-egress.sh` in the container environment and archive verification output.
9. **A3 / L5** — Implement Extism WASM runtime host with default-deny capability enforcement.

### Phase 3: Missing Subsystem Integration (Medium-Term)

10. **L6** — Integrate `bge-m3` embedding model, Qdrant hybrid search, and cross-encoder reranking, linked to the freshness scoring engine.
11. **L7** — Wire Docling and PaddleOCR pipelines into the Python perception service for structured document ingestion.
12. **L8** — Replace hand-rolled formulas with `fluids`, `CoolProp`, `Pint`, and `SymPy` for dimensional analysis and symbolic verification.
13. **B2** — Implement persistent MongoDB/SQLite storage for task checkpoints and audit log durability.

### Phase 4: Native Packaging & Release Certification (Target Release)

14. Containerize React application within a Tauri 2 native shell with strict Content Security Policy.
15. Train and integrate RF-DETR model for P&ID symbol detection and record benchmark precision/recall metrics.
16. Generate standardized SBOM manifests via Syft.

---

## 8. High-Integrity Components to Preserve

The following core modules are well-engineered, thoroughly tested, and should be maintained as foundational architecture:

- **`packages/sovereignty/src/{chain,verifier,merkle,crypto}.ts`** — Comprehensive Merkle tree generation, cryptographic verification, tamper detection, key allowlisting, and 1,000-event synthetic stress tests. Exceeds original specifications and fully satisfies P0 sovereignty requirements.
- **Plugin Admission Security** — Ed25519 digital signature validation against a pinned trust-root allowlist.
- **`packages/pal` Architecture** — Residency-aware model router, injectable `fetch` abstraction, and token context budgeting (`num_ctx` enforcement).
- **Critic Verification Suite (C1, C3, C4, C5)** — Robust deterministic rule evaluation over structured data models.
- **`packages/schemas`** — 47 canonical data schemas with passing schema checks and bidirectional validation.
- **Document Freshness Engine** — Verified mathematical implementation with 23 passing tests.
- **Strict TypeScript Typing** — Full type safety with `noUncheckedIndexedAccess` maintained across the entire codebase.
