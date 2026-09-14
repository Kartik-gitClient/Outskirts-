# Outskirts — Final Technical Plan v2.0

**beyond the commercialised · The Sovereign AI Workbench**
**Team PRITHVEDA · Smart India Hackathon 2026 · PS 26117 (MRPL)**
**12 September 2026 · Agreed Baseline**

---

## 0. Status

This document is the single source of truth for the build. It consolidates and supersedes:

| Document | Status |
|---|---|
| PDD v1.0 | Product intent, personas, journeys, positioning — **still binding**; Sections 6.2–6.4, 9, 12, 15 amended here |
| TDD v1.0 | Architecture — **superseded** by this document wherever they conflict |
| Design Addendum v1.1 | Defect fixes — **absorbed**; retained as the rationale record |
| OSS Build Catalog | Component research — **absorbed**; retained as the evidence record |

Where this document is silent, TDD v1.0 stands. Where it speaks, it wins.

---

## 1. Principles

Seven principles. The sixth is new and replaces TDD §1.1's "one language spine," which the component research retired.

| # | Principle | Engineering consequence |
|---|---|---|
| 1 | **Sovereignty is provable, never asserted** | All model traffic passes the PAL, which tags every call with locality and trust boundary. The dashboard, the audit chain and Decision DNA are all projections of one event stream, so proof cannot drift from reality |
| 2 | **Sovereignty is enforced by topology, not monitoring** | Every service sits on a Docker network with `internal: true`. Only the gateway port is published. Egress is structurally impossible, and the evidence is a packet capture, not a counter the application maintains |
| 3 | **Provider-agnostic from day one** | Models and serving engines are registry entries behind one interface. A new provider is an adapter file plus a conformance-suite pass |
| 4 | **Dual-mode is a first-class state** | `SOVEREIGN` and `ASSIST` are persisted system states with guarded, audited transitions. `SOVEREIGN` is the default in code, and there is a build target with the remote adapter compiled out |
| 5 | **Plugin-first modularity** | Every capability beyond the core loop is a manifest-declared, signed package admitted by the guard. The core never calls a capability directly |
| 6 | **One schema spine, many languages** | Contracts are JSON Schema artefacts generated from one source. Language is chosen per plane by what the ecosystem has already solved. See §3 |
| 7 | **CPU and GPU both viable** | Quality scales with hardware; the trust story never depends on it |

### Why principle 6 replaced "one language spine"

The original rule optimised for review comfort. The component survey showed what it costs: `fluids` (MIT) contains hundreds of validated hydraulic correlations including the Darcy-Weisbach path TDD Appendix A sketched by hand; CoolProp gives REFPROP-equivalent fluid properties; Pint gives dimensional analysis with uncertainty propagation; Docling, PaddleOCR, RF-DETR, TEI, bm25s, Ragas, garak and IndicTrans2 cover perception, retrieval, evaluation, security and Indic language support. All Python, all permissively licensed, all mature.

Reimplementing even three of those rows would consume the eight-week window and produce worse numbers. The review-comfort benefit is preserved a different way: **the team reviews one set of schemas, not one language.** A capability service is reviewed at its contract, exactly as a plugin is.

---

## 2. System architecture

### 2.1 Topology

```
┌── CLIENT ───────────────────────────────────────────────────────┐
│  Tauri 2 shell (Rust)  ·  React 19 workbench (TypeScript)       │
│  Webview CSP forbids all remote origins                         │
└────────────────────────┬────────────────────────────────────────┘
                         │ loopback only · random port
                         │ per-launch shell↔sidecar secret
┌────────────────────────▼────────────────────────────────────────┐
│  CONTROL PLANE — TypeScript / Node 22                           │
│                                                                 │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌───────────┐  │
│  │  Gateway    │ │  Agent core  │ │   PAL +    │ │  Guard    │  │
│  │  REST / WS  │ │  LangGraph.js│ │  Router    │ │  + Audit  │  │
│  │  Zod valid. │ │  Recipes     │ │  Registry  │ │  + DNA    │  │
│  │  Cedar RBAC │ │  Critic C1-6 │ │  Cassettes │ │  + C2PA   │  │
│  └─────────────┘ └──────────────┘ └──────┬─────┘ └───────────┘  │
│  ┌────────────────────────────────────┐  │                      │
│  │  Plugin host — Extism / WASM       │  │                      │
│  │  capability-gated, no ambient net  │  │                      │
│  └────────────────────────────────────┘  │                      │
└──────────┬───────────────────────────────┼──────────────────────┘
           │ HTTP · generated clients      │
           │ from the schema spine         │
┌──────────▼───────────────────────────────▼──────────────────────┐
│  CAPABILITY PLANE — containers · Python                         │
│                                                                 │
│   perception-svc          engineering-svc        translate-svc  │
│   ─────────────           ──────────────         ─────────────  │
│   Docling                 fluids                 IndicTrans2    │
│   PaddleOCR / PP-Struct   CoolProp               CTranslate2    │
│   RF-DETR + SAHI          Pint · SymPy                          │
│   Table Transformer       calc replay (C2)                      │
│   injection classifier                                          │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  RUNTIME PLANE — containers · prebuilt binaries                 │
│                                                                 │
│   llama-swap ──► vLLM (GPU) │ Ollama · llama.cpp (CPU)          │
│   TEI ──────────► bge-m3 embeddings + bge-reranker-v2-m3        │
│   Qdrant ───────► dense + sparse + RRF fusion                   │
│   MongoDB ──────► documents · tasks · audit chain               │
└─────────────────────────────────────────────────────────────────┘

      ╳  network: internal — no route to the internet  ╳
         only the gateway port is published to the host
```

### 2.2 Layer responsibilities

| Layer | Responsibility | Plane | Technology |
|---|---|---|---|
| L1 Desktop | Workbench, dashboard, marketplace, admin, review queue | Client | Tauri 2, React 19, React Flow, Zustand |
| L2 Gateway | Transport, validation, authn/authz, scoping | Control | Node 22, Express, Zod, Cedar |
| L3 Agent core | Recipes, plan DAG, execution, grounding, critique, delivery | Control | LangGraph.js |
| L4 Intelligence | Provider abstraction, registry, routing, mode, cassettes | Control | PAL (own) → llama-swap → vLLM / Ollama |
| L5 Plugin system | Manifest, signature, admission, three runtimes | Control + Capability | Extism/WASM · container · iframe |
| L6 Knowledge | Ingestion, retrieval, freshness, audit queue | Control + Capability | Qdrant, TEI, bm25s, own Freshness Engine |
| L7 Perception | OCR, layout, tables, detection, drawing parse | Capability | Docling, PaddleOCR, RF-DETR, SAHI, TATR |
| L8 Engineering | Calculation, properties, units, symbolic check | Capability | fluids, CoolProp, Pint, SymPy |
| L9 Sovereignty | Locality tagging, signed chain, C2PA provenance, DNA | Control | own + c2pa-rs, cosign, in-toto |
| L10 Deployment | Packaging, offline install, mode config, kernel guard | — | Compose, Tauri bundler, Tetragon (pilot) |

