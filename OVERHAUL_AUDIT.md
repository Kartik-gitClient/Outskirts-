# Outskirts — Implementation Audit & Overhaul List

**Audited:** 12 September 2026 · working tree at `D:\Outskirts`, 0 commits
**Against:** Final Technical Plan v2.0
**Scale:** 21,830 lines TS/TSX/Py · 139 tests · typecheck clean · all tests green · `schema:check` green

---

## 0. The headline

It is not broken. It compiles under `strict` with `noUncheckedIndexedAccess`, every test passes, and the repo layout follows §17 of the plan almost exactly. That is real discipline and it is worth saying before anything else.

The problem is different and more specific:

> **The shape of the plan was implemented. The substance was not.**
> Structural fidelity ≈ 80%. Functional fidelity ≈ 30%.

Roughly 40% of the code is genuinely good and should be kept — the audit chain work is better than what I specified. Another 35% is hollow: correct interfaces with simulated interiors. And about 25% of the plan was never started at all, including two entire architectural layers.

The root cause is a single pattern, repeated: **the plan said "adopt this library," and the implementation hand-wrote a TypeScript imitation instead.** Verified — these appear nowhere in any `package.json`:

`mongodb` · `qdrant` · `text-embeddings-inference` · `langgraph` · `react-flow` · `extism` · `docling` · `paddleocr` · `rf-detr` · `sahi` · `c2pa` · `cedar` · `syft`

And in the Python services, `requirements.txt` lists `fluids`, `CoolProp`, `Pint`, `sympy` — while the code imports only `math`.

The whole argument for the two-plane architecture (§1, principle 6) was that these libraries already solved the hard parts. Ignoring them while keeping the multi-language cost is the worst of both worlds: we pay for Python and get none of its ecosystem.

---

## 1. Triage summary

| # | Component | Verdict | Severity |
|---|---|---|---|
| 1 | `packages/sovereignty` chain + verifier | **KEEP** — exceeds spec | — |
| 2 | `packages/schemas` spine | **KEEP** — intact, 47 schemas | — |
| 3 | `packages/knowledge/freshness.ts` | **KEEP** | — |
| 4 | Plugin admission (Ed25519 + trust root) | **KEEP** | — |
| 5 | Critic C1/C3/C4/C5 logic | **KEEP**, extend | — |
| 6 | `packages/pal` adapters | **FIX** — one fatal bug | P0 |
| 7 | Engineering `/health` fabricates libraries | **FIX NOW** | P0 |
| 8 | P&ID detector returns its own ground truth | **REPLACE** | P0 |
| 9 | Rogue variant 1 blocks nothing | **REPLACE** | P0 |
| 10 | C2PA hand-rolled "shim" | **REPLACE** | P1 |
| 11 | No plugin sandbox at all | **BUILD** | P0 |
| 12 | Checkpointer is an in-memory `Map` | **FIX** | P1 |
| 13 | No Tauri shell | **BUILD** | P1 |
| 14 | No retrieval layer (L6) | **BUILD** | P1 |
| 15 | No perception layer (L7) | **BUILD** | P1 |
| 16 | Engineering libs unused (L8) | **REPLACE** | P1 |
| 17 | Python models hand-duplicated — planes already drifted | **FIX** | P0 |
| 18 | Egress verification never executed | **RUN IT** | P0 |
| 19 | `plugins/` empty | **BUILD** | P2 |
| 20 | Scope creep + hygiene | **CLEAN** | P2 |

---

## 2. Category A — Fabrication

Four places where the code asserts something untrue. These matter more here than they would in any other project, because the product's entire proposition is *verifiable* truth. A sovereignty workbench caught fabricating one number loses the credibility of all of them.

### A1. `/health` reports libraries that were never imported

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

The file's only imports are `math`, `typing`, `fastapi`, `pydantic`. This endpoint returns a hardcoded dependency manifest for four libraries that are not loaded, are not used, and whose absence would not change a single response.

