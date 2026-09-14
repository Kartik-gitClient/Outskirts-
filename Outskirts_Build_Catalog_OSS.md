# Outskirts — Open Source Build Catalog

**Companion to** PDD v1.0, TDD v1.0 and Design Addendum v1.1
**Team PRITHVEDA · SIH 2026 · PS 26117 (MRPL)**
**Research date:** 12 September 2026

Every module the product needs, mapped to what already exists. Verification status is marked per entry:

- **[V]** — fetched and verified from the project's own source on 12 Sep 2026
- **[K]** — from prior knowledge, not re-verified; confirm before committing
- Licences are as stated by the project. Treat every licence note as "verify before the pilot," not legal advice.

---

## 0. The headline finding: one language spine is the wrong principle

TDD §1.1 commits to "TypeScript end to end … so the six-person team reviews one language," with a single sanctioned exception for a PaddleOCR sidecar. The research says that exception is not an exception — it is a whole plane of the product.

Here is what TypeScript-only costs you, all of it verified below:

| Capability | Best-in-class option | Ecosystem |
|---|---|---|
| Pipe pressure drop, friction factors, valves, orifices, two-phase flow | `fluids` (MIT) | Python |
| Thermophysical properties | CoolProp (MIT) | Python/C++ |
| Units and dimensional analysis | Pint (BSD) | Python |
| Symbolic math, formula verification | SymPy | Python |
| Document conversion | Docling (MIT), MinerU, PaddleOCR (Apache-2.0) | Python |
| Layout, table, formula extraction | PP-StructureV3, Table Transformer (MIT) | Python |
| P&ID symbol detection | RF-DETR (Apache-2.0) | Python |
| Embedding + rerank serving | TEI (Apache-2.0) | Rust binary, Python ecosystem |
| BM25 at prototype scale | bm25s (MIT) | Python |
| RAG evaluation | Ragas (Apache-2.0) | Python |
| LLM red teaming | garak (Apache-2.0) | Python |
| Hindi/Indic translation | IndicTrans2 (MIT) | Python |

Writing TypeScript equivalents of even three rows of that table would consume your eight weeks. The Darcy-Weisbach implementation your TDD Appendix A sketches by hand is one function out of several hundred validated correlations in `fluids`, and the ones you would not write — Colebrook variants, two-phase regime maps, control-valve sizing to IEC 60534 — are exactly what makes an output look credible to a refinery engineer.

**Recommendation — replace the "one language spine" principle with a two-plane rule:**

> **Control plane in TypeScript** — Tauri shell, gateway, agent graph, plugin host, schemas. One language for everything the team reviews daily.
> **Capability plane in Python** — perception and engineering services, behind a generated OpenAPI/Zod contract at the boundary. Each service is a container on the internal network, no egress, exactly like a plugin.

You lose nothing architecturally: the plugin contract already describes a process boundary with declared permissions, so a Python service *is* a plugin by your own definition. You keep schema-sharing discipline by generating the TS client from the service's OpenAPI spec. And the sovereignty story is unchanged — these containers sit on the same `internal: true` network as everything else.

This is the single highest-leverage decision in this document. Everything below assumes it.

---

## 1. Provider abstraction, serving and routing

### 1.1 Inference serving — GPU

**vLLM** — Apache-2.0 **[V]**
`github.com/vllm-project/vllm` · ~91.5k stars, 2000+ contributors

The default choice for your GPU path, and it directly retires two defects from Addendum Part B:

- **Structured outputs via xgrammar or guidance** — delivers A8 at the sampler, so a schema-invalid `PlanStep[]` becomes unrepresentable rather than retried.
- **Prefix caching, chunked prefill, continuous batching** — your agent makes many small calls sharing a long system prefix; this is the ideal workload for it.
- **OpenAI-compatible server, plus Anthropic Messages API and gRPC** — zero adapter work.
- 200+ model architectures; quantisation across FP8, NVFP4, MXFP4, INT8/4, GPTQ/AWQ, GGUF.
- Tool calling and reasoning parsers built in.

**Hardware — this is the answer to the proprietary-GPU question.** Native: NVIDIA, AMD, Intel GPU, CPU (x86/ARM/PowerPC). Via plugins: **Google TPU, Intel Gaudi, IBM Spyre, Huawei Ascend, Rebellions NPU, Apple Silicon, MetaX GPU.** If the company's accelerator is on that list, your PAL needs no new adapter at all.

**SGLang** — Apache-2.0 **[K]**
Competitive alternative; RadixAttention prefix caching is excellent for agent loops with shared prefixes. Worth benchmarking against vLLM if you get sustained GPU access.

**TensorRT-LLM** — Apache-2.0 **[K]**
Fastest on NVIDIA, worst ergonomics. Only if a pilot demands maximum throughput on fixed hardware.

### 1.2 Inference serving — CPU and laptop

**llama.cpp** — MIT **[K]**
The substrate under most local tooling. GGUF, CPU/GPU hybrid offload, wide quantisation. Direct use gives you the most control over `num_ctx` and offload layers — which matters given the silent-truncation footgun in Addendum B7.

**Ollama** — MIT **[V]**
`github.com/ollama/ollama` · built on llama.cpp, with MLX now present in the tree (Apple Silicon). Current model shelf named in the README: Kimi-K2.6, GLM-5.2, MiniMax, DeepSeek, gpt-oss, Qwen, Gemma. Keep it for the CPU-class floor and the demo laptop — the model-management ergonomics are worth the throughput cost. Offline import is via Modelfile from a local GGUF, or by moving the blob store.

**LocalAI** — MIT **[K]**
Broader than Ollama (text, vision, audio, image gen behind one OpenAI-compatible API). Worth a look if you want one endpoint covering the image-generation marketplace demo too.

### 1.3 Model residency and swapping — solves Addendum B7

**llama-swap** — MIT **[V]**
`github.com/mostlygeek/llama-swap` · single Go binary, zero dependencies, one YAML file

This is a direct fix for the model-thrashing defect, and better than the router-side mitigation I proposed:

- Inspects the `model` field on an OpenAI-compatible request and starts the matching upstream server, shutting down the previous one.
- **`matrix` mode** — a swap-logic DSL allowing several models loaded concurrently. This is precisely the residency control your 16–24GB hardware classes need.
- **`ttl` / `unloadTimeout`** — automatic unloading after idle.
- **`hooks`** — preload models at startup, so the demo is pre-warmed by configuration rather than by a manual script.
- `POST /api/models/unload`, `/running` endpoint, and profiles for runtime model-ID routing.
- Backends: llama.cpp (best supported), vLLM, ik-llama, tabbyAPI, whisper.cpp, stable-diffusion.cpp, ComfyUI — "any OpenAI compatible server would work."

Put llama-swap in front of llama.cpp/vLLM and your registry's `pinned` and `estLoadS` fields become configuration rather than code. The `/running` endpoint also feeds the dashboard's honest "where is inference actually resident" view.

### 1.4 Gateway, routing, fallbacks

**LiteLLM** — MIT **[K]** *(fetch blocked; verify)*
100+ providers behind an OpenAI-compatible shape, with a proxy offering routing, fallback chains, retries, budgets, caching and logging hooks. **Do not adopt it as your PAL** — the PAL is your sovereignty choke point and must stay yours. Read it as the reference implementation for fallback-chain semantics and provider-capability modelling, and use it in development to test adapter behaviour.

**Mastra** — Apache-2.0 (`ee/` dirs under a separate enterprise licence) **[V]**
`github.com/mastra-ai/mastra` · TypeScript-native. Model router across 40+ providers behind one interface; graph workflow engine with `.then()/.branch()/.parallel()`; suspend/resume backed by storage for indefinite human-in-the-loop pauses. A serious alternative to LangGraph.js for a TS team, and its suspend/resume is a cleaner fit for your human gate than a checkpointer you wire yourself.

### 1.5 Structured output / constrained decoding — A8

**XGrammar** — Apache-2.0 **[K]** · integrated in vLLM **[V]**
**Outlines** — Apache-2.0 **[K]**
**llguidance / guidance** — MIT **[K]** · also integrated in vLLM **[V]**

For Ollama/llama.cpp, use the native GBNF grammar support or the JSON-schema `format` parameter **[K]**. Pipeline to build once: Zod → JSON Schema → provider-native constraint. Put it in `packages/pal` so no call site can skip it.

### 1.6 Provider conformance — build this, nothing exists

No open-source suite tests "does this endpoint support tool calling, JSON-schema decoding, vision input, streaming, seeded determinism, and what is its real context ceiling." Build it in P0 as `packages/pal/conformance`. It is ~400 lines, it is the thing you run live on stage when a judge names a provider, and it is what makes "add models without redesign" demonstrable.

