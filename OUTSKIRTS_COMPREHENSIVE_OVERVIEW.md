# OUTSKIRTS: Sovereign Industrial AI Workbench & Agentic Operating System
### Comprehensive Technical Overview, Architecture, Problem-Solution Taxonomy, Feature Matrix & Deep Tech Stack Specification

---

## 1. Executive Introduction

**Outskirts** is an enterprise-grade, air-gapped **Sovereign Industrial AI Workbench and Agentic Operating System** designed specifically for high-consequence critical infrastructure sectors:
- **Refining, Petrochemicals & Hydrocarbons** (e.g., Mangalore Refinery and Petrochemicals Limited - MRPL, ONGC, IOCL, BPCL)
- **Power Generation, Grid Infrastructure & Utilities**
- **Heavy Industrial Process Plants & EPC Contracting**
- **Aerospace, Cryogenics & Defense Systems**

Unlike consumer chatbots, general-purpose LLM wrappers, or cloud-tethered developer copilots, Outskirts is architected from first principles to operate under **Zero Cloud Egress** constraints. It combines **local open-weights sovereign foundation models** (Qwen 2.5, DeepSeek R1, Llama 3.2), **deterministic symbolic engineering physics engines**, an **agentic plan-graph execution loop**, **n8n-style visual DAG workflows**, and an **immutable cryptographic provenance ledger** (Decision DNA backed by SHA-256 Merkle trees and Ed25519 C2PA signatures).

Outskirts transforms raw engineering inputs—including raster piping and instrumentation diagrams (P&IDs), ultrasonic non-destructive testing (NDT) scan logs, handwritten field survey sheets, governing standard operating procedures (ASME, API, OISD), and ERP contract databases—into **deterministic, verifiable, and legally auditable deliverables** (.xlsx, .docx, .pptx, and sandboxed micro-tools) without a single byte of confidential telemetry leaving the perimeter network.

---

## 2. Problem Statement: Why Cloud AI Fails in Heavy Industry

Modern enterprise AI platforms and cloud LLMs suffer from five structural points of failure when deployed inside critical industrial facilities:

### 2.1 The Sovereignty & Air-Gap Mandate (Zero Egress)
Refineries, nuclear installations, defense pipelines, and process facilities operate under statutory cybersecurity frameworks (e.g., CISO directives, IEC 62443, CEA guidelines, NIS2) that prohibit streaming proprietary operational telemetry, plant blueprints, and commercial contract terms across the public internet. Cloud-hosted solutions (OpenAI, Anthropic, Azure Copilot) create immediate compliance breaches, espionage vulnerability, and external dependency risks.

### 2.2 Probabilistic Hallucination in Engineering Physics
LLMs generate tokens probabilistically rather than deterministically. In critical engineering:
- An LLM may hallucinate a friction factor in a **Darcy-Weisbach** hydraulic calculation, resulting in an undersized pipe and catastrophic over-pressure.
- It may invent or misquote a clause citation from **ASME B31.3** or **API 610**.
- It lacks intermediate arithmetic precision, failing to guarantee reproducible results across multiple runs.

### 2.3 Absence of Legal Liability & Provable Auditability
When a chief engineer signs an approval note allowing a degraded pipe elbow to remain in service until turnaround, that signature carries criminal and financial liability. If an AI assisted in that decision:
- Where is the record of the exact model weights used?
- Which document version was cited?
- Was the engineering SOP fresh or obsolete?
- Can the arithmetic derivation be replayed with zero residual deviation in a court of inquiry?
Standard LLMs offer no cryptographic proof of custody.

### 2.4 Document Freshness Decay & Silent Obsolescence
Industrial plants operate over decades. Standard Operating Procedures (SOPs), manufacturer service bulletins, and General Conditions of Contract (GCC) are continuously amended. When standard RAG (Retrieval-Augmented Generation) systems ingest document stores, they treat all chunks equally, frequently citing superseded or revoked revisions (e.g., Rev 1 from 2018 instead of Rev 3 from 2024), leading to non-compliant maintenance actions.

