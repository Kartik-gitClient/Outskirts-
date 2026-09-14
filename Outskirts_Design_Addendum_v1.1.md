# Outskirts — Design Revision Addendum v1.1

**Companion and corrigendum to** PDD v1.0 and TDD v1.0 (Agreed Baseline, September 2026)
**Team PRITHVEDA · SIH 2026 · PS 26117 (MRPL)**
**Status:** proposed baseline amendment. Supersedes the named sections where it conflicts with them.

---

## 0. How to read this document

The v1.0 baseline is architecturally sound: the nine-layer split, the PAL as sole inference choke point, and "the dashboard is a projection of the audit stream" are the three decisions the whole product rests on, and all three are right. Nothing in this addendum changes them.

What this addendum does:

1. **Part A** locks fourteen decisions that v1.0 left open or resolved incorrectly.
2. **Part B** specifies the fix for each defect, in buildable detail, keyed to the v1.0 section it replaces.
3. **Part C** is the full phase plan, P0 through P5, with testable exit criteria per gate.
4. **Part D** answers running on company GPUs, including the case where they are not NVIDIA.
5. **Part E** revises the model roster and hardware math.
6. **Part F** is the edit list to apply to the two Word baselines.

The controlling principle of v1.0 — *full-fledged architecture, phased implementation* — is retained and applied more strictly: several things v1.0 deferred to "product mode" are moved **into** the prototype, because they are cheaper than v1.0 assumed and because the demo's central claims cannot be measured without them.

---

# Part A — Locked decisions

These replace the corresponding rows of TDD Table 3 and the open questions elsewhere. Each is a decision, not a recommendation; the rationale column is what to say when someone asks why.

| # | Decision | Rationale |
|---|---|---|
| A1 | **No managed cloud storage, in either mode.** MongoDB 8 in a container for documents/tasks/audit. Qdrant in a container for vectors. Atlas is removed from the architecture entirely. | v1.0's dev mode put the entire knowledge base, extracted text, embeddings and the audit chain in a managed cloud while the dashboard claimed inference was the only egress. One storage path for both modes also deletes an entire class of dev/prod divergence. |
| A2 | **Embeddings are always local, never routed to a remote provider.** In-process ONNX (bge-m3 or Qwen3-Embedding-0.6B class). Every chunk records `embeddingModelId` + `dim`; queries against a mismatched model id are refused, not silently run. | v1.0 used NIM embeddings in dev and bge-small in sovereign. Those are different vector spaces — the mode flip would have silently corrupted retrieval ranking with no error surface. |
| A3 | **Reranking is a cross-encoder ONNX model in-process** (bge-reranker-v2-m3 class), not an LLM prompt. | LLM reranking of ~50 candidates on CPU costs minutes and blows the retrieval latency budget. |
| A4 | **Lexical retrieval is in-process BM25** (MiniSearch) at prototype scale; Qdrant sparse vectors at pilot scale. | Atlas Search provided BM25 in v1.0. With A1 that dependency is gone, and Mongo Community `$text` is not a substitute. |
| A5 | **Locality is four-valued, plus an explicit trust boundary.** `in-process \| loopback \| lan \| internet` and `trustBoundary: inside-perimeter \| outside-perimeter`. The dashboard counts **perimeter crossings**, not "remote calls". | In the product topology the client is on the LAN and Ollama is on a GPU server — a different host. v1.0's binary `local` tag was false in exactly the deployment being sold. |
| A6 | **Third-party plugin code runs in a container with no network, from day one.** TDD's S3 becomes the default tier for anything not first-party-signed. S2 workers are reserved for first-party signed tools. S1 iframe stays as-is for previews. | v1.0's "the worker has no egress capability token" describes a mechanism Node does not have. Node 22's permission model gates fs, child_process and worker_threads — **not network**. The rogue-plugin block, the demo's closing beat, needs a real boundary. |
| A7 | **Sovereignty is enforced by network topology, not by monitoring.** All services sit on a Docker network with `internal: true`; only the gateway port is published to the host. Egress evidence is a host-side `tcpdump` capture retained per benchmark run. | Makes zero-egress structurally true and *measurable in the prototype on Windows*, without nftables/eBPF. The kernel plane is then a pilot-hardening step rather than the only instrument for the flagship metric. |
| A8 | **Every structured model output uses constrained decoding.** Zod → JSON Schema → Ollama `format` / vLLM guided decoding. No structured PAL call is made without a schema attached. | The planner must emit a Zod-valid `PlanStep[]`. A 7B Q4 model will not do that reliably by prompting. Constrained decoding makes schema-invalid output unrepresentable rather than retried. |
| A9 | **Planning is recipe-first.** A library of parameterised workflow recipes covers the known task classes; the free-form planner runs only when no recipe matches, and its output is validated against the same `PlanStep[]` contract. | Turns the demo deterministic, cuts planner token cost, and repeatable pipelines are what an auditor actually wants. Note the consequence: the "workflow builder" v1.0 deferred as a should-have is now core de-risking, delivered early in reduced form. |
| A10 | **The critic is mostly deterministic code.** Numeric grounding, calculation replay, citation resolvability and template completeness are code checks. The LLM handles only completeness/coherence, weighted advisory. | v1.0 had a 7B critiquing a 7B and claimed 80% catch rate on arithmetic and citation errors — the two classes a prompted verifier is worst at. See B4 for the check specification. |
| A11 | **Artifacts are template-rendered.** The model emits a validated field object; code lays out the .docx/.xlsx/.pptx from a fixed template. The model never authors document structure. | Deterministic formatting, deterministic watermark placement, and template-completeness becomes a free critic check. Also the only way an MRPL-style approval note looks like an MRPL approval note. |
| A12 | **Determinism is a system property.** `temperature: 0` and a fixed seed for every non-drafting call; the audit event records model **digest**, quantisation, prompt-template hash, seed and `cacheHit`. A cassette layer records/replays PAL responses so CI runs the whole agent loop with no model. | Makes benchmarks reproducible, makes CI possible without a GPU, and makes Decision DNA literally replayable — which is the feature the PDD promises. The cassette layer doubles as the demo's venue-level fallback. |
| A13 | **SOVEREIGN is the default mode in code, and there is a build target with the remote adapter compiled out.** Ship `outskirts-sovereign` (no NIM adapter in the binary) and `outskirts-dev`. | A misconfiguration then fails closed instead of open, and the strongest possible form of the claim becomes checkable by the jury: the remote provider code is not in the artefact. |
| A14 | **The sidecar binds loopback only, on a random port, behind a per-launch shared secret** passed from the Tauri shell, with a strict origin allowlist. | v1.0 specified JWT auth but not the bind or the shell↔sidecar handshake. An unauthenticated localhost service is reachable by any local process and by any web page in the user's browser. |