---

## 2. Agent core

### 2.1 Orchestration

**LangGraph / LangGraph.js** — MIT **[V]**
`github.com/langchain-ai/langgraph` · JS/TS equivalent at `langchain-ai/langgraphjs`
Durable execution with automatic resume from failure point, human-in-the-loop state inspection and modification, short- and long-term memory. Usable without LangChain. Your baseline choice; it holds up.

**Mastra** — see §1.4. **Pydantic AI** — MIT **[K]**, the best-typed Python option if any agent logic moves to the capability plane. **Temporal** — MIT **[K]**, real durable execution if a pilot needs multi-day workflows; heavy for a prototype.

### 2.2 Plan DAG — validation and visualisation

Graph algorithms (acyclicity, topological order, reachability) are `graphlib` **[K]** in TS or `networkx` **[K]** in Python — do not hand-roll cycle detection.

**React Flow (xyflow)** — MIT **[V]**
`github.com/xyflow/xyflow` · `@xyflow/react`, plus Svelte Flow
Node-based UI canvas with MiniMap, Controls, Background, and the `useNodesState`/`useEdgesState` hooks. This is your plan-DAG timeline and, later, the recipe/workflow builder UI — the same component serves both, which is why the workflow builder becomes cheap once this is in. No commercial restriction; the maintainers ask revenue-generating users for sponsorship, not a licence.

### 2.3 Recipes and workflow building

For the visual builder in P5, study **Node-RED** (Apache-2.0) **[K]** and **Windmill** (AGPL — caution) **[K]**. Note **n8n** is under the Sustainable Use Licence, not open source **[K]** — do not vendor it into a product you may license to MRPL.

---

## 3. Perception and ingestion

This is the densest part of the ecosystem, and where building anything yourself would be waste.

### 3.1 Document conversion — the top of the funnel

**Docling** — MIT (code; models carry their own terms) **[V]**
`github.com/docling-project/docling` · ~66.3k stars · IBM Research Zurich, now **LF AI & Data Foundation**

The strongest single recommendation in this document.

- Input: PDF, DOCX, PPTX, XLSX, HTML, EPUB, images, LaTeX, email (EML/MSG), ODF, audio, video, plus USPTO/JATS/XBRL XML schemas.
- Output: Markdown, HTML, DocTags, **lossless JSON** via the `DoclingDocument` unified model.
- "Advanced PDF understanding incl. page layout, reading order, table structure, code, formulas, image classification."
- **Chart understanding** — barchart, piechart, lineplot converted into tables or code with descriptions.
- VLM support including GraniteDocling; ASR for audio.
- Explicit: **"Local execution capabilities for sensitive data and air-gapped environments."**
- Ships a CLI, a Python API, an MCP server and `docling-serve`.

Foundation governance, MIT, air-gap-first, and one normalised document model — this replaces a large fraction of your ingestion workstream. Nishakumari's sphere shrinks to orchestration and freshness, which is the rebalance Addendum B13 was reaching for.

**MinerU** — MinerU Open Source Licence ("based on Apache 2.0 with additional conditions") **[V]**
`github.com/opendatalab/MinerU` · moved off AGPLv3 at 3.1.0; AGPL models (`doclayoutyolo`, `mfd_yolov8`) and a CC-BY-NC-SA model (`layoutreader`) were removed
Three backends: `pipeline` (CPU-capable, no hallucination, OmniDocBench 86.47), `vlm-engine` (95.30), `hybrid-engine` (95.39 high / 95.26 medium). Current VLM is `MinerU2.5-Pro-2605-1.2B`. 109-language OCR, handwriting, cross-page table merging, header/footer stripping, formula→LaTeX, table→HTML. **Explicitly "Private · Fully Offline."** Notably claims support for **Ascend, Cambricon and Moore Threads** chips — relevant if the company hardware is domestic Chinese silicon. Read the added conditions before a commercial pilot.

**PaddleOCR** — Apache-2.0 **[V]**
`github.com/PaddlePaddle/PaddleOCR` · ~89.4k stars

The most complete toolkit, and cleanest licence of the three:

- **PaddleOCR-VL-1.6 (0.9B)** — 96.3% on OmniDocBench v1.6. A 0.9B model at that score is remarkable for your hardware floor.
- **PP-StructureV3** — the differentiator you need: supplies "table cell coordinates, text coordinates," i.e. **geometry**, where the VL models give text. Your P&ID and inspection-report region-linking promise needs coordinates.
- **PP-OCRv6** — 50 languages in one unified model, no model switching; three tiers (1.5M / 7.7M / 34.5M params); 5.2× CPU speedup.
- **PP-OCRv5 multilingual** added **Devanagari, Telugu, Tamil, Cyrillic, Arabic** — this is your Hindi path.
- PP-DocTranslation, PP-Chart2Table, PP-DocLayoutV3, KIE.
- Deployment: CPU, GPU, **XPU, NPU**, with OpenVINO / ONNX Runtime / TensorRT backends; C++/C#/Java serving; a browser JS SDK.

**Recommendation: PaddleOCR as the primary engine, Docling as the orchestration and document-model layer.** Docling can call into it, and Docling's `DoclingDocument` is the schema your chunker consumes.

**dots.mocr** (formerly dots.ocr) — MIT code, separate model licence agreement **[V]**
`github.com/rednote-hilab/dots.mocr` · 3B, single VLM
Bounding box + category + text for Caption/Footnote/Formula/List-item/Page-header/Picture/Section-header/Table/Text/Title, tables→HTML, formulas→LaTeX, human reading order, single JSON output. olmOCR-bench 83.9±0.9, Tables 90.7. Also does **structured graphics → SVG code** for charts and diagrams. The authors are candid that complex tables/formulas remain hard for a compact model, and SVG picture parsing "has yet to achieve the desired level of robustness."

**Surya** — code Apache-2.0, **weights under a modified AI Pubs Open RAIL-M** **[V]**
`github.com/datalab-to/surya` · 650M params, olmOCR-bench 83.3%
91 languages at 87.2% overall pass rate; **Hindi 82.2%**, Bengali 82.7%. Runs on vLLM (NVIDIA) or **llama.cpp (CPU/Apple Silicon)**.
**Licence caution:** weights are "free for research, personal use, and startups under $5M funding/revenue." An MRPL deployment is neither. Use it for benchmarking; do not build the pilot on it without resolving terms.

**Unstructured** — Apache-2.0 core **[K]**. Broad connector coverage; weaker PDF layout fidelity than the above.

### 3.2 Table, formula and layout extraction

**Table Transformer (TATR)** — MIT **[V]**
`github.com/microsoft/table-transformer`
Table detection plus structure recognition: rows, columns, cells including blank ones, column headers, projected row headers. Weights ~110MB each, trained on PubTables-1M (575k pages / 947k tables) and FinTabNet.c. Note it takes **image input only** and needs OCR/PDF text supplied separately to emit HTML or CSV — it gives you the grid, you supply the characters.

**PP-StructureV3** **[V]** — see above; use when you need cell coordinates.
**DocLayout-YOLO** — **AGPL-3.0** **[V, inferred]** — MinerU removed it from its pipeline over the licence. Avoid.
**UniMERNet** **[K]** — formula recognition; used inside MinerU.
**img2table** (MIT), **Camelot** (MIT) **[K]** — classical table extraction for born-digital PDFs; cheap and deterministic, worth having as a fast path before any model runs.

### 3.3 Object detection for P&ID symbols

**RF-DETR** — Apache-2.0 for the `rfdetr` package and Nano/Small/Medium/Large detection weights, all segmentation sizes, keypoints. XL/2XL and `rfdetr_plus` are under PML 1.0. **[V]**
`github.com/roboflow/rf-detr` · DINOv2 backbone · ICLR 2026 paper

**This replaces YOLO, and the reason is licensing before it is accuracy.**

**Ultralytics YOLO is AGPL-3.0, with a paid Ultralytics Enterprise License required to "bypass the open-source requirements of AGPL-3.0" for commercial and internal-tool use [V].** Every YOLO baseline in RF-DETR's own comparison table is AGPL-3.0. For a product you intend to pilot inside a PSU, AGPL on your core detector is a problem you do not want to discover at procurement.

RF-DETR also wins on the metric that matters to you — **transfer to small custom datasets**. On RF100-VL (100 real-world custom domains), RF-DETR-N scores 57.7 AP50:95 vs YOLO11-N's 55.3 and YOLO26-N's 52.0, and the repo describes the model as "designed for fine-tuning." A P&ID symbol set is exactly a small custom domain.