### 2.5 Fragmented Engineering Workflows
Engineers currently juggle disconnected point solutions: CAD viewers for P&IDs, Excel for hydraulics, SAP for contract work-orders, Word for technical memos, and specialized simulation packages. There is no unified workbench where a natural language goal dynamically coordinates perception, standards retrieval, physics calculation, verification, and multi-artifact compilation in a single glass pane.

---

## 3. The Solution: Outskirts Sovereign Architecture

Outskirts resolves these systemic vulnerabilities through a **Dual-Rail Industrial Architecture**:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 OUTSKIRTS SOVEREIGN RUNTIME                             │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                      1. MULTI-PROJECT WORKSPACE & NATURAL GOAL                  │   │
│   │     Drag & Drop (PDF, CAD/SVG, Raster Scans, Field Notes, XLSX, Standards)      │   │
│   └────────────────────────────────────────┬────────────────────────────────────────┘   │
│                                            │                                            │
│                                            ▼                                            │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                      2. SOVEREIGN AI MODEL ROUTER (PAL)                         │   │
│   │   Deterministic Model Routing • Latency Budget Enforcer • Local Hardware Fleet   │   │
│   │   [DeepSeek-R1 (Physics)] • [Qwen2.5-7B (Docs)] • [Qwen-VL (Vision)] • [Llama3] │   │
│   └────────────────────────────────────────┬────────────────────────────────────────┘   │
│                                            │                                            │
│                                            ▼                                            │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                     3. TYPED AGENTIC PLAN GRAPH (DYNAMIC DAG)                   │   │
│   │  Goal Planning ➔ Subtask Decomposition ➔ n8n-Style Mesh Nodes ➔ Self-Repair     │   │
│   └───────────────┬─────────────────────────────────────────────────┬───────────────┘   │
│                   │                                                 │                   │
│                   ▼                                                 ▼                   │
│   ┌───────────────────────────────┐                 ┌───────────────────────────────┐   │
│   │    GENERATIVE RAIL (LLM)      │                 │    DETERMINISTIC RAIL (WASM)  │   │
│   │ • Natural language synthesis  │                 │ • Symbolic math derivations   │   │
│   │ • Document clause extraction  │                 │ • Hydraulic physics engines   │   │
│   │ • Vision OCR & Line Tracing   │                 │ • Relational multi-table joins│   │
│   └───────────────┬───────────────┘                 └───────────────┬───────────────┘   │
│                   │                                                 │                   │
│                   └───────────────────────┬─────────────────────────┘                   │
│                                           │                                             │
│                                           ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                  4. DETERMINISTIC CRITIC VERIFICATION GATES                     │   │
│   │  [C1: Numeric Grounding] ➔ [C2: Calc Replay] ➔ [C3: Citation Resolvability]    │   │
│   │             ➔ [C4: Template Structure] ➔ [C5: Freshness Gate]                   │   │
│   └───────────────────────────────────────┬─────────────────────────────────────────┘   │
│                                           │                                             │
│                                           ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │             5. CRYPTOGRAPHIC DECISION DNA & C2PA PROVENANCE LEDGER              │   │
│   │  SHA-256 Merkle Root • Monotonic Event Log • Ed25519 Signatures • C2PA JUMBF    │   │
│   └───────────────────────────────────────┬─────────────────────────────────────────┘   │
│                                           │                                             │
│                                           ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                    6. LIVE MULTI-TAB DELIVERABLE SURFACES                       │   │
│   │  📄 Signed Approval (.docx)   |  ⚙ Interactive Micro-Tool (HTML5/SVG Sandbox)  │   │
│   │  📐 P&ID Topology Viewer      |  🧮 Step-by-Step Math Derivation               │   │
│   │  📊 Filterable Master (.xlsx) |  📽 Executive Deck (.pptx)                     │   │
│   │  ✍ Field Notes Transcription  |  🌐 Bilingual SOP Hindi ⟷ English               │   │
│   │  📦 1-Command Governance Pack |  🧬 Decision DNA Cryptographic Mesh             │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Generative Rail (Foundation LLMs):** Handles perception, natural language goal parsing, semantic extraction, document structuring, and bilingual technical translation.
2. **Deterministic Rail (Symbolic / WASM Engines):** Executes exact mathematical calculations, engineering physics formulas, relational database queries, and unit conversions with zero floating-point drift.
3. **Critic Gates (C1–C5):** An automated multi-layer verification barrier that validates every output before presentation:
   - **C1 Numeric Grounding:** Validates that all numbers originate from verified input files.
   - **C2 Calculation Replay:** Re-runs formulas symbolically; rejects if deviation $> \pm 0.0001$.
   - **C3 Citation Resolvability:** Verifies that standards and clauses exist in the project knowledge base.
   - **C4 Template Conformance:** Enforces strict structural adherence to corporate engineering schemas.
   - **C5 Freshness Gate:** Applies exponential decay penalties ($e^{-\lambda \Delta t}$); blocks superseded SOPs.