---

# Part B — Fix specifications

Keyed to the v1.0 section each one amends.

## B1. Freshness Engine — replaces TDD §8.3 in full

Three defects in v1.0: the curve marks an on-schedule document STALE; the CRITICAL state removes the governing procedure from retrieval; and the model treats every document as if it decays.

### B1.1 Document classes

Freshness is class-aware. Class is set at ingestion (from metadata where present, else by classifier + human confirmation via the review queue).

| Class | Examples | Decay behaviour |
|---|---|---|
| `GOVERNING` | SOP, standard, policy, work instruction, procedure | Full state machine, coefficients (0.30, 0.35) |
| `RECORD` | Inspection report, test certificate, minutes, correspondence | **Never decays.** State is `RECORD`, weight 1.0, carries `asOfDate`. The grounder labels citations as point-in-time |
| `REFERENCE` | Datasheets, as-issued drawings, vendor manuals | Coefficients (0.15, 0.20); caps at `AGING` unless an explicit `supersededBy` link exists, in which case `STALE` |
| `UNVERIFIED` | No review-cycle metadata (**the common real case**) | Retrievable at weight 0.6, badge "review cycle unknown", queued for classification. Never silently treated as fresh |

`RECORD` is the fix for the largest conceptual error in v1.0: an inspection report from 2019 is not stale, it is history. Penalising it would have made the workbench distrust its own primary evidence.

### B1.2 Revised decay function

```ts
// progress is capped: being deep into a cycle is not the same as being overdue
const p = Math.min(daysSince(effectiveDate) / reviewIntervalDays, 1);
const o = nextReview ? Math.max(0, daysSince(nextReview) / reviewIntervalDays) : 0;
const [wp, wo] = COEFFS[documentClass];        // GOVERNING [0.30, 0.35]
const decay = documentClass === 'RECORD' ? 1 : clamp(1 - wp * p - wo * o, 0, 1);
```

Behaviour of the governing curve, which is what makes it defensible under questioning:

| Situation | `p` | `o` | Score | State |
|---|---|---|---|---|
| Newly effective | 0 | 0 | 1.00 | FRESH |
| Half-way through cycle | 0.5 | 0 | 0.85 | FRESH |
| **Exactly at review date** | 1.0 | 0 | **0.70** | **AGING** |
| Half an interval overdue | 1.0 | 0.5 | 0.53 | AGING |
| One full interval overdue | 1.0 | 1.0 | 0.35 | STALE |
| Two intervals overdue | 1.0 | 2.0 | 0.00 | CRITICAL |

v1.0's curve scored the on-schedule case at 0.40 — STALE — so a document doing exactly what it was supposed to do would have fired warning banners.

### B1.3 Revised enforcement

| State | Retrieval | UI / gate |
|---|---|---|
| FRESH ≥0.75 | Full weight | Clean citation |
| AGING 0.50–0.75 | Weight × score | Confidence label reflects it |
| STALE 0.25–0.50 | Weight × score | Inline banner at generation; reviewer sees flag at human gate |
| CRITICAL <0.25 | **Retrievable at weight 0.25** — not excluded | Hard banner; **the artifact cannot pass the human gate until the reviewer explicitly acknowledges each CRITICAL citation**; document also appears in the audit queue |
| RECORD | Full weight | Labelled point-in-time as of `asOfDate` |
| UNVERIFIED | Weight 0.6 | "Review cycle unknown" badge; classification task queued |

The change from *exclude* to *retrieve-with-forced-acknowledgement* is a safety fix, not a softening. An SOP two review cycles overdue is still the governing procedure; excluding it means the system answers from nothing, or from a superseded document that happens to score better. Forcing a human decision is both safer and a better demo beat — the reviewer is *made* to confront the stale procedure rather than never learning it existed.

## B2. Locality and the perimeter model — replaces TDD §4.1–4.2 tagging

```ts
type Locality      = 'in-process' | 'loopback' | 'lan' | 'internet';
type TrustBoundary = 'inside-perimeter' | 'outside-perimeter';

interface PalAuditEvent {
  eventId: string; ts: string; seq: number;      // monotonic per task
  taskId: string; stepId: string;
  providerId: 'nim' | 'nim-selfhosted' | 'ollama' | 'vllm' | 'triton';
  locality: Locality;
  trustBoundary: TrustBoundary;                  // what the dashboard counts
  endpointHost: string;                          // resolved host, for the log
  model: string;
  modelDigest: string;                           // sha256 of weights per engine
  quantisation: string;
  contextWindow: number;
  promptTemplateHash: string;                     // reproducibility
  seed: number | null;
  cacheHit: boolean;                             // a cached call is NOT a model call
  tokensIn: number; tokensOut: number;
  latencyMs: number; loadMs: number;             // model load, separated out
  status: 'ok' | 'error' | 'fallback' | 'refused-locality';
}
```

Three consequences worth stating on the dashboard:

- `perimeterCrossings` is the headline counter, and it is zero in sovereign mode by topology (A7), not by hope.
- `lan / inside-perimeter` is the honest tag for a company GPU server, and the dashboard shows the resolved host so nobody has to trust the label.
- `cacheHit: true` events are drawn differently and excluded from model-call counts. An inference cache that quietly inflated the "work done locally" number would be the exact kind of self-deception the guard exists to prevent.