COCO numbers for sizing: RF-DETR-N 48.4 AP @ 2.3ms; RF-DETR-M 54.7 @ 4.4ms; RF-DETR-L 56.5 @ 6.8ms (T4, TensorRT, FP16, batch 1 — self-reported). Trade-off to note: ~30M params even at Nano vs 2.6M for YOLO11-N, so memory footprint is less favourable than latency suggests.

Alternatives if you need them: **RT-DETR** (Apache-2.0, in PaddleDetection and transformers) **[K]**, **D-FINE** (Apache-2.0) **[K]**, **MMDetection** (Apache-2.0) **[K]**, **Detectron2** (Apache-2.0) **[K]**.

### 3.4 P&ID datasets — the real gap

Searched GitHub and Hugging Face; there is **no substantial public P&ID symbol-detection dataset** **[V — GitHub search returned only four repos, all ≤2 stars; HF dataset search returned nothing for P&ID or piping-instrumentation queries]**. The visible repos are student projects: `TheBatmanCodes/PID_Symbol_Detection_PDF` (YOLOv8 + SAHI, synthetic dataset creation), `anuptiwari2001/pid-extraction-api` (claims ISA-5.1 and PIP standard support), and two others.

**So generate your own, and make that a feature of the pitch.** The approach, which one of those repos independently arrived at:

1. Build an **ISA-5.1 symbol library** as SVG — valves, pumps, vessels, instruments, line types. A few dozen symbols covers a plausible sheet.
2. **Synthesise sheets programmatically**: random placement on a grid, connecting lines with correct routing, tag bubbles with realistic numbering (`P-101A`, `FV-2034`), title blocks, revision clouds. Emit COCO annotations for free, since you placed every symbol.
3. Add realistic degradation: scan noise, JPEG artefacts, skew, blur, moiré, photocopy contrast. This is what makes it transfer to real scans.
4. Fine-tune RF-DETR on the synthetic set, then **validate on a small hand-labelled set of real public P&IDs** — that's your honest accuracy number.

Unlimited perfectly-labelled training data, no licence encumbrance, and a defensible story when a judge asks how you trained it. **SAHI** (slicing-aided hyper inference, MIT) **[K]** handles the tiling-with-overlap and detection-merge step from Addendum B11 — do not write that yourself.

Academic prior art worth reading: the **Digitize-PID** line of work **[K]** and related engineering-drawing digitisation papers. Verify current state; the field has moved.

### 3.5 Handwriting and Indic scripts

**PaddleOCR** **[V]** — Devanagari/Telugu/Tamil in PP-OCRv5 multilingual; handwriting via the VL models.
**MinerU** **[V]** — explicit handwriting support, 109 languages.
**Surya** **[V]** — Hindi 82.2%, but note the weights licence.
**TrOCR** (MIT) **[K]** — transformer handwriting OCR; fine-tunable on Devanagari.
**Kraken** (Apache-2.0), **Calamari** (Apache-2.0) **[K]** — trainable line-level OCR for hard scripts.

### 3.6 Hindi/English — IndicTrans2

**IndicTrans2** — model checkpoints and code **MIT**; corpora CC0 / CC-BY-4.0 **[V]**
`github.com/AI4Bharat/IndicTrans2`
All **22 scheduled Indic languages** across five scripts, En→Indic / Indic→En / Indic→Indic. ~1B base plus distilled variants. RoPE long-context variants to 2048 tokens. Runs entirely locally; **CTranslate2 export for fast inference**. Ships the BPCC corpus and the IN22 benchmark.

For an SIH jury this is better than a generic translation plugin: an Indian open-weight model, MIT-licensed, running air-gapped, from AI4Bharat. It turns your Hindi claim from an untested "could-have" into a measured capability — and IN22 gives you the benchmark to measure it on.

---

## 4. Knowledge layer

### 4.1 Embeddings

**BGE / FlagEmbedding** — MIT **[V]**
`github.com/FlagOpen/FlagEmbedding`
**`bge-m3` is your model.** It is the only one that gives you everything in one pass: **100+ languages** (Hindi included), **8192-token input**, and **unified dense + sparse/lexical + multi-vector (ColBERT) retrieval**. One model, one vector space, hybrid retrieval without a second system. That directly serves Addendum A2 and A4.

Also: `bge-multilingual-gemma2` (stronger, heavier), `bge-en-icl`, `bge-*-v1.5` family, `BGE-VL` (multimodal, MIT).

Lighter options: **Model2Vec** (MIT) **[K]** for static embeddings at extreme speed; **Nomic Embed** (Apache-2.0) **[K]**; **Qwen3-Embedding** **[K]**.

### 4.2 Embedding and rerank serving

**Text Embeddings Inference (TEI)** — Apache-2.0 **[V]**
`github.com/huggingface/text-embeddings-inference`
`/embed`, `/rerank`, `/predict`, `/embed_sparse` (SPLADE). Token-based dynamic batching, no compile step, small images, fast boot. Safetensors and **ONNX**. **Air-gapped deployment with mounted weights is documented.** OpenTelemetry tracing and Prometheus metrics built in — which plugs straight into §8.
Hardware: CPU x86_64/aarch64 (ONNX or Intel MKL), NVIDIA Turing→Blackwell, Apple Metal, ARM64 including Jetson and DGX Spark, experimental AMD ROCm (MI200/MI300). Note **Volta is not supported** and compute capability <7.5 is out.

**Infinity** (MIT) **[K]** — similar role, broader model coverage.

### 4.3 Vector store

**Qdrant** — Apache-2.0 **[V]**
`github.com/qdrant/qdrant` · Rust

Confirms the Addendum A1 recommendation and then some:

- **Dense + sparse + multivector (ColBERT-style late interaction) in one system** — pairs exactly with `bge-m3`.
- **Built-in RRF and DBSF fusion** — your hybrid fusion is a query parameter, not code you write and test. This deletes a whole task from Nishakumari's sphere.
- Rich payload filtering (keyword, full-text, numeric range, geo) with `must`/`should`/`must_not` — this is how you enforce **project scope and role visibility as a pre-filter**, which your RBAC data-scoping requirement needs.
- Quantisation cutting RAM "up to 97%"; on-disk storage for larger-than-memory.
- MMR and relevance feedback; faceting; recommendation by positive/negative example.
- **Qdrant Edge** — in-process, no server, for edge and offline. Interesting for a single-workstation deployment where a container is unwelcome.
- Clients for Go, Rust, JS/TS, Python, .NET, Java.

Heed their own warning: `docker run -p 6333:6333 qdrant/qdrant` "starts an insecure deployment without authentication, open to all network interfaces." On your `internal: true` network that is contained, but set auth anyway.

Alternatives: **LanceDB** (Apache-2.0) **[K]** — embedded, no server, columnar, excellent for a desktop app; **Milvus** (Apache-2.0) **[K]** — heavier, scales further; **pgvector** (PostgreSQL licence) **[K]** — if Postgres is already mandated; **hnswlib** (Apache-2.0) **[K]** — in-process index only.

**MongoDB note:** MongoDB Search / Vector Search for self-managed deployments has licensing and version constraints, and the `mongodb-atlas-local` image is positioned for development **[K — verify]**. Addendum A1's "Qdrant for vectors, Mongo for documents and audit" avoids the question entirely. Keep it that way.

### 4.4 Lexical retrieval

**bm25s** — MIT **[V]**
`github.com/xhluca/bm25s` · pure Python + NumPy, optional Numba
Scores are precomputed into sparse matrices at index time, so query time is mostly lookup. On BEIR small/mid corpora it is **10–45× faster than Elasticsearch** (nfcorpus 1196 vs 46 QPS; scifact 953 vs 21). Five BM25 variants, configurable tokenizer, memory-mapped indices (Natural Questions: 4.36GB → 0.49GB RAM). Environment size 51MB vs 1183MB for an Elastic client and 6976MB for pyserini.

For your corpus scale this is the right answer, and it removes Elasticsearch from the deployment entirely. If you prefer to stay inside Qdrant, use `bge-m3`'s sparse vectors instead and skip a second index — simpler, and one less thing in the installer.

**Tantivy** (MIT) **[K]** — Rust, embeddable, if you want lexical search inside the Tauri process.

### 4.5 Reranking

**bge-reranker-v2-m3** — MIT **[V]** — multilingual, lightweight, the default.
Also `bge-reranker-v2-gemma` (stronger), `bge-reranker-v2-minicpm-layerwise` (pick output layers to trade accuracy for speed), `bge-reranker-v2.5-gemma2-lightweight` (token compression). Serve via TEI's `/rerank`.
**`rerankers`** library (Apache-2.0) **[K]** — one interface over many reranker families; useful for benchmarking which to ship.