4. **Decision DNA & C2PA Provenance:** Generates a cryptographic Merkle tree capturing the prompt fingerprint, model weights hash, raw tool inputs/outputs, Critic verdicts, and timestamp. The resulting artifact is cryptographically signed with Ed25519 keys and wrapped in a C2PA manifest.

---

## 4. Comprehensive Feature Matrix

The platform delivers full end-to-end functionality organized into 9 major operational clusters:

### Cluster 1: Workspace & Core Platform
- **Multi-Project Workspaces:** Seamless switching across plants, units, and engineering domains (Refining CDU/VDU, Cryogenics, Power Generation).
- **Hierarchical Document Organization:** Structured ingestion categorizing files into Standards, Drawings, Scans, Notes, and Data.
- **Universal Drag & Drop Intake:** Accepts PDF, SVG, DXF/DWG rasters, PNG/JPG scans, handwritten photos, and XLSX workbooks.
- **Persistent Monotonic Timeline:** Append-only event sequence logging every micro-step with sequence IDs, timestamps, and causal parents.
- **Real-Time WebSocket Pipeline:** Live bi-directional streaming of token generations, node transitions, and Critic status updates.

### Cluster 2: Agentic AI Engine & Visual Mesh
- **Autonomous Task Planning:** Decomposes complex industrial goals into typed execution DAGs with explicit dependency chains (`dependsOn`).
- **Dynamic n8n-Style Workflow Mesh:** Interactive visual canvas rendering active step graphs with draggable nodes, animated status wires, latency telemetries, and node-level inspection modals.
- **Autonomous Self-Repair:** When a Critic gate flags a numeric mismatch or broken citation, the agent re-plans, isolates the faulty node, repairs the parameters, and marks the node as `repaired`.
- **Live Step Streaming:** Real-time visibility into running, completed, failed, and retried nodes.

### Cluster 3: Sovereign AI Model Router
- **Context-Adaptive Model Selection:** Automatically maps tasks to the optimal local model based on capability, latency budget, and context length:
  - Physics/Math $\rightarrow$ `deepseek-r1-distill-qwen-7b`
  - Legal/Commercial Documents $\rightarrow$ `qwen2.5-7b-instruct-q4`
  - Code & UI Micro-Tools $\rightarrow$ `qwen2.5-coder-7b-awq`
  - Blueprint & Image Perception $\rightarrow$ `qwen2.5-vl-7b-instruct`
  - Bilingual SOP Translation $\rightarrow$ `llama-3.2-3b-instruct`
- **Zero-Egress Security Gate:** Guarantees strict loopback binding (`127.0.0.1`); blocks external network socket creation.
- **Model Router Inspector Modal:** Real-time visualization of model selection rationales, memory footprints, and fallback chains.

### Cluster 4: Multimodal Perception & P&ID Vision
- **Vector & Raster P&ID Processing:** Ingests complex engineering piping and instrumentation diagrams.
- **Topology & Line Tracing:** Traces pipe runs from equipment suction to discharge (e.g., tracing line P-101A through elbows and reducers).
- **Isolation Valve Identification:** Automatically detects and isolates governing upstream/downstream block valves (`GV-1001`, `GV-1002`) for maintenance safety lockouts.
- **Handwritten Field Notes OCR:** Vision specialist transcribes inspector log sheets (probe IDs, ultrasonic thickness readings, date/shift) with zero optical distortion.
- **Bilingual SOP Translation:** Bidirectional English $\longleftrightarrow$ Hindi translation preserving certified petroleum engineering terminology.