**Why this is the worst defect in the repo:** it is a health endpoint feeding a dashboard whose reason to exist is that you can trust what it says. `pip uninstall fluids` and it still reports `fluids-1.0.26`. A judge who checks this once will discount every other number on screen — the egress counters, the critic rate, the latency budget.

**Fix:** report introspected reality, and let absence be visible.

```python
import importlib.metadata as md

def _version(pkg: str) -> str | None:
    try: return md.version(pkg)
    except md.PackageNotFoundError: return None

@app.get("/health")
def health_check():
    libs = {p: _version(p) for p in ("fluids", "CoolProp", "Pint", "sympy")}
    missing = [k for k, v in libs.items() if v is None]
    return {
        "status": "degraded" if missing else "healthy",
        "libraries": libs,          # nulls are the point
        "missing": missing,
    }
```

Then add a startup assertion so a service missing its own dependencies refuses to serve rather than serving fabrications.

### A2. The P&ID detector is handed the answer

`services/perception/pid-detector.ts:38`

```ts
public extractTags(drawingId: string, groundTruthTags: DrawingTag[], noise = false): DrawingExtraction {
  for (const gt of groundTruthTags) {
    const jitterX = noise ? (Math.random() - 0.5) * 4 : 0;
    const detected: DrawingTag = {
      tagNumber: gt.tagNumber,          // echoed
      symbolClass: gt.symbolClass,      // echoed
      detectorConfidence: Number((0.95 + Math.random() * 0.04).toFixed(3)),  // invented
      bbox: { x: gt.bbox.x + jitterX, ... },
    };
```

The function takes ground truth as a parameter and returns it with jitter and a fabricated confidence in the 0.95–0.99 band. **Precision and recall against this are 1.0 by construction** — the `computeBBoxIoU` function beside it is real and correct, and it is measuring a copy against its own original.

The P3 exit criterion — "P&ID tag precision and recall **measured** against hand-labelled ground truth" — is not merely unmet. It is unmeasurable by the design of the code, and the number it produces looks like success.

**Fix:** delete `extractTags`. Keep `computeBBoxIoU` and the metrics struct — those are the evaluation harness and they are correct. Then build the real pipeline in Python per §7.2: SAHI tiling → RF-DETR (Apache-2.0) → crop OCR → VLM semantics. Until a real detector exists, the benchmark row reads `UNMEASURED`, which is an honest state and the plan explicitly allows it.

### A3. The rogue-plugin block blocks nothing

This is the closing beat of the eight-minute demo. `packages/plugin-sdk/test/rogue.test.ts` variant 1:

```ts
const handlers = {
  covert_exfiltrate: async () => {
    throw new Error('Egress blocked: network socket forbidden by capability sandbox');
  },
};
```

And the guard that "detects" it, `host.ts:107`:

```ts
if (errStr.includes('network') || errStr.includes('socket') || errStr.includes('fetch')) {
  this.emitAlert('egress-blocked', pluginId, ...);
}
```

The plugin throws a string; the host greps that string for the word `socket` and files a security alert. Nothing was blocked. There is no sandbox — `PluginHost` is a `Map<string, ToolHandler>` calling plain in-process JavaScript with full ambient authority. A genuinely malicious plugin calling `fetch()` succeeds silently and emits nothing.

Two consequences, and the second is worse than the first:

1. The demo's climax is a function declaring its own defeat.
2. **The alert stream is forgeable by error text.** Any benign plugin that fails with a message containing "network" is reported to the Sovereignty Dashboard as a blocked exfiltration attempt. The dashboard's alert feed is not evidence of anything.

This is the exact defect I flagged in the v1.0 review — and the fix (decision A6: Extism, capability-based networking) was not implemented. The current state is weaker than v1.0's `worker_threads` proposal.

**Fix:** adopt Extism (BSD-3). Its security model is precisely this: the host grants network capability or the guest has none. Then the rogue plugin can contain a real `fetch()` call, and the block is the runtime refusing it — an actual boundary, provable on stage.