### 4.6 Chunking

**Chonkie** (MIT) **[K]** — token, sentence, semantic, recursive and late chunking in one library.
Docling's `HybridChunker` **[V — implied by the DoclingDocument model]** is structure-aware, which beats character windows: it chunks on the document's own headings and table boundaries. Given you are adopting Docling, use its chunker and keep TDD §8.1's 800–1200/120 numbers as the fallback for unstructured text.

### 4.7 Structured and graph knowledge

**Microsoft GraphRAG** (MIT) **[K]**, **LightRAG** (MIT) **[K]**, **nano-graphrag** (MIT) **[K]**.
Out of scope for the prototype, but relevant to one real requirement: a P&ID **is** a graph (equipment, connectivity, line numbers). Once you extract tags and connections, storing them as a graph and answering "what feeds V-101" is a far stronger demo than a flat table — and it is the natural P5 extension of B11.

### 4.8 Freshness and knowledge lifecycle — genuine whitespace

Nothing in the open-source RAG ecosystem models document decay, review cycles or supersession. Searched; it does not exist as a component.

**This is the most defensible originality claim in your product**, and Addendum B1 is the spec. Say it plainly to the jury: retrieval systems universally treat the corpus as timeless, and industrial knowledge is not. The nearest adjacent prior art is data-catalogue freshness (Amundsen, DataHub, OpenMetadata) **[K]** — worth ten minutes of reading for vocabulary you can borrow (owner, SLA, staleness), but nothing to reuse.

### 4.9 Reference platforms to study, not adopt

**RAGFlow** — Apache-2.0 **[V]** · `github.com/infiniflow/ragflow`
The closest architectural sibling to what you are building, and worth an afternoon of reading. Deep document understanding; **template-based chunking that is visualised so humans can intervene and correct it** (a UX idea you should steal outright); multiple recall with fused reranking; traceable citations and key-reference views to reduce hallucination; MinerU and Docling as pluggable parsers; an orchestrable ingestion pipeline; **gVisor for its sandboxed code executor**. Note it ships slim since v0.22.0 and "relies on external LLM and embedding services" — so the air-gap work is still yours.

**Onyx** — MIT community edition **[V]** · `github.com/onyx-dot-app/onyx`
Enterprise search with 50+ connectors, hybrid vector+keyword index, agentic RAG, sandboxed code execution, artifacts. RBAC, SSO/SCIM and PII controls are Enterprise Edition. Study its permission and connector model; its deployment tiers (Lite vs Standard) are also a good template for your CPU-class vs GPU-class split.

**Dify** (modified Apache-2.0) **[K]**, **Haystack** (Apache-2.0) **[K]**, **txtai** (Apache-2.0) **[K]**, **R2R** (MIT) **[K]**.

---

## 5. Reasoning, verification and engineering

### 5.1 Engineering calculation — adopt, do not write

**fluids** — MIT **[V]**
`github.com/CalebBell/fluids` · part of the Chemical Engineering Design Library (ChEDL)

Your engineering-calc and piping-simulation plugins, already written and validated:

- **Pipe sizing, fittings, pressure drop, friction factors**
- **Pumps, control valves, orifice plates and other flow meters, ejectors, relief valves**
- **Compressible flow, open-channel flow, two-phase flow**
- Tanks, atmospheric properties, particle size distributions, drag and sedimentation

SciPy/NumPy are now optional. Python 3.9+, PyPy (6–12× faster), and a **Numba interface** — which matters because it lets you escape the GIL for concurrent calculation steps. MIT licensed.

Sibling libraries in the same family, all by the same author **[K]**: **`thermo`** (phase equilibria, mixture properties), **`chemicals`** (pure-component property data and correlations), **`ht`** (heat transfer). Together they cover most of what a refinery calculation plugin would ever be asked.

**CoolProp** — MIT **[V]**
`github.com/CoolProp/CoolProp`
Thermophysical property database with "similar functionality to REFPROP," free and open. Wrappers for many languages in the `wrappers` directory; `pip install coolprop`. The project explicitly states "Commercial - ok!"

**DWSIM** — **GPL-3.0**, and **the repository was archived by its owner on 11 Aug 2026** **[V]**
`github.com/DanWBR/dwsim`
Full steady-state and dynamic process simulator with flowsheeting, advanced EOS (GERG2008, PC-SAFT), a CoolProp interface, and `DWSIM.Automation` plus IronPython/Octave scripting. **Two blockers:** GPL-3.0 is incompatible with a proprietary pilot, and the project is now read-only. Use it as a reference oracle to validate your own numbers, not as a dependency.

**Cantera** (BSD-3) **[K]** — thermodynamics, kinetics, transport. **OpenFOAM** (GPL) **[K]** — CFD, far beyond scope.

### 5.2 Units and symbolic verification — Addendum B4 checks C1 and C2

**Pint** — BSD **[V]**
`github.com/hgrecco/pint`
Quantity arithmetic with automatic conversion, an editable plain-text unit definition file, temperature scales with differing reference points, **uncertainty propagation** via the `uncertainties` package, NumPy and Pandas integration, and a `pint-convert` CLI. Python 3.12+.

This is your C2 dimensional check. `3 * ureg.meter + 4 * ureg.cm` returning `3.04 meter` — and raising on `metre + kilogram` — is the mechanism that makes "calculation sanity: units consistent" a code assertion instead of a prompt. Uncertainty propagation is a bonus you should use: an approval note that carries ±tolerance on a computed risk figure reads as far more competent than a bare number.

**SymPy** (BSD-3) **[K]** — symbolic math; use it to verify that a stated formula and a computed result agree, which is a stronger C2 than re-running the same code. **mathjs** (Apache-2.0) **[K]** — TS-side units and expression evaluation if you need a check inside the control plane. **js-quantities** (MIT) **[K]**.

### 5.3 Critic, groundedness and hallucination detection

**Ragas** — Apache-2.0 **[V]**
`github.com/explodinggradients/ragas` · ~15.7k stars
LLM-based and traditional metrics, automatic test-set generation, production-aligned test sets, a `rag_eval` template today with agent and workflow templates listed as coming. Custom metrics via `DiscreteMetric` with your own allowed values and prompt — which is how you would implement your C6. Set `RAGAS_DO_NOT_TRACK=true` to disable its anonymised usage reporting. The README example uses OpenAI; local-endpoint support needs checking in the docs.

**DeepEval** (Apache-2.0) **[K]**, **TruLens** (MIT) **[K]**, **Opik** (Apache-2.0) **[K]** — alternatives; Opik is the most self-host-friendly.

**For C1 and C3, build it — and that is the point.** Numeric grounding ("every number in the draft appears in a source") and citation resolvability are twenty lines of code each, deterministic, and near-100% on the error classes that matter. No library will do this better than a regex plus a unit lexicon plus a set-membership test. Addendum B4 is the spec; resist the urge to reach for an LLM judge.

**AlignScore** and **MiniCheck** **[K]** — small models for claim-vs-evidence entailment, if you want a learned component in C3.

### 5.4 Prompt injection defence — Addendum B5

**`protectai/deberta-v3-base-prompt-injection-v2`** — 0.2B, 859k downloads **[V]**
Plus `deberta-v3-small-prompt-injection-v2` (0.1B), `fmops/distilbert-prompt-injection` (67M), and ONNX exports of several **[V]**. 294 models match the search; newer entries include `rogue-security/prompt-injection-jailbreak-sentinel-v2` (0.6B) and `patronus-studio/wolf-defender-prompt-injection` (0.3B). **Check each model card's licence individually — the listing page does not show licences.**

A 0.1–0.2B ONNX classifier runs in-process next to your embeddings at negligible cost. Put it on the ingestion path and on retrieved-chunk text.

**LLM Guard** — MIT, **but the repository is archived and unmaintained, models included** **[V]**
`github.com/protectai/llm-guard`
Still worth reading for its scanner taxonomy — Anonymize, BanCode, PromptInjection, Secrets, Toxicity, InvisibleText on input; Deanonymize, Sensitive, FactualConsistency, MaliciousURLs, NoRefusal, Relevance on output. That list is a ready-made checklist for your own input/output policy. Do not depend on an archived security library.