### Cluster 5: Deterministic Physics & Engineering Solvers
- **Darcy-Weisbach Hydraulic Engine:** Step-by-step fluid dynamic derivations including cross-sectional velocity, Reynolds number ($Re$), Colebrook-White friction factor ($f$), and pressure drop ($\Delta P$).
- **NPSH Margin & Cavitation Verifier:** Calculates Net Positive Suction Head Available ($NPSH_a$), queries Sulzer vendor performance curves for $NPSH_r$, and verifies API 610 safety margins.
- **Symbolic Mathematical Derivation Viewer:** Dedicated UI tab displaying step-by-step formulas, variable definitions, intermediate values, and Critic replay deviations.

### Cluster 6: Automated Critic C1–C5 Verification Suite
- **Automated Gate Execution:** Evaluates deliverables across 5 distinct safety and compliance gates.
- **Residual Delta Replay:** Re-runs calculations in a WASM sandbox; guarantees $< 0.0001$ margin of error.
- **Freshness Score Calculation:** Quantifies document age via half-life decay equations, flagging expired plant SOPs for human review.

### Cluster 7: Sandboxed Interactive Micro-Tools
- **Dynamic HTML5/SVG Micro-Tool Synthesis:** Generates interactive mini-applications (calculators, sliders, visualizers) inside an isolated runtime.
- **Zero-Network Sandboxed Iframe:** Enforces strict Content Security Policy (`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';`).
- **Visual Spend Variance Chart:** Renders interactive departmental variance bar charts with dynamic toggles between absolute amounts (₹ Cr) and percentages (%).

### Cluster 8: Enterprise Contract Intelligence & Governance Suite
Outskirts provides a comprehensive, production-tested suite of 15 enterprise contract intelligence workflows:
1. **5-Year Contract Master Register (.xlsx):** Multi-year ERP contract ingestion across all engineering departments.
2. **Clause-wise Obligation Tracker (.xlsx):** Extraction of maintenance obligations, departmental owners, deadlines, and penalty liabilities.
3. **180-Day Renewal Alert Calendar:** Proactive tracking of expiring contracts with cryptographic doc hashes and auto-drafted extension memos.
4. **Total Financial Exposure Matrix:** Aggregation of awarded values, 10% LD caps, WPI escalation clauses, and pending change orders.
5. **5-Year Vendor Performance Scorecard:** Historical evaluation of on-time delivery %, quality NCRs, safety violations, and composite ratings.
6. **Commercial & Technical Tender Bid Evaluation:** Multi-bidder comparison matrix with L1/L2 ranking, deviation analysis, and award recommendations.
7. **Liquidated Damages (LD) Calculator:** Exact calendar delay audits, milestone grace period handling, 0.5%/week deduction, statutory cap enforcement, and GST recovery.
8. **Clause-by-Clause GCC Redline Deviation Report:** Side-by-side redline comparison between draft contracts and standard MRPL GCC with legal risk tiers.
9. **Refinery HSE Compliance Tracker:** Safety obligation mapping across OISD, API, and CPCB norms with review queue escalation.
10. **1-Command Monthly Governance Pack:** Instant compilation of an executive slide deck (.pptx), formal meeting minutes (.docx), and backing workbook (.xlsx) bound in Decision DNA.
11. **Pump P-101 NPSH Margin Verification:** Exact hydraulic head loss and API 610 cavitation verification.
12. **Multi-Turn YoY Spend Comparison:** Comparative variance analysis between FY 2023-24 and FY 2024-25.
13. **Interactive Variance Bar Chart Micro-Tool:** Sandboxed interactive departmental variance visualizer with responsive UI controls.
14. **Strict Unformatted Raw CSV PO Exporter:** Direct delimited RFC 4180 streaming without formatting wrappers.
15. **Single-Shot Three-Table Risk Exposure Query (3+ Entity JOIN):** Complex relational cross-join across Vendors, Active Contracts, Pending LDs, and Bank Guarantees expiring within 90 days.