## B3. Audit chain — replaces TDD §10.2

v1.0's chain detects modification but not truncation, and its anchors are unsigned documents in the same database the application writes to.

```ts
interface ChainAnchor {
  anchorId: string;
  seqLow: number; seqHigh: number;
  eventCount: number;            // truncation of the tail becomes detectable
  merkleRoot: string;            // over the event hashes in range
  prevAnchorHash: string;
  prevAnchorSignature: string;   // chains the signatures, not just the hashes
  signature: string;             // Ed25519, key in OS keystore / TPM
  keyId: string;
  signedAt: string;
}
```

Rules: anchors are written at session close, at every mode transition, and every 500 events. The signing key lives **outside the database** — OS keystore in the prototype, TPM or HSM at pilot. `GET /audit/verify` walks hashes *and* signatures *and* counts, and its own result is an audited event. Say it plainly in the pitch: a hash chain inside the database it protects is tamper-*evident* only against attackers who cannot reach the database; the signature outside it is what makes the claim hold.

## B4. Deterministic critic — replaces TDD §5.3

Six checks. The first five are code. Only C6 is a prompt.

| ID | Check | Mechanism | Blocking |
|---|---|---|---|
| C1 | **Numeric grounding** | Extract every number+unit from the draft (regex + unit lexicon). Each must match a value in the extraction JSON, a calc transcript, or a retrieved chunk, within tolerance. Any unmatched number fails with the offending token quoted | Yes |
| C2 | **Calculation replay** | Re-execute every calc tool call with recorded inputs in S2; compare within tolerance; dimensional check with a real units library (`mathjs` units) | Yes |
| C3 | **Citation resolvability** | Every citation id resolves to a chunk in *this task's* retrieval set, and the chunk text shares a token-overlap threshold with the claim it backs | Yes |
| C4 | **Template completeness** | All required template fields non-empty, all plan steps represented — free, because artifacts are template-rendered (A11) | Yes |
| C5 | **Freshness policy** | No CRITICAL citation without recorded reviewer acknowledgement; STALE citations carry banners | Yes |
| C6 | **Coherence / completeness** | LLM verdict against the goal and plan | Advisory |

Gate = all of C1–C5 pass and C6 is not a hard fail. Repair budget stays at 3, retrying only the failing step and its downstream dependencies, then escalating to the review queue with the verdict object attached.

This is what makes the PDD's ≥80% critic catch rate defensible instead of aspirational: seeded arithmetic and citation errors are caught by C1–C3 deterministically, at essentially 100%, and you can explain the mechanism in one sentence to a sceptical judge. Report the LLM-dependent number separately and honestly.

## B5. Prompt injection — control/data plane split, amends TDD §14

Hard rule: **document content never enters the control plane.** The planner, the router's classifier and the recipe selector see only the user goal, the project's plugin inventory and document *metadata* (title, class, freshness). Extracted document text enters only executor steps whose plugin allowlist is already fixed by the plan.

Additionally: retrieved content is delimited and labelled as untrusted data in every prompt; the critic ignores any instruction-shaped content inside cited material; plugin outputs are schema-validated before entering the timeline (already in v1.0); and — importantly — the human gate displays which citations came from documents ingested *after* the goal was submitted.

## B6. Plugin trust root — amends TDD §7.1

v1.0 verifies Ed25519 signatures against nothing in particular, so a self-signed rogue plugin verifies fine. Add:

- An **org trust root**: a public key set embedded in the build, plus an optionally signed policy file listing accepted `keyId`s.
- Manifests carry `keyId`; a signature by an unlisted key is a refusal, audited.
- The rogue-test plugin ships signed by a **valid** key with a **lying manifest** (declares `deny-all`, attempts a POST). That is a much better test: it proves the enforcement boundary rather than the signature check, and those are two different claims.
- Add a second rogue variant signed by an untrusted key, to prove the signature check as well. Two beats, five seconds each.

## B7. Router — residency-aware, amends TDD §6.2

Model load is 5–20s per swap and v1.0's router had no cost term for it. On a 16GB GPU with three specialists this dominates the five-minute target.

```jsonc
{
  "taskType": "vision",
  "candidates": [
    { "model": "qwen3-vl:8b-q4", "provider": "ollama", "locality": "loopback",
      "quality": 0.82, "minContext": 16384, "estLoadS": 9, "pinned": true },
    { "model": "qwen2.5-vl:7b-q4", "provider": "ollama", "locality": "loopback",
      "quality": 0.74, "minContext": 8192,  "estLoadS": 8 }
  ],
  "reason": "drawing understanding requires the vision specialist"
}
```

Resolution: filter for admissibility (mode, trust boundary, health, capability, context budget) → rank by `quality − wL·(loaded ? 0 : estLoadS/latencyBudget)`. Plus two scheduling rules in the executor: **ready steps are grouped by resolved model** so same-model steps run back to back, and registry entries may be `pinned` (`keep_alive: -1`) per hardware class. Chain statistics feed the benchmark as in v1.0.

Also mandatory, and a silent-failure footgun in v1.0: `contextWindow` is an explicit registry field and is passed as `num_ctx` on every Ollama call. Ollama applies a small default (2–4k depending on version) and **truncates long prompts without erroring** — the drafting step would lose its SOP context with no visible failure.

## B8. API and event surface — amends TDD §12

Additions (all Zod-validated, all additive):

```
POST   /tasks/:id/cancel                     # cooperative cancellation in the graph
GET    /tasks/:id/events?since=<seq>         # replay after a dropped socket
GET    /documents/:id/status                 # ingestion is a long job
POST   /documents/:id/classify               # documentClass + review cycle
POST   /documents/:id/freshness-ack          # reviewer acknowledgement (B1.3)
GET    /review-queue  ·  POST /review-queue/:id/decision
GET    /models/:id/health  ·  POST /models/:id/smoketest
GET    /audit/verify                         # chain + signature + count walk
GET    /sovereignty/evidence                 # per-run capture artefacts
GET    /bench/runs  ·  POST /bench/run       # admin
```