**NeMo Guardrails** — Apache-2.0 **[V]**
`github.com/NVIDIA/NeMo-Guardrails`
Five rail types, and the taxonomy maps onto your architecture usefully: **input** (block or mask before processing), **dialog**, **retrieval** (drop or alter a chunk before it prompts the LLM — this is exactly your freshness and injection filter point), **execution** (guard tool inputs and outputs), **output**. Library or server, Dockerfile provided, Python 3.10–3.13. Built-in rails include jailbreak and injection detection and hallucination checking.
Two caveats it states itself: **telemetry is on by default** — set `NEMO_GUARDRAILS_NO_USAGE_STATS=1` or `DO_NOT_TRACK=1` *before* startup — and `build.nvidia.com` is "for evaluation and testing only and must not be used in production."
Adopting Colang is a real cost for one prototype feature. Read the rail taxonomy, implement the five hook points in your own executor.

**garak** — Apache-2.0 **[V]**
`github.com/NVIDIA/garak`
NVIDIA's LLM vulnerability scanner — "nmap for language models." Probes: `promptinject`, `encoding` (injection via text encodings), `badchars` (invisible Unicode, homoglyphs, reordering), `dan`, `gcg` (adversarial suffixes against a system prompt), `xss` (data exfiltration), `leakreplay` (training-data replay), `atkgen` (an automated red-team LLM), `malwaregen`, `packagehallucination`, `glitch`, `snowball`. **Works against local models** via `--target_type huggingface` or `ggml` for llama.cpp.

Run garak against your own sovereign deployment in P4 and put the report in the appendix. "We red-teamed our own system with NVIDIA's scanner and here are the results" is a governance claim almost no hackathon team will make, and Farhan's persona is precisely the buyer who asks for it.

---

## 6. Execution sandboxing

Your tiers S1/S2/S3 map cleanly onto existing technology. The important correction from Addendum A6 stands: **the enforcement must be a process or VM boundary, not a monkey-patched global.**

### 6.1 S1 — preview

Browser-native `<iframe sandbox>` plus CSP. No library needed. Nothing escapes a network-disabled iframe with no same-origin access, which is why the Journey 2 preview is safe by construction.

### 6.2 S2 / S3 — untrusted code and plugins

**microsandbox** — Apache-2.0 **[V]**
`github.com/microsandbox/microsandbox`
**MicroVM** isolation — "hardware-level isolation," not shared-kernel containers — while remaining **OCI compatible**, so standard container images work. Boot "under 100 milliseconds" (M1, guest boot). Built on `libkrun` and `smoltcp`. SDKs for **TypeScript**, Rust, Python, Go, Ruby. Spawns as a child process: "No setup server. No long-running daemon. No infrastructure required." Secrets "never enter the VM."
**Runs on Windows via WHP**, macOS via Apple Silicon, Linux via KVM — which matters because your team is on Windows 11.
Flagged beta. But this is a stronger boundary than Docker for hostile code, works on your dev machines, and has a first-class TS SDK. Strong candidate for the plugin runtime.

**gVisor** — Apache-2.0 **[K]** — userspace kernel; syscall interception; what **RAGFlow uses for its code executor [V]**. Linux only. The mature choice for a Linux pilot.

**Firecracker** — Apache-2.0 **[K]** — the microVM underneath much of this category. Linux/KVM only.

**E2B** — Apache-2.0 **[V]**
`github.com/e2b-dev/E2B`
Isolated sandboxes with JS and Python SDKs, a Code Interpreter SDK (`runCode()`), and a Desktop SDK. Self-hostable, but **"deployed using Terraform"** with AWS and GCP as the supported targets — that is cloud infrastructure, which is the wrong shape for an air-gapped single-server deployment. Use the SDK design as a reference for your plugin invocation API.

**Deno** — MIT **[K]** — permission-based runtime (`--allow-net`, `--allow-read`) with deny-by-default. For **first-party signed** plugins this is a genuinely good S2: capability flags at the process level, no container needed, and it is the one runtime in this list whose permission model actually covers network — the gap that Node's does not.

**nsjail** / **bubblewrap** (Apache-2.0 / LGPL) **[K]** — Linux namespace sandboxes; lightweight S2 on a Linux server.

### 6.3 WASM plugin runtime — worth serious consideration

**Extism** — BSD-3-Clause **[V]**
`github.com/extism/extism`
A framework explicitly built for the question your plugin system asks: "Do you want to execute arbitrary, untrusted code from your users? Extism makes that safe and practical to do."

- **Host SDKs** including **Rust, JavaScript (Node/Deno/Bun/Web), Go, Python, Java, .NET, C/C++** — so your Tauri Rust shell *or* your Node sidecar can host plugins.
- **Guest PDKs** in Rust, JavaScript, Python, Go, C#, AssemblyScript, Zig, C/C++ — plugin authors are not forced into your language. That makes the marketplace story real rather than aspirational.
- **"Secure & host-controlled" HTTP that works without WASI** — the host decides what network access exists, and outbound calls happen only when permitted. **This is capability-based networking, which is exactly the mechanism TDD §7.4 claims and Node cannot provide.**
- Runtime limiters and timers for your `resources: { cpu, mem, timeoutS }` caps.
- XTP Bindgen generates PDK bindings from an OpenAPI-style schema — your `ToolSpec` could compile straight into plugin scaffolding.

Their README is an orientation page and asserts these properties without a threat model, so evaluate the runtime source before relying on it. But if it holds up, Extism turns your rogue-plugin test from "we monkey-patched fetch" into "the plugin has no network capability because the host never granted one" — a categorically better claim, and one a security-literate judge will recognise.

**Recommended split:** Extism/WASM for marketplace plugins (untrusted, multi-language, capability-gated), microsandbox or gVisor for heavyweight first-party services (the Python capability plane), `iframe` for previews.

---

## 7. Artifact generation

### 7.1 Office formats

**docxtemplater** — core MIT **[V — licence file not shown on the page; verify]**
`github.com/open-xml-templating/docxtemplater`
Template-driven .docx/.pptx generation, which is Addendum A11 exactly: author a real Word file with `{placeholders}`, feed it JSON. Loops (`{#users}{name}{/users}`), table loops, conditionals with angular parsing, raw XML injection. Runs in Node or the browser. Its stated advantage is the one you want: **"templates can be edited by non-programmers, for example your clients"** — an MRPL officer can adjust the approval-note layout without touching your code.

**Important caveat:** many modules are **paid** — Image (`{%image}`), HTML, **XLSX**, Chart, QrCode, Slides, Subtemplate, Meta (watermarks, read-only, margins), Styling, Footnotes. Your visible watermark and any embedded chart or logo would need the Image and Meta modules. Budget for it or plan around it.

**Alternatives, all free:**
- **`docx`** (MIT) **[K]** — programmatic .docx in TS; more code, no licence ceiling.
- **python-docx**, **openpyxl**, **python-pptx** (MIT / BSD) **[K]** — the Python capability plane already exists, so these become available at no extra architectural cost. `python-docx-template` (LGPL) gives Jinja2 templating over .docx.
- **exceljs** (MIT), **pptxgenjs** (MIT) **[K]** — your v1.0 choices; keep them.
- **LibreOffice headless** (MPL-2.0) **[K]** — format conversion and PDF export of anything. Heavy, but it is the only reliable .doc/.xls legacy path, and a refinery will have legacy files.

### 7.2 PDF and typesetting

**Typst** — Apache-2.0 **[V]**
`github.com/typst/typst`
"As powerful as LaTeX while being much easier to learn and use." Integrated scripting (`#let`, functions, loops, `..` spread), incremental compilation with fast compile times, `typst watch`, a prebuilt Docker image at `ghcr.io/typst/typst`. You generate `.typ` source and shell out to the compiler.

Consider Typst for the **engineering calculation sheet** deliverable specifically — real math typesetting, bibliography management, and deterministic layout. A calculation note with properly set equations, intermediate values and references looks markedly more authoritative than a Word table, and audit-grade math display is one of your stated feature claims.

**WeasyPrint** (BSD-3) **[K]**, **Pandoc** (GPL-2.0 — caution for bundling) **[K]**, **ReportLab** (BSD/commercial dual) **[K]**.

### 7.3 Charts and diagrams

**Apache ECharts** (Apache-2.0) **[K]** — your v1.0 choice; good label control, SVG export, canvas rendering for server-side output.
**Vega-Lite** (BSD-3) **[K]** — declarative grammar; a chart becomes a JSON spec the model can emit and you can validate with a schema. That fits your constrained-decoding discipline better than asking a model to write chart code.
**Matplotlib** (PSF-like) **[K]** — in the Python plane, with engineering conventions and LaTeX labels.
**Mermaid** (MIT), **Graphviz** (EPL) **[K]** — for rendering extracted P&ID connectivity as a clean process graph. A Graphviz re-render of a parsed drawing beside the original scan is a strong visual proof of extraction.