```
plugins/rogue-lying-manifest/    # real fetch() in the WASM guest, no capability granted
plugins/rogue-untrusted-key/     # already works — keep as-is
```

### A4. C2PA is a bespoke object claiming a standard

`apps/server/src/provenance/c2pa.ts:94` — `claimGenerator: '... (c2pa-rs shim)'`. No `c2pa` dependency exists. The file emits hand-built JSON shaped like a C2PA manifest.

The reason to adopt C2PA (§11.2) was one specific sentence: *any conformant tool can verify this, offline, against a published specification.* A lookalike inverts that — it claims interoperability while having none, which is worse than shipping nothing and saying so.

**Fix:** use `c2patool` (the real CLI) via subprocess, or `c2pa-rs` through its C FFI. Verify OOXML coverage first — if `.docx` embedding is unsupported, ship a sidecar manifest with the hard binding to the file hash, as the plan already anticipated. Rename the current file `provenance-stub.ts` until then.

---

## 3. Category B — Broken mechanism

### B1. Constrained decoding does not exist — the most consequential bug

`packages/pal/src/vllm.ts:66`

```ts
payload.guided_json = req.outputSchemaRef;   // sends the STRING "PlanStep"
```

`outputSchemaRef` is a schema *name*. vLLM's `guided_json` expects a JSON Schema *object*. And `packages/pal/src/ollama.ts:70`:

```ts
if (req.outputSchemaRef) payload.format = 'json';   // legacy "emit some JSON" mode
```

`resolveSchema()` — the function whose entire purpose is turning a ref into a schema — **is never called anywhere in `packages/pal/`.**

So the mechanism that decision A8 made mandatory, that principle 6 rests on, and that I described as *"the thing that makes multi-language safe is the same thing that makes local 7B models reliable at structured output"* — is absent. Every structured output in the system is an unconstrained model being asked politely and validated after the fact.

It typechecks because both sides are `string`. This is the failure mode the spine was built to prevent, reproduced inside the spine's own consumer.

**Fix:**

```ts
import { resolveSchema } from '@outskirts/schemas';
import { z } from 'zod';

// vLLM
if (req.outputSchemaRef) {
  payload.response_format = {
    type: 'json_schema',
    json_schema: { name: req.outputSchemaRef,
                   schema: z.toJSONSchema(resolveSchema(req.outputSchemaRef), { target: 'draft-7' }) },
  };
}

// Ollama — schema object, not the string 'json'
if (req.outputSchemaRef) {
  payload.format = z.toJSONSchema(resolveSchema(req.outputSchemaRef), { target: 'draft-7' });
}
```

Better: load the **committed** `build/schema/<Name>.json` rather than re-deriving, so the constraint and the Python validator are byte-identical artefacts. Then add a PAL test asserting the outbound payload contains a schema *object* with `properties` — a regression guard, since the string form is silently type-correct forever.

### B2. No persistence

`apps/server/src/agent/checkpointer.ts:18` — `private store = new Map<string, TaskCheckpoint>()`.

The plan's §6.1 says "checkpointing to MongoDB so a crashed or cancelled task resumes." Process restart loses every task. Also: no Mongo means no `auditEvents` collection, so the chain — the best code in the repo — has nowhere durable to live.

**Fix:** the interface is right; add a Mongo-backed implementation behind it. Keep the `Map` as the test double.

### B3. The two planes have already drifted

`services/perception/main.py` hand-writes Pydantic models that duplicate the spine:

```python
class BBoxModel(BaseModel):
    page: int = 1                      # schemas/BBox: page is REQUIRED
class DrawingTagModel(BaseModel):
    detectorConfidence: float = 0.98   # schemas/DrawingTag: REQUIRED, no default
```

These are not the same contract. A Python service can now accept a payload the TypeScript control plane would reject, and vice versa — which is the precise failure the schema spine exists to make impossible. §3 specifies `datamodel-code-generator` reading the committed JSON Schema; it was never wired, so both services invented their own types.