### Cluster 9: Cryptographic Provenance & C2PA Decision DNA
- **Decision DNA Merkle Tree:** Hashes every prompt, step, tool call, and verdict into an immutable cryptographic Merkle root.
- **Ed25519 Asymmetric Signatures:** Authenticates the provenance chain using sovereign hardware or local key pairs.
- **C2PA Manifest Embedding:** Generates standard-compliant JUMBF provenance metadata bound directly into exported `.docx` and `.pdf` files.
- **Interactive Provenance Canvas:** Visual n8n mesh mode enabling engineers to inspect individual audit leaves and cryptographic hashes.

---

## 5. In-Depth Tech Stack Specification

Outskirts is organized as a high-performance **pnpm monorepo** consisting of 7 internal packages and 2 applications, engineered in strict TypeScript and WebAssembly:

```
D:\Outskirts
├── apps/
│   ├── desktop/          # Sovereign Electron / Vite / React 19 Client UI
│   └── server/           # Fastify / Node.js 22 LTS Local Event Pipeline
├── packages/
│   ├── schemas/          # Central Zod & JSON Schema Registry
│   ├── pal/              # Platform Abstraction Layer & Local LLM Adapters
│   ├── sovereignty/      # Merkle Trees, Ed25519 Signatures & C2PA Provenance
│   ├── knowledge/        # GraphRAG & Document Freshness Engine
│   └── plugin-sdk/       # WASM Runtime & Deterministic Engineering Tools
├── benchmark/            # Performance, Latency & Egress Verification Suites
└── deploy/               # Air-Gapped Bundlers & Local Daemon Configurations
```

### 5.1 Monorepo Architecture & Package Breakdown

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                MONOREPO PACKAGE TOPOLOGY                                │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                               apps/desktop (UI)                                 │   │
│   │     React 19 • Vite 6 • Zustand 5-Slice Store • n8n Canvas • SVG Blueprints     │   │
│   └───────────────┬─────────────────────────┬─────────────────────────┬─────────────┘   │
│                   │                         │                         │                 │
│                   ▼                         ▼                         ▼                 │
│   ┌───────────────────────────────┐ ┌───────────────┐ ┌─────────────────────────────┐   │
│   │      packages/schemas         │ │ packages/pal  │ │    packages/sovereignty     │   │
│   │  Zod v4 • Canonical Contracts │ │ Local LLM/vLLM│ │ Merkle Trees • Ed25519 Sign │   │
│   │  JSON Schemas • Plan Graphs   │ │ Egress Guard  │ │ C2PA JUMBF Manifests        │   │
│   └───────────────┬───────────────┘ └───────┬───────┘ └───────────────┬─────────────┘   │
│                   │                         │                         │                 │
│                   ▼                         ▼                         ▼                 │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              apps/server (Daemon)                               │   │
│   │    Fastify 4 • WebSocket Engine • Monotonic Sequence Clock • Event Spine        │   │
│   └───────────────┬───────────────────────────────────────────────────┬─────────────┘   │
│                   │                                                   │                 │
│                   ▼                                                   ▼                 │
│   ┌───────────────────────────────┐                   ┌─────────────────────────────┐   │
│   │      packages/knowledge       │                   │     packages/plugin-sdk     │   │
│   │  GraphRAG • Vector Search     │                   │ WASM Runtime (Wasmtime)     │   │
│   │  Freshness Decay Scoring      │                   │ Deterministic Math Kernels  │   │
│   └───────────────────────────────┘                   └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Package 1: `apps/desktop` (Sovereign Industrial Desktop Application)
- **Framework & Build:** React 19, TypeScript 5.8, Vite 6.4.3.
- **State Architecture:** Zustand multi-slice store partitioned into:
  - `workbenchSlice`: Task graphs, nodes, chat stream, preview panels, active datasets.
  - `sovereigntySlice`: Zero-egress counters, hardware isolation logs, perimeter security state.
  - `criticSlice`: C1–C5 automated evaluation gates and residual delta recordings.
  - `microToolSlice`: Sandboxed iframe lifecycle and dynamic HTML5/SVG app hydration.
  - `dnaSlice`: Decision DNA Merkle tree state, leaf audits, and cryptographic signing anchors.