WebSocket additions: `plan.ready`, `task.complete`, `task.failed`, `step.retry`, `ingest.progress`, `cache.hit`. **Every event carries `seq`**, monotonic per task, so the client can detect a gap and replay.

Three of these close holes rather than adding features: there was no way to cancel a running task (which you will want the first time a local model hangs on stage), no way to recover a timeline from a dropped socket mid-demo, and the Review Queue was one of five load-bearing screens with no endpoints at all.

## B9. Data model — amends TDD §11

Add four collections and resolve two inconsistencies. v1.0 referenced a "metrics collection" as the instrument for every benchmark number without listing it, and declared the model registry "intentionally absent" while §4.3 called it a MongoDB collection and §12 exposed CRUD for it.

| Collection | Carries |
|---|---|
| `modelRegistry` | Entries with digest, quantisation, contextWindow, capabilities, device hints, pin flag, health, signature status |
| `benchRuns` | Run id, phase, mode, task results, latencies, router decisions, verdicts, evidence artefact refs |
| `chainAnchors` | Signed anchors per B3 |
| `reviewQueue` | Approval items, freshness-audit items, critic escalations, classification tasks |

Field additions: `documents` gains `documentClass`, `asOfDate`, `supersededBy`, `classificationSource`; `chunks` gains `embeddingModelId`, `dim`; `tasks` gains `recipeId`, `cancelledAt`; `artifacts` gains `templateId`, `templateVersion`.

## B10. Ingestion hardening — amends TDD §8.1

Untrusted OOXML/PDF parsing moves out of the gateway process into the sandbox tier (zip bombs, XXE, malformed-page loops are a live attack class for any document-ingestion product). Caps: max file size, max pages, max expansion ratio, wall-clock timeout, and a parse-failure path that surfaces on the timeline rather than throwing in the gateway.

## B11. P&ID pipeline — amends TDD §3 and PDD §5.3

A 7B VLM fed a dense high-DPI drawing at ~1024px will miss most symbols and misread most tag numbers — and it cannot give the reliable bounding boxes that Journey 3's "each entry linked to its region on the drawing" promise requires. Four-stage pipeline instead:

1. **Tile** the sheet with overlap at native resolution; de-duplicate detections by geometry across tile seams.
2. **Detect** symbols with a small ONNX object detector (yolov8n-class, finetuned on a public P&ID symbol set) via `onnxruntime-node`. This is what produces the boxes.
3. **OCR the crops** — tag bubbles and line numbers individually, which is far more reliable than asking a VLM to read a whole sheet.
4. **VLM for semantics only** — relationships, service description, connectivity — over the structured detection output, not over raw pixels.

Metric to add to the benchmark: tag/symbol extraction **precision and recall** against hand-labelled ground truth on the ten-drawing corpus. v1.0 had no accuracy metric for its highest-risk feature.

## B12. Demo timing correction — amends PDD §12

The 6:30–7:15 beat gives 45 seconds to rerun "the same task" on a 3B CPU-class model, vision step included. Cold load alone exceeds that. Revised beat:

- Flip the mode. Counters settle to zero. **Rerun one bounded step** — drafting from the already-extracted JSON — on the local model, live.
- Show the full sovereign pipeline as a **labelled recording** with its pcap evidence and benchmark scorecard beside it. Labelled, on screen, in words.

That is both honest and stronger: a recording accompanied by a packet capture and a repeatable harness is better evidence than a live run nobody can verify. And if Part D lands you GPU access before the final, the beat becomes live and you change one sentence.

## B13. Scope and ownership — amends PDD §6.3 and §15

**Plugin count.** Ten prototype plugins is padding, and "seventeen-plus / twenty capabilities" invites a judge to count depth. Piping simulation is a *tool of* engineering-calc, not a peer plugin. Data-visualizer folds into the report generator. Honest framing, which scores better: **six real capabilities, three trivial marketplace demos, two rogue variants.**

**Ownership.** v1.0 gave Nishakumari ingestion + vector search + freshness + OCR/vision + P&ID parser — the largest and most technically uncertain sphere in the build, unpaired, while the critical path had two people on it. Rebalance:

| Member | Sphere (revised) |
|---|---|
| Kartik Khandelwal | Agent core: LangGraph, recipes + plan DAG, executor, cancellation, Express/WS, API contracts |
| Sarthak Shrivastav | PAL, adapters, **conformance suite**, registry, residency-aware router, constrained decoding, cassettes |
| Nishakumari | Ingestion, hybrid retrieval, reranker, Freshness Engine (B1) |
| Pavanijaiswal | Tauri shell, five screens, streaming timeline, marketplace UI + the three trivial demo plugins |
| Archit Vishwakarma | Guard planes, network topology (A7), signed audit chain, watermarking, DNA, RBAC, installer |
| Saurabh Sahu | **P&ID CV pipeline (B11)** + benchmark harness + demo. Paired with Nishakumari on the vision boundary |

The P&ID CV pipeline is the single largest technical unknown; it gets a dedicated owner. Benchmarks move to week 1 (see P0), so Saurabh builds the harness before it is needed rather than after.

---

# Part C — Phase plan

Six phases. Each has an objective, the workstreams, and **exit criteria that are testable** — a phase closes on its CI suite passing, not on features being present. Week numbers are relative; map them onto your actual SIH round dates.

Two structural changes from v1.0's P0–P3:

- **The benchmark harness is built in week 1, not week 7.** v1.0 put measurement in the final phase, which means tuning prompts, chunking and routing blind for six weeks. This is the single most expensive sequencing choice in the baseline.
- **A walking skeleton spans all eight pipeline steps by end of week 2** — ugly, stubbed, but end to end. v1.0's phases were horizontal, so the flagship pipeline first integrated in P2/P3, leaving integration discovery for the last fortnight.

---

## P0 — Foundations and contracts · Week 1