**Fix:** generate, do not hand-write.

```bash
datamodel-codegen --input packages/schemas/build/schema \
  --input-file-type jsonschema --output services/_generated/outskirts_schemas.py \
  --target-python-version 3.12 --use-standard-collections
```

Add to CI. Delete every hand-written model in both services. Note: this needs **Python 3.12** — the machine has 3.14, which is too new for PaddleOCR/torch wheels anyway.

### B4. Egress verification has never run

Docker is not installed. `deploy/verify-egress.sh` is written and correct, and has produced no evidence. Principle 2 says sovereignty is enforced by topology, not monitoring — so right now the project's primary enforcement mechanism is a design document. Install Docker Desktop and run it. If port publishing turns out not to work on an `internal: true` network, that is exactly the empirical question the script exists to answer, and better answered now than in week 7.

---

## 4. Category C — Never started

| Layer | Plan says | Reality |
|---|---|---|
| **L6 Knowledge** | Ingestion, chunking, bge-m3 embeddings, Qdrant dense+sparse, RRF, bge-reranker | `packages/knowledge/src/` = `freshness.ts` + `index.ts`. **No retrieval of any kind.** |
| **L7 Perception** | Docling, PaddleOCR, PP-StructureV3, Table Transformer, RF-DETR, SAHI | Nothing. `requirements.txt` is fastapi + pillow + shapely + numpy. No OCR, no layout, no tables. |
| **L1 Desktop** | Tauri 2 shell, webview CSP forbidding remote origins, loopback sidecar + shell secret (A14) | No `src-tauri`, no `tauri.conf.json`. A plain Vite web app. |
| **L8 Engineering** | fluids, CoolProp, Pint, SymPy | Hand-written `math`. No unit checking, no uncertainty propagation, no symbolic verification — so critic C2 cannot do what §6.3 specifies. |
| **L5 Plugins** | 6 capabilities + 3 demos + 2 rogue, as signed packages | `plugins/` is **empty**. |

L6 and L7 are the flagship pipeline. Without them the demo's opening beat — drop a scanned report, get grounded citations — has no implementation. This is the largest single gap and it is why "40% good" does not mean "40% done."

---

## 5. Category D — Scope creep & hygiene

| Item | Issue | Action |
|---|---|---|
| `ArchitectureBlueprintScreen.tsx` | A sixth screen; renders our own architecture diagram | Delete. Judges reward working software, not self-portraits |
| `N8nMeshCanvas.tsx` | Named after a project on the **rejected** list (Sustainable Use Licence). No actual dependency — so no legal issue, but the name invites the one question you don't want | Rename `WorkflowCanvas.tsx`. Adopt React Flow (MIT) as §14 specifies |
| `apps/desktop/dist/` | Build output committed | `.gitignore` |
| `packages/sovereignty/src/sbom.ts` | Hand-rolled SBOM | An SBOM you generate from your own manifest attests nothing. Use Syft |
| **0 git commits** | 21,830 lines, no history, no bisect, no review trail | Commit today, in reviewable slices |
| Test density | ~90 new tests for ~18k new lines | Tests concentrate on the good modules; the fabricated ones are tested against themselves |

---

## 6. Accuracy against the plan, by layer

| Layer | Structural | Functional | Note |
|---|---|---|---|
| L1 Desktop | 70% | 35% | Screens exist; no Tauri, so no client-side sovereignty |
| L2 Gateway | 80% | 50% | Express + ws + auth real |
| L3 Agent core | 85% | 45% | Planner/executor/recipe real; no LangGraph, no persistence |
| L4 Intelligence | 90% | 65% | Adapters real; **constrained decoding absent** |
| L5 Plugins | 60% | 30% | Admission excellent; sandbox nonexistent |
| L6 Knowledge | 15% | 15% | Freshness only |
| L7 Perception | 20% | 5% | Interfaces + simulation |
| L8 Engineering | 70% | 25% | Correct shapes, hand-rolled interiors |
| L9 Sovereignty | 85% | 60% | Chain excellent; C2PA fake; topology unproven |
| L10 Deployment | 40% | 20% | Compose written, never run; no installer |