---

## 8. Sovereignty, provenance and governance

### 8.1 Content provenance — adopt the standard, drop the bespoke watermark

**c2pa-rs** — dual MIT / Apache-2.0 **[V]**
`github.com/contentauth/c2pa-rs` · Content Authenticity Initiative · C2PA technical specification

**This replaces TDD §10.3 wholesale, and it is a significant upgrade to the pitch.**

C2PA is the industry standard for content provenance — the coalition "develops technical standards for certifying the source and history of media content." The Rust library lets an application:

- **Create and sign C2PA claims and manifests**
- **Embed manifests** into supported file formats
- **Parse and validate** manifests already present in files
- Handle **CAWG identity assertions** — signed statements about *who* produced something
- Support standard assertions and **hard bindings** (cryptographic binding of the manifest to the content bytes)

Beta, 0.x, with a `stable` branch for dependents and a ~2-month release train. A **C API** in `c2pa_c_ffi` means you can call it from Node, Python or your Tauri Rust shell. `c2patool` CLI lives in a separate repo.

Why this matters more than the licence or the language: your v1.0 watermark is three layers you invented, and a reviewer's first question is "who else can verify that?" With C2PA the answer is "any C2PA-conformant tool, against a published specification, offline." Your Decision DNA record becomes a **custom assertion inside a signed C2PA manifest** — standard container, standard verification, your proprietary content. That is exactly the shape a PSU audit function wants.

Check format coverage for .docx/.xlsx/.pptx before committing; C2PA's strongest support is in image, video and PDF. Where OOXML embedding is unsupported, ship a **sidecar manifest** alongside the artifact and keep the hard binding to the file hash.

### 8.2 Signing and attestation

**Sigstore cosign** — Apache-2.0 **[V]**
`github.com/sigstore/cosign`
Signs container images, blobs, binaries, scripts, config files, **WASM modules** (relevant if you go the Extism route) and in-toto attestations. Both modes: **keyless** via Fulcio + Rekor with OIDC identity, and **key-based** with cosign keypairs, KMS backends (Vault, AWS, GCP, Azure), hardware tokens, or your own PKI.

**Offline verification is documented** — `cosign initialize` and `cosign save` while networked, then `cosign verify --key cosign.pub --offline --local-image ./dir`. The caveat they state: most flows periodically fetch service keys from a TUF repository, so for air-gap you must fetch and pin the trusted root yourself, and "its contents will change without notification." For your plugin trust root (Addendum B6), **key-based signing with a pinned org key is the right mode** — keyless depends on an internet-reachable CA, which defeats the purpose.
Crypto detail: cosign generates only ECDSA-P256/SHA-256; private keys are scrypt-encrypted PKCS8. Development is shifting toward `sigstore-go`.

**in-toto** — Apache-2.0 **[V — licence name not shown on page; verify]**
`github.com/in-toto/in-toto`

**Read this before you finalise Decision DNA.** in-toto's model is startlingly close to what you designed independently:

| in-toto | Outskirts |
|---|---|
| **Layout** — owner-defined ordered *steps* and the *functionaries* authorised to perform each | Plan DAG with per-step plugin allowlist and role gates |
| **Link metadata** — signed record of the command run and files touched per step | Per-step audit event with model, tools, inputs |
| **Materials / products** — artifacts consumed and produced per step | Step inputs and outputs |
| **Artifact rules** — `MATCH`, `CREATE`, `MODIFY`, `REQUIRE`, `DISALLOW` chaining steps together | Your DAG dependency edges |
| **`in-toto-verify`** — checks layout signature, expiry, that each step was performed by the authorised functionary using the expected command, and that materials/products match the rules | Your chain verification walk |

Expressing Decision DNA as in-toto attestations gives you a **published format with existing verification tooling**, so an auditor validates your approval note's provenance with a standard CLI rather than a verifier you wrote. Pair with cosign, which already signs in-toto attestations. Their own guidance — end most steps with `DISALLOW *` — is the deny-by-default discipline you want anyway.

**Trillian** (Apache-2.0) **[K]** — Merkle-tree transparency log, the substrate under Certificate Transparency and Rekor. The mature answer to Addendum B3's truncation and signing problem if you want more than signed anchors at pilot scale.

**Syft / Grype** (Apache-2.0) **[K]** — SBOM generation and vulnerability scanning. A PSU procurement process will ask for an SBOM; generating one in CI is an afternoon.

### 8.3 Egress control and runtime enforcement

**Tetragon** — Apache-2.0 (with BSD/GPL components typical of eBPF projects) **[V]**
`github.com/cilium/tetragon`
eBPF security observability **and runtime enforcement**. Observes process execution, syscall activity, and "I/O activity including network & file access," with `process_kprobe`/`process_tracepoint`/`process_uprobe` events configured through TracingPolicy. Documented use cases include network observability, filename access, credentials monitoring and privileged execution.

**Crucially: Kubernetes is optional.** There is a "Try Tetragon on Linux" path via Docker. That makes it viable for your single-server pilot, not just a cluster deployment. Their README does not detail egress-specific blocking, so verify the enforcement semantics in the docs before promising it.

**Falco** (Apache-2.0) **[K]**, **Tracee** (Apache-2.0) **[K]** — eBPF runtime detection; alternatives for the same plane.
**nftables** **[K]** — default-drop egress; the baseline. **On Windows dev machines this does not exist** — which is precisely why Addendum A7 makes Docker `internal: true` networks the primary enforcement and the kernel plane a pilot hardening step.
**Cilium** (Apache-2.0) **[K]** — if a pilot ever runs Kubernetes.

### 8.4 Policy and RBAC

**Cedar** — Apache-2.0 **[V]**
`github.com/cedar-policy/cedar`
AWS's authorisation language, "purpose-built to support authorization use cases for common authorization models such as RBAC and ABAC." Policies in `.cedar` files, entities as JSON, principals/actions/resources with attributes. A **validator** checks policies against a declared schema. **`cedar-wasm` provides a WASM interface "enabling use with JavaScript and TypeScript"** — so it embeds in your Node gateway or Tauri shell with no service hop.

The differentiator for you is the last one: Cedar is **"designed for analysis using Automated Reasoning."** You can *prove* properties of your RBAC matrix — for instance that no junior role can reach an export capability by any path. For a governance-first product whose buyer is a compliance officer, being able to say "our permission model is formally analysable, and here is the proof" is a substantially stronger claim than a hand-maintained grid. It also directly serves Addendum's deny-by-default requirement, since Cedar denies unless a `permit` matches.

**Open Policy Agent** (Apache-2.0) **[K]** — Rego; more general, more operationally familiar, harder to analyse. **Casbin** (Apache-2.0) **[K]** — lightweight, many language ports, easiest drop-in. **OpenFGA** (Apache-2.0) / **SpiceDB** (Apache-2.0) **[K]** — Zanzibar-style relationship-based authz; overkill now, the right answer if per-document ACLs arrive in a pilot.

### 8.5 Identity

**Keycloak** (Apache-2.0) **[K]** — the PSU-realistic choice: LDAP/AD federation, SAML, OIDC, and it is what an enterprise IT department already knows. This is your P5 LDAP/AD item.
**Zitadel** (Apache-2.0) **[K]**, **Authentik** (MIT) **[K]**, **Ory Kratos/Hydra** (Apache-2.0) **[K]** — lighter alternatives.
For the prototype, local JWT accounts per TDD §14 are correct. Do not add an identity provider before P5.

### 8.6 Secrets

**SOPS** (MPL-2.0) **[K]** — encrypted config files in the repo; the right weight for a prototype. **HashiCorp Vault** (BUSL since 1.15 — **caution**) / **OpenBao** (MPL-2.0, the open fork) **[K]** — use OpenBao if a pilot needs a real secret store.
Note Addendum A14: for the shell↔sidecar handshake, the OS keystore via `keytar`-equivalent or Tauri's own secure storage is sufficient, and your Ed25519 audit-signing key belongs there too.

---

## 9. Observability, evaluation and benchmarking

### 9.1 Tracing

**OpenTelemetry** (Apache-2.0) **[K]** — the base layer. Span per graph node, per PAL call, per tool invocation. **TEI already emits OTel traces and Prometheus metrics [V]**, so part of your pipeline is instrumented the moment you adopt it.
**Jaeger** (Apache-2.0) / **Grafana + Prometheus** (AGPL-3.0 for Grafana — fine as a separate service, caution if bundled) **[K]**.
**OpenLLMetry** (Apache-2.0) **[K]** — OTel semantic conventions for LLM spans; gives you token counts and model attributes on spans without inventing your own attribute names.