**Objective:** every contract in code, every measurement instrument in place, zero features.

| Workstream | Owner | Content |
|---|---|---|
| Monorepo + schemas | Kartik | pnpm workspaces; `packages/schemas` with the full Zod surface: API, WS events, plan DAG, manifest, audit event (B2), registry entry |
| Storage | Archit | Compose: Mongo 8 + Qdrant, `internal: true` network, gateway port only published (A1, A7) |
| PAL + conformance | Sarthak | `ProviderAdapter` interface; Ollama and NIM adapters; **conformance suite** (tool calling, streaming, JSON-schema decoding, vision, context ceiling, digest reporting) that any provider must pass |
| Cassettes | Sarthak | Record/replay layer for PAL calls, keyed by (model digest, prompt hash, seed) (A12) |
| Corpus freeze | Saurabh | 10 scanned inspection reports, 10 P&IDs, 10 calc tasks with known answers, 10 coding tasks; seeded-error variants; **hand-labelled P&ID ground truth**; ≥1 Hindi document (see F) |
| Benchmark harness | Saurabh | `pnpm bench` → scorecard across all seven PDD metrics. It prints 0/40 in week 1. That is the point |
| Acceptance test | Kartik | Playwright test for the full flagship pipeline, written now, red until P3 |
| Sidecar security | Archit | Loopback bind, random port, shell↔sidecar shared secret, origin allowlist (A14) |

**Exit criteria**
- `pnpm bench` runs end to end and prints a scorecard of zeros with named failures.
- `pnpm conformance --provider ollama` and `--provider nim` both pass.
- The service tree runs with **no route to the internet** and the app still boots; `docker compose` config asserted in CI.
- Chain verification (`GET /audit/verify`) passes on a synthetic 1000-event chain including a signed anchor, and **fails** on a truncated one.
- CI green: schemas, decay function unit tests (B1.2 table as test cases), routing resolution, chain verification.

**Risk retired:** blind development. From week 1, every change has a number attached.

---

## P1 — Walking skeleton · Week 2

**Objective:** one scanned PDF in, one watermarked .docx out, through all eight pipeline steps, with everything stubbed that can be stubbed.

| Workstream | Owner | Content |
|---|---|---|
| Graph | Kartik | All nine LangGraph nodes wired; Mongo checkpointer; cooperative cancellation; one hardcoded recipe, **no LLM planner yet** |
| Streaming | Kartik + Pavani | WS with `seq` on every event; `GET /tasks/:id/events?since=` replay; timeline renders from the event sequence |
| Extraction | Nishakumari | Text-layer path real; scan path stubbed to a fixture |
| Retrieval | Nishakumari | Local embeddings (A2), Qdrant + MiniSearch, RRF, no rerank yet |
| Artifacts | Pavani | Approval-note .docx **template** + field-object renderer (A11); watermark layers |
| Audit | Archit | Event stream, hash chain, signed anchors (B3), DNA record assembly |
| Sandbox | Archit | Plugin container runner, `--network=none` (A6); one first-party calc tool through it |

**Exit criteria**
- Flagship acceptance test passes **in cassette mode** end to end.
- Artifact carries all three watermark layers; DNA record exports as signed JSON and verifies with the offline verifier.
- Task cancellation mid-step leaves a consistent record and a `task.failed` event.
- Killing the WebSocket mid-task and reconnecting reproduces the identical timeline from `?since=`.
- `pnpm bench` reports non-zero on at least the latency and completion metrics.

**Risk retired:** integration surprise. Everything after this deepens a working thread instead of hoping the seams meet.

---

## P2 — Sovereign identity · Weeks 3–4 · **gate: internal round**

**Objective:** the claims the product stands on, working and measured.

| Workstream | Owner | Content |
|---|---|---|
| Dual mode | Sarthak + Archit | Mode state machine, guarded audited transition, perimeter model (B2), `outskirts-sovereign` build target with the NIM adapter compiled out (A13) |
| Dashboard | Pavani | Live perimeter-crossing counters, locality-tagged log with resolved hosts, mode history, alert stream |
| Router | Sarthak | Residency-aware resolution (B7), fallback chains, router panel with recorded reasons, `num_ctx` enforcement |
| Planning | Kartik | Recipe library + selector; free-form planner with constrained decoding (A8, A9); control/data plane split (B5) |
| Critic | Kartik + Saurabh | C1–C5 deterministic checks (B4), C6 prompt, repair budget, escalation |
| RBAC | Archit | Three roles, deny-by-default, enforcement at gateway/data/plugin, **every refusal an audit event** |
| Plugins | Archit + Saurabh | Manifest validation, trust root and keyId allowlist (B6), lifecycle, both rogue variants |
| Evidence | Archit | Per-run `tcpdump` capture wired into the benchmark runner; `GET /sovereignty/evidence` |

**Exit criteria — internal round floor**
- Mode flip is live, audited, and visible; counters settle to zero; a task in flight completes under its launch mode.
- **Zero-egress test is a CI citizen** and its evidence is a packet capture, not a counter the app maintains.
- Both rogue variants blocked and logged: the lying-manifest one at the network boundary, the untrusted-key one at signature check.
- Router panel shows a coding request and a document request taking different specialists, with recorded reasons.
- Deterministic critic catches **100% of seeded arithmetic errors** and ≥90% of seeded citation errors on the corpus. Report the LLM-dependent number separately.
- RBAC refusal matrix covered by supertest, including the export gates.
- `outskirts-sovereign` binary contains no NIM adapter — asserted by a build test.

---

## P3 — Intelligence surfaces · Weeks 5–6 · **gate: regional round**

**Objective:** the capability breadth, with accuracy numbers attached.