### 2.3 The three architectural rules

1. **Only the PAL may open a socket to an inference provider.** No plugin, no capability service, no UI code.
2. **Every cross-plane call is validated against a generated schema at both ends.** Interface drift fails at build time, in both languages.
3. **Every trust-relevant operation emits its audit event at the moment it happens** — model call, tool call, file read, plugin install, mode switch, RBAC refusal. The chain, the dashboard and the DNA record are consumers of that one stream.

---

## 3. The schema spine

The mechanism that makes multi-language safe. One artefact, five consumers.

```
        packages/schemas  (Zod, TypeScript — authored here)
                    │
                    │  zod-to-json-schema
                    ▼
        build/schema/*.json   ← the canonical artefact, committed
                    │
     ┌──────────────┼──────────────┬──────────────┬─────────────┐
     ▼              ▼              ▼              ▼             ▼
  TS types     Pydantic       constrained     OpenAPI      plugin
  (native)     models         decoding        docs         ToolSpec
               (datamodel-    (vLLM guided /  (gateway +   (manifest
               code-gen)      Ollama format)  services)    validation)
```

**Rules**

- Schemas are authored once, in `packages/schemas`, in Zod.
- The JSON Schema output is **committed**, and CI fails if it is stale relative to the Zod source. This is what keeps Python honest without Python authors editing TypeScript.
- Python services import generated Pydantic models. They never hand-write a request shape.
- **Every structured model call passes its JSON Schema to the provider as a decoding constraint.** No structured PAL call may omit it — enforced in the PAL, not by convention.
- Plugin `ToolSpec` entries are the same schemas, so a plugin's tool contract, the LLM's function signature and the runtime validation are one definition.

The payoff is that the planner's `PlanStep[]` contract, the perception service's extraction shape, the engineering service's calculation result and the critic's verdict object are all the same kind of object in every language, and the model is *sampled* into them rather than asked politely.

---

## 4. Component inventory — build versus adopt

### 4.1 What we build (this is the product)

| Component | Why nobody else has it |
|---|---|
| **Provider Adapter Layer**, mode state machine, perimeter model | The sovereignty abstraction is the product |
| **Provider conformance suite** | Does not exist anywhere; makes "add models without redesign" demonstrable live |
| **Freshness Engine** | Genuine whitespace — no RAG system models document decay, review cycles or supersession |
| **Deterministic critic C1–C5** | Trivial code, near-100% on the error classes that matter; no library does it better |
| **Decision DNA projection** | Even as in-toto attestations, the plan-DAG→lineage mapping is ours |
| **Industrial recipe library** | The domain knowledge is the moat, not the engine |
| **Workbench experience** | Streaming timeline, router panel, sovereignty dashboard, region-linked review |
| **Cassette / replay layer** | Makes everything else measurable, and is the demo's insurance |
| **Synthetic P&ID generator** | No public dataset exists; this is both a necessity and a differentiator |

### 4.2 What we adopt

| Need | Adopted | Licence |
|---|---|---|
| GPU inference | **vLLM** | Apache-2.0 |
| CPU inference | **Ollama / llama.cpp** | MIT |
| Model residency | **llama-swap** | MIT |
| Agent graph | **LangGraph.js** | MIT |
| Document conversion | **Docling** | MIT (LF AI & Data) |
| OCR, layout, geometry | **PaddleOCR** (PP-OCRv6, PP-StructureV3, PaddleOCR-VL) | Apache-2.0 |
| Table structure | **Table Transformer** | MIT |
| Symbol detection | **RF-DETR** (Nano–Large) | Apache-2.0 |
| Tiled inference | **SAHI** | MIT |
| Embeddings | **bge-m3** | MIT |
| Reranking | **bge-reranker-v2-m3** | MIT |
| Embed/rerank serving | **Text Embeddings Inference** | Apache-2.0 |
| Vector + sparse + RRF | **Qdrant** | Apache-2.0 |
| Lexical (fallback) | **bm25s** | MIT |
| Hydraulics, valves, flow | **fluids** | MIT |
| Fluid properties | **CoolProp** | MIT |
| Units + uncertainty | **Pint** | BSD |
| Symbolic verification | **SymPy** | BSD-3 |
| Plugin runtime | **Extism** (WASM) | BSD-3 |
| Heavy sandbox | **microsandbox** (dev) → **gVisor** (pilot) | Apache-2.0 |
| Policy / RBAC | **Cedar** (via `cedar-wasm`) | Apache-2.0 |
| Content provenance | **c2pa-rs** | MIT / Apache-2.0 |
| Artifact signing | **cosign** (key-based) | Apache-2.0 |
| Attestation format | **in-toto** | Apache-2.0 |
| Injection detection | `deberta-v3-base-prompt-injection-v2` ONNX | verify per card |
| Red teaming | **garak** | Apache-2.0 |
| Eval harness | **promptfoo** | MIT |
| RAG metrics | **Ragas** | Apache-2.0 |
| OCR benchmark | **OmniDocBench** | Apache-2.0 code; research-only data |
| Graph UI | **React Flow** | MIT |
| Drawing viewer | **OpenSeadragon** + **pdf.js** | BSD-3 / Apache-2.0 |
| Hindi/Indic translation | **IndicTrans2** | MIT |
| Tracing | **OpenTelemetry** | Apache-2.0 |
| SBOM | **Syft** | Apache-2.0 |
| Kernel plane (pilot) | **Tetragon** | Apache-2.0 |

**Explicitly rejected:** Ultralytics YOLO (AGPL-3.0 + paid enterprise), Surya weights (RAIL-M, <$5M revenue only), DWSIM (GPL-3.0 and archived), DocLayout-YOLO (AGPL-3.0), MongoDB Atlas (managed cloud), n8n (Sustainable Use Licence). Rationale in the Build Catalog §14.

---

## 5. Intelligence layer

### 5.1 The PAL contract