### 9.2 LLM observability

**Langfuse** — MIT except `ee/` directories **[V]**
`github.com/langfuse/langfuse` · part of ClickHouse since January 2026
Tracing of LLM calls plus surrounding logic (retrieval, embedding, agent actions); prompt management with versioning and strong caching; evaluations via LLM-as-judge, **code evaluators**, user feedback and manual labelling; datasets for pre-deployment testing; a playground reachable from a failing trace. Typed Python and JS/TS SDKs, OpenAPI spec.
Self-hosting is first class — Docker Compose, single VM, Kubernetes via Helm (their preferred production path). **Two caveats they state: telemetry to PostHog is on by default (`TELEMETRY_ENABLED=false` to disable), and they make no fully-air-gapped claim.** For your purposes: use it in development freely, and for the sovereign build either disable telemetry and verify with a packet capture, or keep observability to plain OTel plus your own audit stream — which you have anyway, and which is the honest architecture given your dashboard is already a projection of that stream.

**Phoenix** (Elastic-2.0 **[K]**), **Opik** (Apache-2.0 **[K]**) — alternatives; Opik is the more permissive licence.

### 9.3 Evaluation and regression testing

**promptfoo** — MIT **[V]**
`github.com/promptfoo/promptfoo` · now part of OpenAI, still MIT
CLI and library for evaluating and red-teaming LLM apps. Declarative test files, a web results viewer, **live reload and caching**, side-by-side model comparison including **Ollama** as a provider, CI/CD integration, and a Dockerfile plus Helm chart for self-hosting. Their claim: **"LLM evals run 100% locally — your prompts never leave your machine."**

This is your P0 benchmark harness, and adopting it saves Saurabh a week. It gives you declarative test cases, assertions, scoring, a viewer and CI integration out of the box — you supply the corpus and the custom assertions. Your deterministic critic checks (C1–C3) become promptfoo custom assertions, which means the same code that gates a deliverable at runtime also scores the benchmark. That is the kind of reuse that keeps a measurement discipline alive under deadline.

**Ragas** **[V]** — see §5.3, for retrieval-specific metrics.
**OmniDocBench** — repo Apache-2.0; **dataset "for research purposes only and not for commercial use"** **[V]**
`github.com/opendatalab/OmniDocBench` · CVPR 2025
1,651 PDF pages, 10 document types, 5 layout types, 5 languages — academic papers, financial reports, newspapers, textbooks, **handwritten notes**. 28 block-level and 4 span-level element annotations with location plus ground truth (text, LaTeX formulas, tables in both LaTeX and HTML), reading order, and attribute tags for watermark, blur, table border style and merged cells. Metrics: normalised edit distance, BLEU, METEOR, TEDS, COCODet mAP/mAR, CDM for formulas.
Use it to *choose* your OCR engine with a number rather than a hunch — every engine in §3.1 reports against it, so you can compare like for like. Respect the research-only dataset terms: benchmark with it, do not ship it.
**olmOCR-bench** **[K]** — the other OCR benchmark these models report on.

### 9.4 Golden-transcript / cassette testing

No off-the-shelf VCR exists for LLM calls that fits your PAL. Build it — Addendum A12 — keyed on (model digest, prompt hash, seed). It is ~200 lines, it makes CI runnable without a GPU, it makes benchmarks reproducible, and it is your venue-level demo fallback. promptfoo's caching **[V]** covers part of this for eval runs but not for full agent-loop replay.

---

## 10. Desktop and UX

**Tauri 2** (MIT/Apache-2.0) **[K]** — your v1.0 choice; small binaries, Rust security posture, sidecar process management, and a CSP the webview enforces. Correct. Its Rust core also means c2pa-rs and Cedar-WASM are callable without a service hop.

**React Flow** — MIT **[V]** — §2.2. Plan DAG, then the recipe builder.
**shadcn/ui** (MIT) **[K]** — your choice; component source you own rather than a dependency.
**TanStack Virtual** (MIT) **[K]** — the audit log and locality-tagged call stream will be tens of thousands of rows; virtualise from the start.
**assistant-ui** (MIT) **[K]** / **Vercel AI SDK** (Apache-2.0) **[K]** — streaming chat primitives. Worth reading for the streaming-state patterns even if your WS protocol is custom.
**pdf.js** (Apache-2.0) **[K]** — PDF rendering with text-layer coordinates, which is how you highlight a cited region in the source scan. Essential for the "click a citation, see it on the page" interaction your grounding story implies.
**OpenSeadragon** (BSD-3) **[K]** — deep-zoom viewer for large P&ID sheets with overlay annotations. This is the right component for the region-linked tag table in Journey 3; a plain `<img>` will not work at drawing resolution.
**Konva / react-konva** (MIT) **[K]** — canvas annotation if users need to correct bounding boxes, which feeds your human-in-the-loop extraction correction.

---

## 11. Deployment and air-gap

**Docker Compose** **[K]** — with `internal: true` networks per Addendum A7. This is the sovereignty enforcement mechanism, and it is free.
**Podman** (Apache-2.0) **[K]** — rootless containers; a PSU security team may prefer it, and it is a drop-in for most Compose files.

**Zarf** — Apache-2.0 **[V]**
`github.com/zarf-dev/zarf` · "The Airgap Native Package Manager for Kubernetes"
"Develop Connected, Deploy Disconnected." Packages "the parts of the internet your app needs into a single compressed file," declaratively, with a bundled Docker registry, a Gitea git server, **automated SBOM generation with a web viewer**, and **package signing and verification through cosign**. Zero runtime dependencies, OS agnostic, publishes packages as OCI artifacts.
It is Kubernetes-centric, which your single-server pilot is not. But the **package format, SBOM and cosign-signing model is exactly the pattern for your offline installer**, and the project is the reference for how the defence and public-sector world actually moves software across an air gap. Read it, borrow the shape; adopt it only if a pilot lands on k3s.

**ORAS** (Apache-2.0) **[K]** — push and pull arbitrary artifacts (model weights, corpora) via OCI registries. The clean way to version and transfer a 20GB model bundle with a digest you can verify.
**Harbor** (Apache-2.0) **[K]** — on-prem registry with signing and scanning, for the pilot's internal mirror.
**Hugging Face Hub offline** **[K]** — `HF_HUB_OFFLINE=1`, `huggingface-cli download --local-dir`, then transfer. **TEI documents air-gapped deployment with mounted weights [V]**; MinerU and PaddleOCR both document offline operation **[V]**.

---

## 12. Model landscape as of today

Checked Hugging Face trending on 12 Sep 2026 **[V]**. **The roster in Addendum Part E is already a generation behind** — treat this as the current shelf and re-check at build time, because this is exactly why your registry is data and not code.

Official releases visible in trending, with listed sizes:

| Model | Size | Note |
|---|---|---|
| `Qwen/Qwen3.8-27B` | ~28B | **Appears in both text-generation and image-text-to-text listings — natively multimodal** |
| `Qwen/Qwen3.8-Flash-Next` | ~180B | MoE |
| `zai-org/GLM-5.3` | ~753B | · `GLM-5.3-Flash` ~321B |
| `deepseek-ai/DeepSeek-V4.1-Flash` | ~763B | · `DeepSeek-V4-Flash` ~304B, `-Vision-Exp` ~305B |
| `moonshotai/Kimi-K3` | ~2.8T | |
| `openbmb/MiniCPM5-2B` | ~3B | GGUF published; candidate for your CPU-class floor |
| `inclusionAI/Ling-3.0-tiny` | ~8B | · `Ling-3.0-flash-VL` ~125B |
| `Edge0/Edge0-35B-A3B`, `ornith-ai/Ornith-1.5-35B-A3B` | ~35B | **The 35B-total / A3B-active MoE pattern is now everywhere** |
| `nvidia/Qwen3.8-27B-NVFP4`, `nvidia/GLM-5.3-Flash-NVFP4` | — | **NVFP4 quantisations — Blackwell FP4** |

Three consequences for your design:

1. **A natively multimodal ~27B model collapses two specialists into one.** If `Qwen3.8-27B` handles both document drafting and vision, your router's residency problem largely dissolves — one resident model covers two of your five task types, and Addendum B7's load-penalty term matters far less. Verify the vision quality on your P&ID corpus before committing, but design the registry so this is a configuration.
2. **The MoE "~35B total / ~3B active" pattern is the mainstream sweet spot**, which is what Addendum Part E predicted structurally even though the specific models have turned over. ~20GB at Q4 with ~3B-active speed is the 24GB-GPU class.
3. **NVFP4 exists for Blackwell.** If the company GPUs are B200/RTX 50-series, FP4 quantisation is a materially different throughput/VRAM tier than the Q4 GGUF assumptions in your sizing table.