| Workstream | Owner | Content |
|---|---|---|
| OCR / vision | Nishakumari | VLM-first with tiling, tesseract.js fallback, extraction schema validated pre-grounding, ingestion hardening (B10) |
| P&ID | Saurabh + Nishakumari | Four-stage pipeline (B11): tile → ONNX detector → crop OCR → VLM semantics; region-linked table in the UI |
| Retrieval v2 | Nishakumari | Cross-encoder reranker (A3), freshness-weighted fusion, Freshness Engine per B1 with document classes |
| Calculation | Saurabh | Engineering-calc plugin with piping simulation as a tool; unit-checked; steps recorded; C2 replay path |
| Artifacts v2 | Pavani | .xlsx and .pptx templates; ECharts labelled exhibits |
| Code sandbox | Archit + Pavani | S1 network-disabled iframe live preview, export path |
| Marketplace | Pavani | Catalogue, permission preview, install/enable, guard flags, three trivial demo plugins |
| Review queue | Kartik + Pavani | Approvals, freshness acknowledgement (B1.3), critic escalations, classification tasks, DNA one click deep |

**Exit criteria — regional round floor**
- Flagship pipeline passes against the **live corpus**, not cassettes, in dev mode.
- P&ID tag extraction P/R measured and recorded; region links resolve to correct crops.
- Freshness banner fires deterministically on the seeded stale SOP; a CRITICAL citation **blocks the human gate** until acknowledged.
- Coding task produces a working micro-tool and a jury-style interaction works in the preview.
- All seven PDD metrics have a measured value on the scorecard. Any target not met is stated with its number.
- Latency budget table (below) populated from real runs; every over-budget step named.

**Latency budget to instrument — add to TDD §17.** Without this the "under 5 minutes" claim has no diagnostic. Set the budget, measure per step, and the scorecard names the offender.

| Step | Budget (dev) | Budget (sovereign, 24GB GPU) |
|---|---|---|
| Ingest + OCR/vision | 60s | 90s |
| Retrieval + rerank | 5s | 8s |
| Calculation + replay | 5s | 5s |
| Drafting | 60s | 120s |
| Critic C1–C5 | 5s | 5s |
| Critic C6 | 20s | 40s |
| Render + watermark + DNA | 5s | 5s |
| Model load overhead | 10s | 30s |
| **Total** | **~2:50** | **~5:05** |

---

## P4 — Proof and hardening · Weeks 7–8 · **gate: national final**

**Objective:** nothing new. Everything measured, rehearsed and packaged.

| Workstream | Owner | Content |
|---|---|---|
| Benchmarks | Saurabh | Full suite in both modes, pcap evidence per sovereign run, scorecard committed to the repo |
| Replay | Sarthak | Deterministic replay of any recorded task from the chain + cassettes — doubles as the DNA "why did the AI write this" view and the venue fallback |
| Installer | Archit | Offline bundle: Tauri setup, sidecar, compose images, weights for the chosen hardware class, corpus. Installs on a machine with its network cable out |
| Runbooks | Sarthak + Archit | Registry hot-add rehearsed live once; mode transition; key ceremony for the signing key |
| Demo | Saurabh + all | Eight-minute script per B12; every fallback run twice; second screen on the dashboard throughout |
| Perf | Sarthak | Residency tuning, prefix caching, pinning, step grouping against the latency budget |

**Exit criteria — national final**
- Benchmark scorecard committed, with the sovereign run's packet capture as an attached artefact.
- Offline installer verified on a genuinely disconnected machine, on all three target platforms.
- Registry hot-add performed live in under two minutes.
- Full demo rehearsed end to end **five times**, including every fallback path.
- Every number on every slide traces to a scorecard row, or is labelled a design target. No exceptions.

---

## P5 — Post-SIH pilot · Weeks 9–16+

Configuration and hardening, no redesign — which is the promise the two baselines make, and A1/A5/A6/A7 are what make it true.

| Workstream | Content |
|---|---|
| Kernel plane | nftables default-drop egress, DNS sinkhole, eBPF `connect()` audit per process feeding the dashboard's packet view |
| Identity | LDAP/AD integration, replacing local accounts |
| Scale | Mongo + Qdrant HA, multi-user concurrency, per-user token budgets, task queueing against GPU capacity |
| Keys | Signing key moves to TPM/HSM; signed model registry; documented key ceremony |
| Sandbox | S3 container tier for all plugin execution including first-party |
| Ops | Admin runbook, backup/restore, chain-verification maintenance job, clock discipline (air-gapped boxes drift; freshness and audit timestamps both depend on the clock — add a monotonic sequence and an NTP-absent note) |
| Assurance | Third-party pen test; the report is the artefact that closes the sovereignty story for a real buyer |
| Product | Workflow builder full UI (the recipe library from A9, now user-editable), asset lineage views |

---

# Part D — Running on the company's GPUs

Your architecture already earns this: the PAL means the answer is "one adapter, or zero." What follows is the decision path.

## D1. Inventory first

Before choosing anything, establish these eight facts. Most bad GPU decisions come from guessing one of them.

```bash
nvidia-smi                                  # model, VRAM, driver, ECC
nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv
nvidia-smi -L                               # MIG instances, if any
docker info | grep -i runtime               # nvidia-container-toolkit present?
python -c "import torch;print(torch.__version__, torch.version.cuda)"
curl -s -m 5 https://huggingface.co > /dev/null && echo "egress OK" || echo "air-gapped"
df -h /  ; free -g                          # weight staging space, host RAM
id ; groups                                 # root? docker group? Slurm-only?
```

The five that change the plan: **VRAM per GPU**, **whether you get root or Docker**, **whether the box has outbound network** (determines how weights arrive), **whether it is shared or dedicated**, and **whether the company holds an NVIDIA AI Enterprise entitlement**.

## D2. Three serving paths, in preference order

### Path 1 — Self-hosted NIM containers *(best, if there is an NVAIE entitlement)*

NIM microservices are downloadable containers that expose the **same OpenAI-compatible API** as `integrate.api.nvidia.com`. Running them on the company's GPUs means your existing adapter works unchanged — you point `baseUrl` at the internal host and change the provider id to `nim-selfhosted`.