```ts
type Locality      = 'in-process' | 'loopback' | 'lan' | 'internet';
type TrustBoundary = 'inside-perimeter' | 'outside-perimeter';

interface ChatRequest {
  taskId: string; stepId: string;
  taskType: 'code' | 'document' | 'vision' | 'calculation' | 'retrieve';
  messages: ChatMessage[];
  tools?: ToolSpec[];
  outputSchema?: JsonSchema;    // present ⇒ constrained decoding is mandatory
  seed?: number;
  stream: boolean;
}

interface ProviderAdapter {
  id: 'vllm' | 'ollama' | 'nim' | 'nim-selfhosted' | 'triton';
  locality: Locality;
  trustBoundary: TrustBoundary;
  capabilities: ('text'|'vision'|'embedding'|'tool-use'|'guided-json'|'seeded')[];
  chat(req, model): Promise<ChatResult>;
  stream(req, model): AsyncIterable<Chunk>;
  health(): Promise<HealthReport>;   // reports device placement and residency
}
```

The capabilities array is **populated by the conformance suite**, not hand-declared. A provider that fails `guided-json` cannot serve a step with an `outputSchema`, and the router knows that without anyone remembering to write it down.

### 5.2 Audit event

Every PAL call emits, at the moment of the call:

`eventId · ts · seq · taskId · stepId · providerId · locality · trustBoundary · endpointHost · model · modelDigest · quantisation · contextWindow · promptTemplateHash · seed · cacheHit · tokensIn · tokensOut · latencyMs · loadMs · status`

`status ∈ ok | error | fallback | refused-locality`. `cacheHit: true` events render differently and are excluded from model-call counts — an inference cache that inflated the "work done locally" figure would be the self-deception the guard exists to prevent.

### 5.3 Routing

Admissibility filter (mode, trust boundary, health, capability, context budget) then rank by `quality − wL·(loaded ? 0 : estLoadS / latencyBudget)`. Two scheduler rules: the executor **groups ready steps by resolved model**, and registry entries may be `pinned`.

With llama-swap in front, `pinned` maps to its `matrix` and `hooks` configuration, and `estLoadS` drops to zero for resident models. With vLLM one-process-per-GPU, nothing swaps at all and the term is moot.

**`contextWindow` is a mandatory registry field** and is passed as `num_ctx` on every Ollama call. Ollama applies a small default and truncates long prompts silently; the drafting step would lose its SOP context with no error.

### 5.4 Determinism

`temperature: 0` and a fixed seed on every non-drafting call. Cassettes record and replay PAL responses keyed on (model digest, prompt hash, seed), so CI runs the whole agent loop with no model and any recorded task replays exactly. This is simultaneously the test strategy, the benchmark reproducibility mechanism, the Decision DNA "replay" feature and the venue-level demo fallback.

---

## 6. Agent core

### 6.1 Graph

Nodes: `intake → planner → router → executor → grounder → critic → deliverer → approver → recorder`, with the repair edge `critic → executor` bounded at three iterations per failing step and escalation to the review queue on exhaustion.

Checkpointing to MongoDB so a crashed or cancelled task resumes. Cooperative cancellation at every node boundary.

### 6.2 Planning — recipe-first

```
goal ──► recipe selector ──► match? ──► parameterised PlanStep[] ──► validate
                               │
                               └──► no match ──► free-form planner
                                                 (constrained decoding,
                                                  PlanStep[] schema)
```

A recipe is a named, versioned, parameterised DAG covering a known task class — `inspection-report-to-approval-note`, `drawing-to-tag-inventory`, `dataset-to-exhibit`, `brief-to-deck`, `spec-to-microtool`. Recipes make the demo deterministic, cut planner token cost, and are what an auditor actually wants: repeatable pipelines. Free-form planning remains for novel goals and produces the same validated contract.

**Control/data plane split is absolute.** The planner, the recipe selector and the router's classifier see only the user goal, project metadata and the plugin inventory. Document content enters only executor steps whose plugin allowlist is already fixed.

### 6.3 Critic

| ID | Check | Where it runs | Blocking |
|---|---|---|---|
| C1 | **Numeric grounding** — every number+unit in the draft matches a value in the extraction JSON, a calc transcript, or a retrieved chunk | Control plane | Yes |
| C2 | **Calculation replay** — re-execute every calc call with recorded inputs; compare within tolerance; dimensional check with Pint; formula check with SymPy | engineering-svc | Yes |
| C3 | **Citation resolvability** — every citation resolves to a chunk in this task's retrieval set, with token-overlap threshold against the claim | Control plane | Yes |
| C4 | **Template completeness** — all required template fields non-empty, all plan steps represented | Control plane | Yes |
| C5 | **Freshness policy** — no CRITICAL citation without recorded reviewer acknowledgement | Control plane | Yes |
| C6 | **Coherence** — LLM verdict against goal and plan | PAL | Advisory |

Gate = C1–C5 pass and C6 not a hard fail. Report the deterministic catch rate and the LLM-dependent rate as separate numbers, always.

---

## 7. Perception service

Python container, no egress, contract at the boundary.

### 7.1 Document pipeline

```
file ──► Docling (DoclingDocument: layout, reading order, tables, formulas)
           │
           ├─ text layer present ──► structure-aware chunking
           └─ scan / image ───────► PaddleOCR
                                     ├ PP-OCRv6        (text, 50 langs unified)
                                     ├ PP-StructureV3  (cell + text coordinates)
                                     └ PaddleOCR-VL    (hard layouts)
                                        │
                                        └─► Table Transformer where the grid is hard
```

Docling provides the normalised document model and the structure-aware chunker; PaddleOCR provides recognition and, critically, **geometry** — PP-StructureV3 returns table-cell and text coordinates, which is what the region-linked citation and drawing-review features require. OmniDocBench in P0 decides the ordering with a number.

Ingestion hardening: parse in the capability container with size, page, expansion-ratio and wall-clock caps. Never in the gateway.

### 7.2 Drawing pipeline — four stages

```
sheet ──► SAHI tile (overlap) ──► RF-DETR symbol detection ──► geometric de-dup
                                          │
                                          ├─► crop OCR per tag bubble / line number
                                          └─► VLM over structured output (semantics only)
                                                    │
                                                    └─► tag inventory + bounding boxes
```

The detector produces the boxes, which is what makes Journey 3's region-linked table buildable — a VLM will not give reliable coordinates on a dense sheet. The VLM sees structure, not pixels, and answers relationship questions.

### 7.3 Training data — synthetic, generated in-house

No substantial public P&ID symbol dataset exists. Generate one:

1. **ISA-5.1 symbol library** as SVG — valves, pumps, vessels, instruments, line types. A few dozen symbols covers a plausible sheet.
2. **Synthesise sheets**: grid placement, connecting lines with correct routing, tag bubbles with realistic numbering (`P-101A`, `FV-2034`), title blocks, revision clouds. COCO annotations emitted for free, because we placed every symbol.
3. **Degrade realistically**: scan noise, JPEG artefacts, skew, blur, moiré, photocopy contrast. This is what makes it transfer.
4. **Fine-tune RF-DETR** on synthetic, **validate on hand-labelled real public P&IDs**. That validation number is the honest one.

Unlimited perfectly-labelled data, no licence encumbrance, and a good answer when a judge asks how it was trained. **This starts in week 1** — it is the longest-lead item in the plan.

---

## 8. Knowledge layer

### 8.1 Retrieval

One model, one vector space, hybrid in a single system:

- **bge-m3** — 100+ languages including Hindi, 8192-token input, **dense + sparse + multi-vector in one model**. Embeddings are always local, never routed to a remote provider; every chunk records `embeddingModelId` and `dim`, and cross-model queries are refused rather than silently run.
- **Qdrant** — dense and sparse vectors with **built-in RRF and DBSF fusion**. Payload filtering on project scope and role visibility as a pre-filter, which is how RBAC data-scoping is enforced at the retrieval layer.
- **bge-reranker-v2-m3** via TEI — milliseconds per pair. No LLM reranking.
- **bm25s** retained as a fallback lexical path if sparse vectors underperform on tag-number lookups.

### 8.2 Freshness Engine

Class-aware, because the single largest conceptual error in v1.0 was treating every document as decaying.

| Class | Examples | Behaviour |
|---|---|---|
| `GOVERNING` | SOP, standard, policy, work instruction | Full state machine, coefficients (0.30, 0.35) |
| `RECORD` | Inspection report, test certificate, minutes | **Never decays.** Weight 1.0, carries `asOfDate`, cited as point-in-time |
| `REFERENCE` | Datasheets, as-issued drawings, manuals | Coefficients (0.15, 0.20); caps at AGING unless `supersededBy` exists |
| `UNVERIFIED` | No review-cycle metadata — **the common real case** | Weight 0.6, "review cycle unknown" badge, queued for classification |

```ts
const p = Math.min(daysSince(effectiveDate) / reviewIntervalDays, 1);
const o = nextReview ? Math.max(0, daysSince(nextReview) / reviewIntervalDays) : 0;
const [wp, wo] = COEFFS[documentClass];
const decay = documentClass === 'RECORD' ? 1 : clamp(1 - wp*p - wo*o, 0, 1);
```

| Situation | Score | State |
|---|---|---|
| Newly effective | 1.00 | FRESH |
| Half-way through cycle | 0.85 | FRESH |
| **Exactly at review date** | **0.70** | **AGING** |
| One interval overdue | 0.35 | STALE |
| Two intervals overdue | 0.00 | CRITICAL |

Enforcement: FRESH full weight · AGING weight × score · STALE weight × score plus inline banner · **CRITICAL retrievable at weight 0.25 with a hard banner, and the artifact cannot pass the human gate until the reviewer acknowledges each CRITICAL citation.**

Not excluded. An SOP two cycles overdue is still the governing procedure; removing it means answering from nothing, or from a superseded document that scores better. Forcing a human decision is safer and a better demo beat — the reviewer is *made* to confront the stale procedure.

---

## 9. Engineering service

Python container. Replaces the hand-written calculation plugin of TDD Appendix A.

| Capability | Library |
|---|---|
| Pipe sizing, fittings, pressure drop, friction factors | `fluids` |
| Pumps, control valves, orifice plates, flow meters, relief valves | `fluids` |
| Compressible, open-channel, two-phase flow | `fluids` |
| Thermophysical properties | CoolProp |
| Units, conversion, **uncertainty propagation** | Pint |
| Symbolic formula verification | SymPy |

Every tool returns `{ result, units, steps[], inputs, correlation, uncertainty? }` — the `steps` array is the audit-grade working, and `correlation` names the governing method so the approval note can cite it. The critic's C2 replays the call here and compares.

Pint's uncertainty propagation is used deliberately: a computed risk figure carrying ±tolerance reads as markedly more competent than a bare number, and it is honest about what a correlation can tell you.

---

## 10. Plugin system — three runtimes

The manifest gains a `runtime` field, which unifies the capability plane with the plugin model rather than making it an exception.

| Runtime | For | Isolation |
|---|---|---|
| `wasm` | Marketplace and third-party plugins | **Extism** — capability-based networking; the host grants network access or the plugin has none. Runtime limiters and timers enforce resource caps. Guest PDKs in Rust, JS, Python, Go, C#, Zig, so plugin authors are not forced into our language |
| `service` | First-party capability services (perception, engineering, translate) | Container on the `internal` network, signed image, declared contract, no egress |
| `iframe` | Generated micro-app previews | `sandbox` attribute, no same-origin, CSP blocking all network |

**Admission:** signature verified against a **pinned org trust root** with a `keyId` allowlist — an unlisted key is a refusal, audited. cosign key-based signing; keyless depends on an internet-reachable CA and defeats the purpose.

**The rogue test ships in two variants:** one signed by a *valid* key with a *lying manifest* (declares no network, attempts a POST) — blocked at the capability boundary because Extism never granted the capability; one signed by an *untrusted key* — refused at admission. Two different claims, two beats, five seconds each.

This is the correction that matters most: v1.0 claimed "the worker has no egress capability token," which describes a mechanism Node does not have. Extism provides exactly that mechanism.

---

## 11. Sovereignty subsystem

### 11.1 Guard planes

| Plane | Mechanism | Phase |
|---|---|---|
| **Topology** | Docker `internal: true`; only the gateway port published. Evidence is a host-side packet capture per benchmark run | **P0** |
| Application | Every PAL call locality- and boundary-tagged; every tool call recorded; dashboard is a projection of the stream | P1–P2 |
| Plugin | Signature verified against pinned trust root; capability-gated networking; no ambient egress | P2 |
| Kernel | nftables default-drop, DNS sinkhole, **Tetragon** eBPF `connect()` audit per process | P5 |

The topology plane is first because it is the only one that makes zero-egress *structurally true and measurable in the prototype*, on Windows, without root. The kernel plane becomes pilot hardening rather than the sole instrument for the headline metric.

### 11.2 Provenance — C2PA

Deliverables carry a **signed C2PA manifest** created with `c2pa-rs`: standard assertions, hard binding to the content hash, a CAWG identity assertion naming the producing system and the approving human, and the Decision DNA record id as a custom assertion.