**Weighted: ~80% structural, ~30% functional.**

The honest one-line characterisation: **a convincing scale model of the plan.** Every room is in the right place; the load-bearing walls are painted foam. That is a genuinely useful artefact — it validates the architecture and the contracts — but it is not a prototype, and the gap between what it appears to do and what it does is exactly the gap this product exists to close in other people's software.

---

## 7. Remediation order

### Today — stop the fabrications (half a day)

1. **A1** — `/health` introspects, nulls visible, refuse to serve when deps missing. *One function.*
2. **A2** — delete `extractTags`; benchmark row → `UNMEASURED`. *One deletion.*
3. **A3** — delete the `errStr.includes('socket')` classifier. Emit no alert rather than a forgeable one. Mark the rogue demo `NOT IMPLEMENTED`.
4. **A4** — rename to `provenance-stub.ts`, strip "c2pa-rs" from `claimGenerator`.
5. **git commit** the current tree first, so the audit has a before-state.

Nothing here adds capability. All of it stops the codebase asserting things that aren't true — and it is reversible in an afternoon, which is why it goes first.

### This week — restore the mechanisms

6. **B1** constrained decoding wired properly + regression test asserting a schema *object* leaves the adapter. **Highest value single fix in the list.**
7. **B3** `datamodel-codegen` in CI; delete hand-written Pydantic. Install Python 3.12 alongside 3.14.
8. **B4** install Docker, run `verify-egress.sh`, commit the evidence file.
9. **A3/11** Extism plugin host; real `fetch()` in the rogue guest.

### Weeks 2–3 — build the missing layers

10. **L6**: bge-m3 via TEI → Qdrant dense+sparse → built-in RRF → bge-reranker. Wire freshness weighting into ranking (the engine exists and nothing calls it).
11. **L7**: Docling + PaddleOCR in the Python service, real imports, real page geometry.
12. **L8**: replace `math` with `fluids`/CoolProp/Pint/SymPy; C2 gains real unit and symbolic checking.
13. **B2** Mongo checkpointer + audit persistence.

### Week 4 — client and packaging

14. Tauri shell around the existing React app; CSP; loopback sidecar + shell secret.
15. RF-DETR trained on the synthetic generator; first honest P/R number.
16. Real Syft SBOM; delete `sbom.ts`.

---

## 8. What to keep, explicitly

Do not rewrite these. Two are better than what I specified:

- **`packages/sovereignty/src/{chain,verifier,merkle,crypto}.ts`** — tail truncation, intermediate splicing, signature forgery, untrusted keys, anchor gaps, and a 1000-event synthetic test. This **fully closes the P0 exit criterion** and is stronger than my spec. Best code in the repo.
- **Plugin admission** — Ed25519 against a pinned trust-root allowlist, correct. Rogue variant 2 is a real, demoable security boundary today.
- **`packages/pal`** structure — injectable `fetch`, `num_ctx` enforced (the silent-truncation footgun, correctly closed), residency-aware router, cassettes. One bug away from good.
- **Critic C1/C3/C4/C5** — real deterministic logic over typed fields.
- **`packages/schemas`** — 47 contracts, `schema:check` green.
- **Freshness Engine** — 23 tests, curve matches spec.
- **Strict TypeScript everywhere.** `noUncheckedIndexedAccess` across 21k lines is a real standard and it should be defended.

---

*The architecture survived contact with implementation — that is the finding worth keeping. Every contract held, the spine did its job, and the two best modules exceed spec. What failed was substitution: twelve mature libraries replaced by imitations, and four places where imitation was dressed as fact. The first is a week of work. The second is an afternoon, and it has to happen before anything else, because a workbench that fabricates its own health report cannot be the one that tells a refinery which of its documents to trust.*