```bash
docker login nvcr.io                        # NGC API key
docker run --rm --gpus all --shm-size=16g \
  -e NGC_API_KEY -v /srv/nim-cache:/opt/nim/.cache \
  -p 8000:8000 nvcr.io/nim/<publisher>/<model>:<tag>
```

Why this is the strongest option for your story: **zero code delta between development and sovereign deployment**, and the exact model you benchmarked in dev is the one that runs inside the perimeter. It also air-gaps cleanly — the container caches weights to a local volume, so you stage once on a networked host and move the cache. Verify the entitlement and per-model licensing before you build the demo around it.

### Path 2 — vLLM *(best default; recommended even if Path 1 is available)*

vLLM independently fixes two defects in Part B, which is why I would build this adapter in P2 rather than deferring it as v1.0 did:

- **Guided decoding** (`response_format: json_schema`, xgrammar/outlines backends) delivers A8 at the server, so your `PlanStep[]` contract is enforced by the sampler.
- **Automatic prefix caching** makes your long, repeated system prompts nearly free — and your agent makes many small calls sharing a large prefix, which is the ideal case for it.
- **Continuous batching** is what lets several concurrent tasks share one GPU, which Ollama does poorly.

```bash
docker run --gpus '"device=0"' --ipc=host --shm-size=16g \
  -v /srv/models:/models -p 8001:8000 \
  vllm/vllm-openai:latest \
  --model /models/Qwen3-30B-A3B-Instruct \
  --served-model-name outskirts-general \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --enable-prefix-caching \
  --enable-auto-tool-choice --tool-call-parser hermes
```

**Multi-specialist residency — the fix for B7 at the infrastructure level.** One vLLM process per model, pinned to its own GPU or MIG slice, all resident, nothing ever swaps:

```bash
CUDA_VISIBLE_DEVICES=0 vllm serve ... --port 8001   # general / reasoning
CUDA_VISIBLE_DEVICES=1 vllm serve ... --port 8002   # vision
CUDA_VISIBLE_DEVICES=2 vllm serve ... --port 8003   # coder
```

Registry entries carry the port; `estLoadS` drops to zero for all of them; the residency term in the router becomes moot. This is the single biggest latency win available to you, and it is what makes the sovereign-mode latency budget in P3 achievable rather than aspirational.

On a single large GPU, use MIG (A100/H100) to partition, or accept sequential loading with `--gpu-memory-utilization` tuned so two models coexist.

### Path 3 — Ollama *(keep, for CPU and for laptops)*

Ollama stays as the sovereign engine for the CPU-class hardware floor and for the demo laptop — it is the reason your CPU/GPU-viability principle holds. It is slower than vLLM on the same GPU (GGUF and no continuous batching) but it is one binary with model management built in. Keep both adapters; the registry decides.

## D3. Air-gapped weight staging

On a networked machine:

```bash
# vLLM / HF format
huggingface-cli download Qwen/Qwen3-30B-A3B-Instruct \
  --local-dir /stage/Qwen3-30B-A3B-Instruct
# Ollama: pull, then move the blob store
ollama pull qwen3:30b-a3b-q4_K_M
tar czf ollama-models.tgz -C ~/.ollama models
```

Transfer, then on the air-gapped box set `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1`, restore `~/.ollama/models`, and register digests in the model registry. Record the **digest**, not the tag — per A12, a DNA record that names `qwen3:30b` without a digest is not reproducible, because tags move.

This staging bundle is the same artefact as the P4 offline installer. Build it once.

## D4. If the GPUs are not NVIDIA

Your PAL is the whole answer, and this is worth saying out loud in the pitch because it is a real architectural payoff:

| Silicon | Path | Adapter work |
|---|---|---|
| AMD (MI200/MI300) | vLLM ROCm build, or Ollama ROCm | **None** — OpenAI-compatible |
| Intel Gaudi 2/3 | vLLM HPU plugin / optimum-habana | **None** — OpenAI-compatible |
| Huawei Ascend | vllm-ascend, or MindIE | None if OpenAI-compatible; else one adapter |
| Proprietary NPU with its own runtime | Triton Inference Server, or the vendor's gRPC | **One adapter file**, ~200 lines |
| Anything else | Whatever it exposes | One adapter |

The durable answer, and the thing to build in P0 rather than discover later, is the **conformance suite**: a test any provider must pass before it gets a registry entry. It probes streaming, tool calling, JSON-schema decoding, vision input, context ceiling, digest reporting and determinism under a fixed seed, and it writes the results into the registry entry as capability flags. That is what makes "add new models without redesign" a demonstrable claim rather than an assertion — you can run it live on stage against a provider the jury names.

## D5. The sovereignty consequence — read this before using a shared cluster

**A shared, multi-tenant, internet-connected company GPU cluster is not sovereign, and your own dashboard must say so.** Under the four-value locality model (A5) that inference is `lan` — and its trust boundary depends entirely on the box:

| Deployment | Locality | Trust boundary | Honest framing |
|---|---|---|---|
| Ollama on the same workstation | `loopback` | inside | Fully sovereign |
| Dedicated GPU server, air-gapped LAN, org-controlled | `lan` | **inside** | Sovereign — the pilot target |
| Shared company cluster, internet-connected, other tenants | `lan` | **outside** | **Not sovereign.** Development convenience, same category as NIM |
| NIM SaaS | `internet` | outside | Development only, flagged |

Do not let a company GPU cluster quietly become the sovereign story just because the packets stay on a corporate network. If the box is multi-tenant or internet-connected, tag it `outside-perimeter`, let the dashboard count the crossings, and use it for what it is genuinely worth: **benchmarking the models you cannot otherwise run**, so that the sizing table in Part E is measured rather than estimated, and so the P3 sovereign latency budget has real numbers behind it.

Which is the practical answer to your question. Use the company GPUs for two things — measured benchmarks at 24GB and 80GB classes, and one rehearsed live sovereign run if you can get a dedicated slice for the final. Keep the demo's resting state on hardware you control.

---

# Part E — Revised model roster and hardware math