This replaces the bespoke three-layer watermark. The difference is the question a reviewer asks second: *who else can verify that?* With an invented scheme the answer is "our tool." With C2PA it is "any conformant tool, offline, against a published specification." Where OOXML embedding is unsupported, ship a **sidecar manifest** keeping the hard binding to the file hash. The visible provenance footer stays, as a human affordance.

### 11.3 Audit chain and Decision DNA

```ts
interface ChainAnchor {
  anchorId: string;
  seqLow: number; seqHigh: number;
  eventCount: number;            // truncation of the tail becomes detectable
  merkleRoot: string;
  prevAnchorHash: string;
  prevAnchorSignature: string;
  signature: string;             // Ed25519, key in OS keystore / TPM
  keyId: string; signedAt: string;
}
```

Anchors at session close, at every mode transition, and every 500 events. **The signing key lives outside the database** — a hash chain inside the database it protects is tamper-evident only against attackers who cannot reach the database. `GET /audit/verify` walks hashes, signatures and counts, and its result is itself an audited event.

**Decision DNA is expressed as in-toto attestations.** The mapping is near-exact and was arrived at independently:

| in-toto | Outskirts |
|---|---|
| Layout — ordered steps, authorised functionaries | Plan DAG with per-step plugin allowlist and role gates |
| Link metadata — signed record per step | Per-step audit event with model, tools, inputs |
| Materials / products | Step inputs and outputs |
| Artifact rules (`MATCH`, `CREATE`, `DISALLOW`) | DAG dependency edges |
| `in-toto-verify` | Chain verification walk |

An auditor validates an approval note's provenance with a standard CLI rather than a verifier we wrote. Pair with cosign, which already signs in-toto attestations.

### 11.4 Injection defence

A 0.2B ONNX classifier (`deberta-v3-base-prompt-injection-v2` class) runs in-process on the ingestion path and on retrieved chunk text. Retrieved content is delimited and labelled untrusted in every prompt. The human gate displays which citations came from documents ingested *after* the goal was submitted.

garak runs against the sovereign deployment in P4 and the report ships in the appendix. "We red-teamed our own system with NVIDIA's scanner, here are the results" is a governance claim almost no hackathon team will make — and Farhan is precisely the persona who asks for it.

---

## 12. Data model

Thirteen collections. Four are additions that resolve inconsistencies in v1.0, where a "metrics collection" was the instrument for every benchmark number without being listed, and the model registry was declared absent while CRUD endpoints existed for it.

| Collection | Carries |
|---|---|
| `users` | Account, role, permission overrides, project scopes |
| `projects` | Members, KB scope, plugin enablement |
| `documents` | Source ref, extracted text, freshness spine, **documentClass, asOfDate, supersededBy, classificationSource** |
| `chunks` | Text, vector ref, lineage, **embeddingModelId, dim** |
| `tasks` | Goal, status, plan DAG, mode at launch, **recipeId, cancelledAt**, DNA ref |
| `agentSteps` | Node, model, locality, tool calls, verdicts |
| `artifacts` | Type, path, hash, **templateId, templateVersion**, C2PA manifest ref, approval state |
| `plugins` | Manifest snapshot, **runtime**, signature status, keyId, enablement, role gates |
| `auditEvents` | Append-only chain with prevHash and seq |
| **`chainAnchors`** | Signed anchors |
| **`modelRegistry`** | Digest, quantisation, contextWindow, capabilities (from conformance), device hints, pin flag, **license, licenseUrl** |
| **`benchRuns`** | Phase, mode, task results, latencies, router decisions, verdicts, evidence refs |
| **`reviewQueue`** | Approvals, freshness acknowledgements, critic escalations, classification tasks |

`license` and `licenseUrl` on every model entry, surfaced in the admin console. When a judge asks whether MRPL can actually deploy these models commercially, the answer is on screen.

---

## 13. API and event contracts

Additions to TDD §12, all Zod-validated, all additive.

```
POST   /tasks/:id/cancel                  # cooperative cancellation
GET    /tasks/:id/events?since=<seq>      # replay after a dropped socket
GET    /documents/:id/status              # ingestion is a long job
POST   /documents/:id/classify            # documentClass + review cycle
POST   /documents/:id/freshness-ack       # reviewer acknowledgement
GET    /review-queue · POST /review-queue/:id/decision
GET    /models/:id/health · POST /models/:id/smoketest
GET    /audit/verify                      # hash + signature + count walk
GET    /sovereignty/evidence              # per-run capture artefacts
GET    /bench/runs · POST /bench/run
```

WebSocket additions: `plan.ready`, `task.complete`, `task.failed`, `step.retry`, `ingest.progress`, `cache.hit`. **Every event carries `seq`**, monotonic per task, so a gap is detectable and replayable.

Three of these close holes rather than adding features: there was no way to cancel a running task, no way to recover a timeline from a dropped socket mid-demo, and the Review Queue was one of five load-bearing screens with no endpoints at all.

---

## 14. Frontend

Five screens, five Zustand slices, all consuming the WS protocol directly so the UI is a faithful projection of the audit stream.

| Screen | Notable components |
|---|---|
| Workbench | **React Flow** plan DAG, streaming timeline, expandable tool-call input/output pairs, artifacts panel |
| Sovereignty Dashboard | Perimeter-crossing counters, locality log with **resolved hostnames**, mode history, alert stream |
| Marketplace | Permission preview before install, runtime badge (`wasm`/`service`), guard flag |
| Admin Console | Cedar policy view, RBAC matrix, model registry with licence column, mode control |
| Review Queue | Approvals, freshness acknowledgements, escalations, DNA one click deep |

Two components the extraction story requires: **pdf.js** for text-layer coordinates, so clicking a citation highlights it in the source scan; **OpenSeadragon** for deep-zoom P&ID review with overlay annotations, because a plain `<img>` cannot work at drawing resolution.

Locality is encoded as colour on every model-attributed element, derived from the event stream — the dual-mode story is legible without a word of explanation.

---

## 15. Deployment

| Shape | Client | Inference | Storage | Guard |
|---|---|---|---|---|
| **Dev workstation** | Tauri local | Ollama loopback, or ASSIST via NIM | Mongo + Qdrant containers | Topology |
| **Single sovereign box** | Tauri local | llama-swap → llama.cpp/vLLM, loopback | containers | Topology + app + plugin |
| **LAN pilot** | Tauri on LAN | vLLM on GPU server, `lan / inside-perimeter` | server containers | All four planes |
| **Company GPU (shared)** | Tauri local | vLLM or self-hosted NIM, **`lan / outside-perimeter`** | local containers | Topology; inference flagged |

### 15.1 Running on organisation GPUs