- **Visual Canvas:** Custom high-performance HTML5/SVG node-graph renderer ([`N8nMeshCanvas.tsx`](file:///D:/Outskirts/apps/desktop/src/components/N8nMeshCanvas.tsx)) implementing smooth bezier connectors, interactive drag physics, execution wire pulses, and node telemetries.
- **Sandboxed Execution:** Secure `<iframe sandbox="allow-scripts">` sandbox enforcing zero external network connectivity for dynamically synthesized micro-tools.

#### Package 2: `apps/server` (Local Core Daemon & WebSocket Pipeline)
- **Runtime:** Node.js 22 LTS, Fastify v4 HTTP engine.
- **Streaming Pipeline:** Native WebSocket server (`ws://127.0.0.1:3000/ws`) providing live monotonic step events, token generation streams, and Critic verification triggers.
- **Monotonic Event Spine:** Cryptographic sequence counter ensuring zero dropped events and total order of causal operations.
- **Human-in-the-Loop Review Queue:** RBAC-governed audit queue holding actions that fail Critic gates until manual engineering sign-off.

#### Package 3: `packages/schemas` (Canonical Data Contracts & Spine)
- **Validation Engine:** Zod v4 with bidirectional JSON Schema compilation.
- **Core Entities:** Formally typed definitions for `Plan`, `PlanStep`, `CriticVerdict`, `ServerEvent`, `ModelRoutingDecision`, `SpreadsheetDataset`, `CalculationDataset`, `DeviationDataset`, and `GovernancePackDataset`.
- **Standards Compliance:** Conforms strictly to JSON Schema Draft 2020-12 specifications.

#### Package 4: `packages/pal` (Platform Abstraction Layer & Local Model Host)
- **Inference Runtime Adapters:** Native integration with local loopback endpoints:
  - `vLLM` (`127.0.0.1:8001`): Continuous batching for AWQ and FP8 models.
  - `Ollama` (`127.0.0.1:11434`): Quantized GGUF inference (Q4_K_M, Q8_0).
  - `llama.cpp` server: CPU-fallback for low-power edge field tablets.
- **Hardware Telemetry:** Direct discovery of GPU VRAM, temperature, and compute utilization via NVML / ROCm / Apple Metal.
- **Egress Perimeter Guard:** Low-level socket monitor auditing network interfaces; automatically severs sockets attempting non-loopback routing.

#### Package 5: `packages/sovereignty` (Cryptographic Provenance Engine)
- **Merkle Engine:** In-memory and persisted SHA-256 binary Merkle tree implementation with balanced leaf pairing and provable inclusion proofs.
- **Asymmetric Signature Suite:** Ed25519 public-key signing engine generating verifiable cryptographic certificates.
- **C2PA JUMBF Manifest Generator:** Standard-compliant Content Credentials builder embedding assertion stores, claim generators, and cryptographic binding into output documents.

#### Package 6: `packages/knowledge` (GraphRAG & Document Freshness Engine)
- **Piping & Asset Knowledge Graph:** Graph structure mapping lines, valves, pumps, vessels, and instruments into an interconnected topological model.
- **Vector Retrieval:** BGE-Small local embeddings with cosine similarity reranking.
- **Mathematical Freshness Decay:**
  $$\text{Freshness Score} = e^{-\lambda \Delta t}$$
  Where $\lambda$ represents the document category decay rate and $\Delta t$ is the elapsed operational lifespan. Documents decaying past critical thresholds trigger Critic C5 flags.

#### Package 7: `packages/plugin-sdk` (Deterministic WASM Plugin Engine)
- **Runtime:** Sandboxed WebAssembly execution environment (Wasmer / Wasmtime).
- **Engineering Tools:** Pre-compiled WASM modules including:
  - `pipe-calc-plugin`: Colebrook-White friction and Darcy pressure drop solver.
  - `npsh-calc-plugin`: Hydraulic suction head and cavitation margin solver.
  - `ld-calc-plugin`: Calendar delay, grace period, and statutory ceiling calculator.
- **Deterministic Replay Guarantee:** Identical inputs yield bit-exact identical floating-point outputs on x86_64 and ARM64.

---

### 5.2 Local AI Specialist Model Fleet (Air-Gapped)

| Role | Foundation Model | Quantization | Serving Engine | Memory Footprint | Latency Budget |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Physics, Math & Reasoning** | DeepSeek-R1-Distill-Qwen-7B | Q4_K_M | Ollama / vLLM | 4.6 GB VRAM | 35–60 ms/tok |
| **Document, Legal & Contracts** | Qwen 2.5 7B Instruct | Q4_K_M | Ollama / vLLM | 4.8 GB VRAM | 30–50 ms/tok |
| **Code & Micro-Tool Synthesis** | Qwen 2.5 Coder 7B | AWQ (4-bit) | vLLM (Loopback) | 4.4 GB VRAM | 40–70 ms/tok |
| **Vision, P&ID & Field Notes** | Qwen 2.5 VL 7B Instruct | FP8 / AWQ | vLLM (Loopback) | 5.2 GB VRAM | 50–90 ms/tok |
| **Fast Utility & Translation** | Llama 3.2 3B Instruct | Q4_K_M | Ollama / llama.cpp | 2.2 GB VRAM | 15–25 ms/tok |

---

### 5.3 Cryptographic Provenance & Security Architecture

Every operation inside Outskirts generates an unalterable audit chain:

```
[User Prompt Fingerprint] ──┐
[Model Weights SHA-256]   ──┼──> [Leaf Hash 1..N] ──> [SHA-256 Merkle Tree] ──> [Merkle Root]
[Tool Call Inputs/Outputs]──┤                                                        │
[Critic C1–C5 Pass Record]──┘                                                        ▼
                                                                            [Ed25519 Signature]
                                                                                     │
                                                                                     ▼
                                                                            [C2PA JUMBF Manifest]
                                                                                     │
                                                                                     ▼
                                                                           Bound to Deliverable
                                                                           (.docx / .xlsx / .pptx)
```

1. **Leaf Generation:** Every input prompt, model invocation, WASM tool execution, and Critic check produces a deterministic SHA-256 leaf hash.
2. **Merkle Aggregation:** Leaves are paired and hashed recursively into a single 32-byte **Merkle Root**.
3. **Hardware-Bound Signing:** The root hash is signed using an Ed25519 private key securely stored inside local software keystores or hardware security modules (TPM/HSM).
4. **C2PA Manifest Binding:** The signed claim is wrapped inside standard C2PA Content Credentials metadata and embedded into generated deliverables, enabling third-party auditors to verify authenticity offline.

---

## 6. Verification & Automated Test Certification

Outskirts is backed by **139 automated tests** executed continuously across the monorepo:

```
Scope: 7 of 8 workspace projects
✓ packages/schemas test    (26 tests passed)  — JSON Schema Draft 2020-12, Spine contracts
✓ apps/desktop test        (24 tests passed)  — 16 Enterprise workflows, 5 Zustand slices
✓ packages/pal test        (8 tests passed)   — Hardware detection, Sovereign loopback
✓ packages/knowledge test  (23 tests passed)  — Freshness decay equations, RAG graphs
✓ packages/sovereignty test(15 tests passed)  — 1000-event synthetic Merkle verification
✓ packages/plugin-sdk test (12 tests passed)  — WASM sandbox limits, deterministic math
✓ apps/server test         (31 tests passed)  — Monotonic clocks, Critic gates, Auth RBAC
──────────────────────────────────────────────────────────────────────────────────────────
TOTAL: 139 passing tests (0 failures, 100% pass rate)
TypeScript Check: 0 type errors across all packages
Production Build: 4.64s clean compilation
```

---

## 7. Conclusion

**Outskirts** bridges the gap between state-of-the-art agentic AI and the rigorous safety, confidentiality, and deterministic demands of critical industrial infrastructure. By replacing cloud dependencies with **sovereign loopback model fleets**, probabilistic arithmetic with **deterministic symbolic engines**, and black-box assertions with **cryptographic Decision DNA**, Outskirts delivers a truly reliable, air-gapped engineering workbench ready for production deployment.