v1.0's roster was dense models (32B dev, 7B sovereign). The significant change since: **MoE models change the arithmetic.** A 30B-total / ~3B-active model gives near-30B quality at ~3B inference cost — high tokens/sec on modest GPUs, and viable even partially offloaded. For an agent that makes many small structured calls, this matters more than raw parameter count.

**Verify current availability and licensing at build time.** The registry design makes swapping a data operation, so treat this as a starting roster, not a commitment.

| Role | Suggested (verify) | Why |
|---|---|---|
| General / reasoning | Qwen3-30B-A3B class, or gpt-oss-20b | MoE: 30B-class quality, ~3B active. gpt-oss-20b is Apache-2.0 and strong at tool calling — which is your bottleneck, not prose |
| Coder | Qwen3-Coder-30B-A3B class | Same MoE economics for the Journey 2 workload |
| Vision | Qwen3-VL / Qwen2.5-VL 7–8B | Tiled per B11; the detector does the boxes, so the VLM only needs semantics |
| Embeddings | bge-m3 or Qwen3-Embedding-0.6B, ONNX | Local always (A2); 0.6B is fast on CPU |
| Reranker | bge-reranker-v2-m3 or Qwen3-Reranker-0.6B, ONNX | Milliseconds per pair (A3) |
| **Pilot-class** | **gpt-oss-120b** (~117B total / ~5B active) | Fits a single 80GB GPU. This directly answers the PS's "120B-class hardware" bullet — worth pursuing if Part D lands you an A100/H100 slice |

Revised sizing, replacing TDD Table 13:

| Hardware | Resident | Approx. footprint | Behaviour |
|---|---|---|---|
| CPU only, 16GB RAM | 3–4B general + 2B vision, embeddings+reranker on CPU | 6–8GB RAM | Quality floor. Viable, slow. Bounded demo steps only (B12) |
| 1 × 16GB GPU | gpt-oss-20b-class + 7B vision; coder on demand | 13–15GB | Two specialists resident, one swaps |
| 1 × 24GB GPU | 30B-A3B general + 7B vision + coder on demand | 20–22GB | The realistic pilot floor. Latency budget in P3 is set here |
| 2 × 24GB or 48GB | Full table resident, one vLLM process per GPU | 40GB+ | Nothing swaps. Best latency-per-rupee |
| 1 × 80GB | gpt-oss-120b-class + specialists via MIG | 70GB+ | Satisfies the PS's aspirational bullet |

Residency hints stay registry fields, and the adapter keeps reporting actual device placement so the dashboard shows the truth rather than the plan — that part of v1.0 was right and is retained.

---

# Part F — Edit list for the Word baselines

| Document | Section | Action |
|---|---|---|
| PDD | §1, §6.2 | Remove "the only external traffic is inference" — it was false with Atlas. Restate per A1: no managed cloud storage in either mode |
| PDD | §5.3 | Journey 3 region-linking is delivered by the detector, not the VLM (B11) |
| PDD | §6.2–6.3 | Recount to six real capabilities + three demos + two rogue variants (B13). Drop the "twenty capabilities" framing |
| PDD | §6.4 | Move recipe library (reduced workflow builder) from should-have to must-have, per A9 |
| PDD | §9 | Egress instrument is a packet capture on an isolated network (A7), not a deferred kernel monitor. Split latency targets into dev and sovereign. Add P&ID extraction P/R. Add the two-part critic number (deterministic vs LLM) |
| PDD | §12 | Replace the 6:30–7:15 beat per B12 |
| PDD | §13 | Add: shared company GPU is `outside-perimeter` (D5). Add: no real MRPL documents in any cloud service, ever |
| PDD | §15 | Ownership rebalance per B13 |
| PDD | §2.3 | Either seed a Hindi document into the corpus and measure it, or drop Hindi from the positioning. Do not claim it untested |
| TDD | §3 | Table 3: strike Atlas; add Qdrant, MiniSearch, ONNX reranker, container runtime, cassettes, conformance suite |
| TDD | §4.1–4.2 | Replace the audit event and locality types with B2 |
| TDD | §4.3 | `contextWindow` mandatory; digest recorded; registry is a real collection (B9) |
| TDD | §5.1 | Recipe-first planning + constrained decoding (A8, A9); control/data plane split (B5) |
| TDD | §5.3 | Replace with B4 |
| TDD | §6.2 | Replace routing entry and resolution with B7 |
| TDD | §7.1, §7.4 | Trust root and keyId allowlist; two rogue variants (B6) |
| TDD | §8.1 | Local embeddings always (A2); ingestion hardening (B10); tiling |
| TDD | §8.2 | Qdrant + MiniSearch + ONNX reranker (A3, A4) |
| TDD | §8.3 | Replace in full with B1 |
| TDD | §9 | Container-with-no-network is the default tier for third-party plugins (A6) |
| TDD | §10.1 | App plane is best-effort; **topology** is the enforcement (A7); kernel plane is pilot hardening |
| TDD | §10.2 | Replace with B3 |
| TDD | §11 | Add four collections and the field additions (B9) |
| TDD | §12 | Add the endpoints and events in B8; `seq` on every event |
| TDD | §13 | Sidecar bind, port and handshake (A14) |
| TDD | §15.1 | Replace Table 13 with Part E. Add Part D as a new §15.3, "Serving on organisation GPUs" |
| TDD | §17 | Harness lands in P0; add the latency budget table; add pcap evidence retention; add cassette-mode CI |
| TDD | §19 | Replace the phase plan with Part C |

---

## Closing note

Nine of the fifteen defects behind this addendum are cheap to fix *now* and expensive to fix in week six — the embedding-space mismatch, the storage decision, the locality model, the plugin boundary, the network topology, the audit signing, the API surface, the event sequencing and the harness sequencing. None of them are visible in a demo until they fail in one. The repository is empty today, which is the cheapest possible moment for all nine.

The two that are genuinely hard are the P&ID pipeline and local-model reliability under structured output. Both now have a named owner, a measurement, and a mechanism rather than a hope.