**Path 1 — self-hosted NIM**, if the company holds an NVIDIA AI Enterprise entitlement. NIM microservices are containers exposing the same OpenAI-compatible API as the hosted endpoint, so the adapter is byte-identical between development and sovereign deployment. Weights cache to a local volume, so staging once and moving the cache air-gaps cleanly.

**Path 2 — vLLM**, the recommended default even where Path 1 exists, because it independently retires two design problems: **guided decoding** enforces the schema spine at the sampler, and **prefix caching** makes the long shared system prefix of an agent loop nearly free. Continuous batching is what lets concurrent tasks share one GPU.

```bash
docker run --gpus '"device=0"' --ipc=host --shm-size=16g \
  -v /srv/models:/models -p 8001:8000 vllm/vllm-openai:latest \
  --model /models/<model> --served-model-name outskirts-general \
  --max-model-len 32768 --gpu-memory-utilization 0.90 \
  --enable-prefix-caching --enable-auto-tool-choice
```

One process per GPU or MIG slice keeps every specialist resident and removes model swapping entirely — the largest latency win available.

**Path 3 — Ollama** for the CPU floor and the demo laptop, fronted by llama-swap.

**Non-NVIDIA silicon:** vLLM has native support for AMD, Intel GPU and CPU (x86/ARM/PowerPC), and hardware plugins for **Google TPU, Intel Gaudi, IBM Spyre, Huawei Ascend, Rebellions NPU, Apple Silicon and MetaX**. If the company accelerator is on that list, the PAL needs no new adapter. If it exposes only a vendor runtime, it is one adapter file — and the **conformance suite** is what tells you, in minutes, exactly which capabilities it has.

**The sovereignty consequence, stated plainly:** a shared, multi-tenant, internet-connected company cluster is `lan / outside-perimeter` and the dashboard says so. Do not let it become the sovereign story because packets stayed on a corporate network. Use it for what it is genuinely worth — **measured benchmarks at 24GB and 80GB classes**, so the sizing table is real — and keep the demo's resting state on hardware we control.

### 15.2 Air-gapped staging

Weights staged on a networked host (`huggingface-cli download --local-dir`, or Ollama blob store), transferred, then `HF_HUB_OFFLINE=1`. TEI, MinerU and PaddleOCR all document offline operation with mounted weights. **Record the digest, not the tag** — tags move, and a DNA record naming a tag is not reproducible. ORAS versions the bundle with a verifiable digest; Syft produces the SBOM that PSU procurement will ask for.

---

## 16. Hardware and models

The roster turns over faster than any release cycle, which is why the registry is data. Verified on Hugging Face trending, 12 Sep 2026 — **re-check at build time and record the licence per entry.**

Current official releases: `Qwen/Qwen3.8-27B` (~28B, **appears in both text and vision listings — natively multimodal**), `Qwen/Qwen3.8-Flash-Next` (~180B MoE), `zai-org/GLM-5.3` and `-Flash`, `deepseek-ai/DeepSeek-V4.1-Flash`, `openbmb/MiniCPM5-2B` (~3B, GGUF), `inclusionAI/Ling-3.0-tiny` (~8B), `moonshotai/Kimi-K3`. NVFP4 quantisations exist for Blackwell.

Two structural facts matter more than any specific name:

1. **A natively multimodal ~27B collapses two specialists into one.** If one resident model serves both document and vision steps, the residency problem largely dissolves. Verify vision quality on our P&ID corpus before committing — and design the registry so this is configuration.
2. **The ~35B-total / ~3B-active MoE pattern is now mainstream.** ~20GB at Q4 with 3B-active speed is the 24GB-GPU class, and it is the best quality-per-VRAM available.

| Hardware | Resident | Footprint | Behaviour |
|---|---|---|---|
| CPU only, 16GB | ~3B general + 2B vision; embeddings and reranker on CPU | 6–8GB RAM | Quality floor. Bounded demo steps only |
| 1 × 16GB GPU | ~20B-class general + vision; coder on demand | 13–15GB | Two resident, one swaps |
| 1 × 24GB GPU | ~35B-A3B general + vision + coder on demand | 20–22GB | **The realistic pilot floor.** Latency budget set here |
| 2 × 24GB / 48GB | Full table resident, one vLLM process per GPU | 40GB+ | Nothing swaps |
| 1 × 80GB | 120B-class + specialists via MIG | 70GB+ | Satisfies the PS's aspirational bullet |

Fixed roles regardless of generation: **bge-m3** embeddings, **bge-reranker-v2-m3** reranking, **IndicTrans2** translation, **RF-DETR** detection, **PaddleOCR** recognition — all MIT or Apache-2.0, all small, all local, all stable across model-shelf churn.

---

## 17. Repository layout

```
outskirts/
  apps/
    desktop/              # Tauri 2 shell + React client              (L1)
    server/               # Express gateway, WS, agent host           (L2-L3)
  packages/
    schemas/              # Zod source → build/schema/*.json   ◄── the spine
    pal/                  # adapters, registry, resolver, cassettes   (L4)
      conformance/        #   provider capability test suite
    plugin-sdk/           # definePlugin, ToolSpec, manifest types
    knowledge/            # ingestion orchestration, retrieval, freshness (L6)
    sovereignty/          # audit chain, guard hooks, C2PA, DNA        (L9)
  services/               # ◄── capability plane, Python
    perception/           #   Docling · PaddleOCR · RF-DETR · SAHI · TATR
    engineering/          #   fluids · CoolProp · Pint · SymPy
    translate/            #   IndicTrans2 (optional, scope-gated)
  plugins/
    report-generator/  code-sandbox/  data-visualizer/
    qr-generator/  unit-converter/  image-gen-demo/
    rogue-lying-manifest/  rogue-untrusted-key/
  datasets/
    pid-synth/            # ISA-5.1 symbol library + sheet generator
  benchmark/              # corpus, seeded errors, promptfoo configs, runners
  deploy/                 # compose files, internal networks, capture harness
  installer/              # Tauri bundling, offline bundle assembly
```

**Six real capabilities, three trivial marketplace demos, two rogue variants.** Honest framing scores better than "twenty governed capabilities," and piping simulation is a tool of the engineering service, not a peer plugin.

---

## 18. Phase plan

Phases close on their CI suite passing against the phase's floor, not on feature presence.

### P0 — Foundations · Week 1

*Every contract in code, every instrument in place, zero features.*