Caveat on the listings: HF trending is noisy with community re-uploads and "abliterated" variants, some with clearly wrong size metadata. Trust the official org namespaces (`Qwen/`, `zai-org/`, `deepseek-ai/`, `openbmb/`, `nvidia/`, `moonshotai/`, `inclusionAI/`) and **verify every licence individually** — sizes and terms vary within a family, and the listing pages do not show licences.

---

## 13. What not to build

The highest-value list in this document. Every row is work your eight weeks cannot afford and does not need.

| Do not write | Use | Why |
|---|---|---|
| Darcy-Weisbach, friction factors, valve sizing, two-phase flow | `fluids` | Hundreds of validated correlations, MIT |
| Fluid property tables | CoolProp | REFPROP-equivalent, MIT |
| Unit conversion and dimensional checking | Pint | Including uncertainty propagation |
| PDF/Office parsing, layout, reading order | Docling + PaddleOCR | ~66k and ~89k stars; air-gap documented |
| Table structure recognition | PP-StructureV3 or TATR | TATR gives you the grid; you supply text |
| A symbol detector from scratch | RF-DETR fine-tuned on synthetic data | Apache-2.0, built for small-domain transfer |
| Image tiling and detection merge | SAHI | Solved; do not re-derive de-duplication |
| BM25 | bm25s, or `bge-m3` sparse vectors | 10–45× Elasticsearch at your scale |
| Hybrid fusion (RRF/DBSF) | Qdrant query parameter | Built in; deletes a task |
| A reranker | `bge-reranker-v2-m3` via TEI | Milliseconds, MIT |
| A watermark scheme | **C2PA** | A standard beats an invention, every time |
| Artifact signing and offline verification | cosign, key-based | Air-gap verification documented |
| An attestation format for Decision DNA | **in-toto** | Your design, already standardised and tooled |
| An eval harness | promptfoo + Ragas | Local, MIT, CI-ready |
| An OCR benchmark | OmniDocBench | Every engine reports against it |
| A policy engine | Cedar (WASM) | Formally analysable, embeddable |
| A prompt-injection classifier | `deberta-v3-base-prompt-injection-v2` | 0.2B, ONNX, in-process |
| A red-team suite | garak | NVIDIA's, works on local models |
| A graph canvas | React Flow | MIT, and it doubles as the recipe builder |
| A translation model for Hindi | IndicTrans2 | MIT, 22 languages, AI4Bharat |
| Cycle detection, topological sort | `graphlib` / `networkx` | Please |

**Build only these — they are your product:**

1. The **Provider Adapter Layer**, mode state machine and perimeter model. Nobody else's sovereignty abstraction is yours.
2. The **provider conformance suite**. Does not exist. Makes "add models without redesign" demonstrable.
3. The **Freshness Engine** (Addendum B1). Genuine whitespace in the ecosystem.
4. The **deterministic critic** C1–C5 (Addendum B4). Trivial code, huge credibility, no library will do it better.
5. The **Decision DNA projection** — even expressed as in-toto attestations, the mapping from your plan DAG to a signed lineage record is yours.
6. The **recipe library** for industrial workflows. The domain knowledge is the moat, not the engine.
7. The **workbench experience** — streaming timeline, router panel, sovereignty dashboard, region-linked extraction review. This is what a jury remembers.
8. The **cassette/replay layer**. Small, and it makes everything else measurable.

---

## 14. Licence risk register

Order this list by when it will hurt you: items 1–3 before a pilot, 4–6 before shipping a demo, the rest at procurement.

| Project | Terms | Risk | Action |
|---|---|---|---|
| **Ultralytics YOLO** | AGPL-3.0 + paid enterprise **[V]** | **High** — AGPL on a core detector in a product you may license | Use RF-DETR (Apache-2.0) |
| **Surya weights** | Modified AI Pubs Open RAIL-M; free only under $5M revenue **[V]** | **High** for an MRPL pilot | Benchmark only, or resolve terms |
| **DWSIM** | GPL-3.0, repo archived Aug 2026 **[V]** | **High** — copyleft plus unmaintained | Reference oracle only |
| **DocLayout-YOLO** | AGPL-3.0 **[V, inferred]** | High | Avoid; MinerU already removed it |
| **docxtemplater modules** | Core MIT; Image/XLSX/Chart/Meta paid **[V]** | Medium — your watermark needs Image and Meta | Budget, or use `docx`/python-docx |
| **MinerU** | "Apache 2.0 with additional conditions" **[V]** | Medium — read the added conditions | Legal review before pilot |
| **OmniDocBench dataset** | Research only, non-commercial **[V]** | Medium | Benchmark with it, never ship it |
| **n8n** | Sustainable Use Licence **[K]** | Medium — not open source | Node-RED (Apache-2.0) instead |
| **Grafana** | AGPL-3.0 **[K]** | Low as a separate service, high if bundled | Keep it a sidecar, or Prometheus alone |
| **HashiCorp Vault** | BUSL since 1.15 **[K]** | Low now | OpenBao (MPL-2.0) if needed |
| **Langfuse / NeMo Guardrails / Ragas** | Telemetry on by default **[V]** | **Sovereignty, not licence** | Disable explicitly; verify with a packet capture |
| **Model weights generally** | Vary within a family **[V]** | Medium | Record licence per registry entry; make it a field |

That last row deserves to be a feature. Add `license` and `licenseUrl` to every model registry entry and surface them in the admin console. When a judge asks "can MRPL actually deploy these models commercially," you answer by pointing at the screen. No other team will have thought of it.

---

## 15. Mapping to the phase plan

Where each adoption lands in Addendum Part C.

**P0 (week 1)** — Qdrant, MongoDB, Docker Compose with `internal: true`. vLLM and Ollama adapters. llama-swap in front of them. Constrained-decoding pipeline. promptfoo harness. Corpus freeze, including the ISA-5.1 symbol library and the synthetic P&ID generator — start it week 1, it trains in the background for six weeks. Conformance suite. Cassette layer.

**P1 (week 2)** — Docling + PaddleOCR ingestion. `bge-m3` via TEI. Qdrant hybrid with built-in RRF. docxtemplater or `docx` template render. c2pa-rs signing. Ed25519 anchors in the OS keystore. React Flow timeline.

**P2 (weeks 3–4)** — Cedar for RBAC. Extism or microsandbox for the plugin runtime, and the rogue test against a real capability boundary. cosign key-based plugin signing with a pinned trust root. Deterministic critic with Pint and SymPy. tcpdump evidence in the benchmark runner.

**P3 (weeks 5–6)** — RF-DETR fine-tuned on the synthetic corpus, SAHI tiling, PP-StructureV3 crop OCR. `fluids` and CoolProp behind the calculation service. OpenSeadragon plus pdf.js for region-linked review. ECharts or Vega-Lite exhibits. `bge-reranker-v2-m3`. IndicTrans2 if Hindi stays in scope. OmniDocBench to justify the OCR choice with a number.

**P4 (weeks 7–8)** — garak red-team report. Syft SBOM. Offline bundle with ORAS-versioned weights. Full benchmark in both modes with packet captures. Replay from cassettes as the venue fallback.

**P5 (pilot)** — Tetragon on the Linux server. Keycloak for LDAP/AD. gVisor as the default sandbox tier. Trillian if the audit log needs to outgrow signed anchors. Zarf if a pilot lands on k3s. GraphRAG over extracted P&ID connectivity — the natural next feature, and the one a refinery will actually ask for.

---

## 16. Six things to do this week

1. **Decide the two-plane question (§0).** Everything else depends on it, and it is a one-meeting decision. My recommendation is the two-plane rule; the alternative is writing `fluids` yourself.
2. **Start the synthetic P&ID generator.** It is the longest-lead item in the build — the detector needs data before it can train, and training needs weeks of iteration. Nothing else in the plan has that shape.
3. **Run OmniDocBench against PaddleOCR-VL, MinerU hybrid and Docling** on ten of your own scans. Pick your OCR engine with a number in week 1, not a hunch in week 5.
4. **Prototype C2PA on a .docx.** Verify format coverage before you build the watermark story on it. If OOXML embedding is unsupported, decide the sidecar-manifest approach now rather than in week 7.
5. **Read in-toto's layout model** and decide whether Decision DNA becomes attestations. It is a two-hour read that could replace a week of bespoke format design and hand you standard verification tooling.
6. **Check the licence of every model you intend to ship**, and add the field to the registry schema while it is still cheap.