| Workstream | Owner | Content |
|---|---|---|
| Schema spine | Kartik | Zod source, JSON Schema generation, Pydantic codegen, CI staleness check |
| Storage + topology | Archit | Compose with `internal: true`, Mongo + Qdrant, capture harness |
| PAL + conformance | Sarthak | Ollama and vLLM adapters, llama-swap, conformance suite, cassettes |
| Perception skeleton | Nishakumari | Service scaffold, Docling + PaddleOCR wired, **OmniDocBench comparison run** |
| **P&ID synth generator** | Saurabh | ISA-5.1 SVG library, sheet synthesiser, degradation pipeline — **starts now, trains for six weeks** |
| Eval harness | Saurabh | promptfoo configs, corpus freeze (10 reports, 10 P&IDs incl. hand-labelled, 10 calc, 10 coding, seeded errors, ≥1 Hindi doc) |
| Acceptance test | Kartik | Flagship pipeline Playwright test, written now, red until P3 |
| Sidecar security | Archit | Loopback bind, random port, shell↔sidecar secret, origin allowlist |

**Exit:** `pnpm bench` prints a scorecard of zeros with named failures · conformance passes for both providers · the service tree boots with **no route to the internet** · chain verification passes on a synthetic 1000-event chain and **fails on a truncated one** · OCR engine chosen with a number, not a hunch · CI green on schemas, decay function (the state table as test cases), routing resolution, chain verification.

### P1 — Walking skeleton · Week 2

*One scanned PDF in, one signed .docx out, through all eight steps, everything stubbable stubbed.*

Graph wired with Mongo checkpointer and cancellation · one hardcoded recipe, no LLM planner · WS with `seq` and replay · bge-m3 via TEI, Qdrant with built-in RRF · approval-note template + field-object renderer · C2PA manifest, signed anchors, DNA assembly · Extism plugin host with one first-party tool.

**Exit:** flagship acceptance test passes **in cassette mode** · artifact carries a verifiable C2PA manifest · DNA exports and verifies offline · cancellation mid-step leaves a consistent record · killing the WebSocket and reconnecting reproduces the identical timeline.

### P2 — Sovereign identity · Weeks 3–4 · **gate: internal round**

Dual mode with perimeter model and the `outskirts-sovereign` build target (remote adapter compiled out) · dashboard from the event stream · residency-aware router with panel and `num_ctx` enforcement · recipe selector plus constrained-decoding planner · control/data plane split · deterministic critic C1–C5 with engineering-svc replay · Cedar RBAC, deny-by-default, refusals audited · plugin trust root, both rogue variants · packet capture in the benchmark runner.

**Exit:** mode flip live and audited · **zero-egress test is a CI citizen with a pcap as evidence** · both rogue variants blocked, at different boundaries · router panel shows coding and document requests taking different specialists · **deterministic critic catches 100% of seeded arithmetic and ≥90% of seeded citation errors**; LLM-dependent number reported separately · `outskirts-sovereign` contains no remote adapter, asserted by a build test.

### P3 — Intelligence surfaces · Weeks 5–6 · **gate: regional round**

RF-DETR fine-tuned on synthetic, SAHI tiling, crop OCR, region links · PP-StructureV3 geometry · freshness engine with document classes · engineering-svc with fluids/CoolProp/Pint/SymPy · xlsx and pptx templates, ECharts exhibits · S1 sandbox live preview · marketplace with three demo plugins · review queue with freshness acknowledgement · pdf.js and OpenSeadragon review surfaces · IndicTrans2 if Hindi stays in scope.

**Exit:** flagship pipeline passes against the **live corpus** · **P&ID tag precision and recall measured** against hand-labelled ground truth, region links resolve to correct crops · freshness banner deterministic on the seeded stale SOP · a CRITICAL citation **blocks the human gate** until acknowledged · all seven metrics have a measured value · latency budget populated and every over-budget step named.

**Latency budget** — instrument this, or "under five minutes" has no diagnostic:

| Step | Dev | Sovereign (24GB) |
|---|---|---|
| Ingest + OCR/vision | 60s | 90s |
| Retrieval + rerank | 5s | 8s |
| Calculation + replay | 5s | 5s |
| Drafting | 60s | 120s |
| Critic C1–C5 | 5s | 5s |
| Critic C6 | 20s | 40s |
| Render + C2PA + DNA | 5s | 5s |
| Model load overhead | 10s | 30s |
| **Total** | **~2:50** | **~5:05** |

### P4 — Proof and hardening · Weeks 7–8 · **gate: national final**

*Nothing new. Everything measured, rehearsed, packaged.*

Full benchmark in both modes with pcap evidence · **garak red-team report** · Syft SBOM · replay from cassettes wired as both the DNA view and the venue fallback · offline installer verified on a genuinely disconnected machine, three platforms · registry hot-add rehearsed live · demo rehearsed five times including every fallback.

**Exit:** scorecard committed with the sovereign run's packet capture attached · installer verified disconnected · hot-add performed live in under two minutes · **every number on every slide traces to a scorecard row, or is labelled a design target.**

### P5 — Pilot · Weeks 9–16+

Tetragon kernel plane · Keycloak LDAP/AD · gVisor as default heavy sandbox · Mongo and Qdrant HA, multi-user concurrency, task queueing against GPU capacity · signing key to TPM/HSM, key ceremony · Trillian if the audit log outgrows signed anchors · third-party pen test · recipe library becomes the user-editable workflow builder · **GraphRAG over extracted P&ID connectivity** — a drawing is a graph, and "what feeds V-101" is the question a refinery actually asks.

---

## 19. Ownership

| Member | Sphere | Plane |
|---|---|---|
| **Kartik Khandelwal** | Schema spine, agent core, recipes, executor, cancellation, gateway, API contracts | Control |
| **Sarthak Shrivastav** | PAL, adapters, conformance suite, llama-swap, registry, router, constrained decoding, cassettes | Control |
| **Nishakumari** | Perception service, ingestion, retrieval, reranking, **Freshness Engine** | Capability |
| **Pavanijaiswal** | Tauri shell, five screens, React Flow timeline, pdf.js/OpenSeadragon review, marketplace, three demo plugins | Client |
| **Archit Vishwakarma** | Topology, guard planes, signed chain, C2PA, in-toto DNA, Cedar RBAC, installer | Control |
| **Saurabh Sahu** | **P&ID CV pipeline + synthetic generator**, engineering service, benchmark harness, garak, demo | Capability |

Two changes from v1.0: the P&ID CV pipeline is the largest technical unknown and now has a dedicated owner rather than being one item in an overloaded sphere; and benchmarks move to week 1, so Saurabh builds the instrument before it is needed rather than after.

---

## 20. Metrics and instruments

| Metric | Instrument | Target |
|---|---|---|
| Pipeline completion | promptfoo scorecard | ≥90% on the flagship class |
| End-to-end latency | Latency budget table, per step | <3:00 dev, <5:30 sovereign (24GB) |
| **Critic catch — deterministic** | Seeded-error corpus, C1–C3 | **100% arithmetic, ≥90% citation** |
| Critic catch — LLM | Seeded-error corpus, C6 | Reported honestly, no target |
| Router correctness | Labelled step set, two raters | ≥95% agreement |
| Grounding precision | C1/C3 pass rate on generated claims | Every claim cited; stale warnings 100% |
| **Egress integrity** | **Packet capture on the internal network** | **Zero packets, all runs** |
| P&ID extraction | Hand-labelled ground truth | **Precision and recall reported** |
| Deliverable acceptance | Reviewer persona, first review | ≥70% in the final phase |
| Document parsing | OmniDocBench | Used to choose the engine, not as a claim |

Two rules: every number is measured on the fixed corpus or labelled a design target, and the deterministic and LLM-dependent critic figures are never merged into one headline.

---

## 21. Demo — eight minutes

| Min | Beat | Wow | Fallback |
|---|---|---|---|
| 0:00 | Dashboard already live; state the claim | Jury sees the monitor before the chat | Dashboard is local-only |
| 0:30 | Journey 1: scanned report + photo dropped; recipe resolves to eight typed steps, streaming | Plan-to-execution transparency | Cassette replay from the seeded task |
| 2:00 | Vision extraction; **region-linked tag table over the drawing**; freshness banner fires on the stale SOP mid-run | The system warns about its own source decay, unprompted | Banner is deterministic on this revision |
| 3:30 | Calculation shows governing correlation and intermediate values; note lands; **critic verdicts render per claim** | The AI checks itself before the human has to | C1–C5 are deterministic; verdicts pre-verified |
| 4:30 | Journey 2: micro-tool generated; sandboxed preview; a jury member types a value | Live software in one conversation | Pre-generated artifact; preview is network-disabled |
| 5:30 | Router panel: two requests take different specialists, reasons shown | Auto-selection demonstrated, not claimed | Panel is driven by the audit stream |
| 6:30 | **Mode flip; counters settle to zero; one bounded step reruns live on local models.** Full sovereign run shown as a labelled recording with its packet capture | The sovereignty proof, made physical and *measured* | Local model pre-warmed via llama-swap `hooks` |
| 7:15 | **Two rogue plugins** — lying manifest blocked at the capability boundary, untrusted key refused at admission. Close on DNA replay | A plugin attacks, the guard wins, twice, for different reasons | Both deterministic; alert stream is local |

The 6:30 beat is corrected from v1.0, which allocated 45 seconds to rerun a full vision pipeline on a 3B CPU model. A labelled recording accompanied by a packet capture and a repeatable harness is better evidence than a live run nobody can verify — and if company GPU access lands before the final, the beat becomes live and one sentence changes.

Casting rules unchanged: narrate persona voices not features; every on-screen number is measured or labelled; the dashboard stays in frame for all eight minutes.

---

## 22. Risk register

| Risk | Mitigation | Residual |
|---|---|---|
| No local GPU during build | Topology-enforced sovereignty needs no GPU; llama-swap + CPU models for the floor; company GPU for measured benchmarks only | Low |
| P&ID extraction quality | Synthetic generator from week 1; RF-DETR built for small-domain transfer; SAHI tiling; **P/R measured, not asserted** | Medium — bounded by an honest number |
| Local model structured-output reliability | Constrained decoding makes invalid output unrepresentable; recipe-first planning avoids free-form generation on the demo path | Low |
| Multi-language contract drift | Schema spine with committed JSON Schema and CI staleness check; generated clients both sides | Low |
| Python plane operational burden | Three containers, one contract each, same lifecycle as plugins; no new deployment concept | Low |
| Model shelf turnover | Registry is data; roster re-checked at build time; fixed small models (bge-m3, RF-DETR, IndicTrans2) are stable | Low |
| Licence exposure at pilot | Rejected list is explicit; `license` per registry entry; SBOM in CI | Low |
| Venue network / GPU | Architecture needs neither; cassette replay is the venue fallback | Low |
| Six contributors, ten workstreams | Single owner per sphere; P&ID separated out; benchmarks front-loaded | Medium — managed by sequencing |
| Scope creep toward chatbot | Every new feature must map to a PS bullet; MoSCoW gate per round | Medium — discipline cost |

---

## 23. Licence register — act on the top three before the pilot

| Project | Terms | Action |
|---|---|---|
| Ultralytics YOLO | AGPL-3.0 + paid enterprise | **Rejected** — RF-DETR (Apache-2.0) |
| Surya weights | RAIL-M, free under $5M revenue only | **Benchmark only**, never shipped |
| DWSIM | GPL-3.0, archived Aug 2026 | **Reference oracle only** |
| MinerU | "Apache 2.0 with additional conditions" | Legal review before pilot if adopted |
| docxtemplater | Core MIT; Image/XLSX/Chart/Meta modules paid | Use `docx`/python-docx, or budget |
| OmniDocBench data | Research-only, non-commercial | Benchmark with it, never ship it |
| Langfuse, NeMo Guardrails, Ragas | **Telemetry on by default** | Disable explicitly, verify with a capture |
| Model weights | Vary within a family | `license` field per registry entry, shown in admin |

The telemetry row is a sovereignty issue, not a licence issue, and it is the one most likely to embarrass us on stage. Anything that phones home is either disabled and verified, or absent from the sovereign build.

---

## 24. This week

1. **Ratify the two-plane decision (§1, §3).** Everything depends on it and it is one meeting.
2. **Start the synthetic P&ID generator.** Longest lead item in the plan; the detector cannot train until it exists.
3. **Run OmniDocBench** against PaddleOCR-VL, MinerU hybrid and Docling on ten of our own scans. Choose the engine with a number in week 1.
4. **Prototype C2PA on a .docx.** Verify OOXML coverage now; decide the sidecar-manifest fallback before it is urgent.
5. **Read in-toto's layout model** and confirm Decision DNA becomes attestations — a two-hour read that replaces a week of bespoke format design.
6. **Stand up the schema spine** and prove the round trip: Zod → JSON Schema → Pydantic → constrained decoding, on one real object.

---

*The architecture is deliberately boring in its mechanics — containers, a document database, a state-graph agent, mature libraries doing the work they were written for — so that the innovation budget goes to the five differentiators and not to infrastructure heroics. Nothing between this prototype and a PSU pilot is a rewrite; every step is configuration, packaging and hardening of contracts that already exist. That is the promise this document keeps, and the standard the team holds itself to at every gate.*
