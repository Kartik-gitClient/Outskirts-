# Outskirts Section 21: 8-Minute Live Competition Demo Runbook

> **Target Venue**: Hackathon / Sovereign AI Competition Stage  
> **Total Duration**: Exactly 7 minutes 15 seconds presentation + 45 seconds buffer (8:00 max ceiling)  
> **Speaker Role**: Chief Architect / Lead Industrial Systems Engineer  
> **Audience**: Technical Jury, Enterprise CISOs, Industrial Plant Operations VPs  
> **Automated Rehearsal Command**: `pnpm demo:rehearse` (or `pnpm demo:rehearse --fast`)

---

## ⏱ Beat-by-Beat Presentation Timeline

```mermaid
gantt
    title Outskirts 8-Minute Demo Walkthrough (Section 21)
    dateFormat  m:ss
    axisFormat  %M:%S
    
    Beat 1: The Egress Proof               :0:00, 1m
    Beat 2: P&ID Perception & GraphRAG     :1:00, 1m
    Beat 3: Journey 1 Kickoff & DAG Replay :2:00, 1m
    Beat 4: Deterministic Critic (C1-C5)   :3:00, 1m
    Beat 5: Freshness Trap & Human Lock    :4:00, 1m
    Beat 6: Decision DNA & Audit Proof     :5:00, 1m
    Beat 7: Journey 2 Micro-Tool Sandbox   :6:00, 1m
    Beat 8: Wrap & Sovereign Scorecard     :7:00, 15s
```

---

### Beat 1: The Egress Proof (0:00 – 1:00)
- **Primary Visual**: Terminal running live packet capture / `verify-egress.sh` side-by-side with Desktop **Sovereignty Dashboard Screen**.
- **On-Screen Evidence**:
  - `egressPacketCount: 0`
  - PAL Router status: `SOVEREIGN`
  - Network probe: Raw TCP egress to `1.1.1.1` and `8.8.8.8` connection timed out (no route).
- **Speaker Script**:
  > *"Every AI company tells you they respect privacy. We do not ask for your trust; we give you a mathematical proof. Right now, on this live Linux machine, our model container has no gateway route. Even if this container were root-compromised, it cannot emit a single packet to the internet. Look at the packet counter: zero. This is topology sovereignty, not policy monitoring."*
- **Action**: Click "Trigger Rogue Network Call (Simulated Egress)" on the Sovereignty Dashboard to show the immediate kernel-level refusal and `guard-alert` event on the audit timeline.

---

### Beat 2: P&ID Raster Perception & GraphRAG (1:00 – 2:00)
- **Primary Visual**: Desktop **Workbench Screen** -> **P&ID Drawing Perception Tab**.
- **On-Screen Evidence**:
  - High-resolution SVG P&ID diagram of Mangalore Refinery CDU Unit Area 1.
  - Interactive bounding boxes around tagged assets (`E-101`, `P-101A`, `V-102`, `XV-001`).
  - GraphRAG connectivity drawer showing Suction/Discharge line segments and isolation boundaries.
- **Speaker Script**:
  > *"Industrial workflows begin on the plant floor, not in clean text. Here is an authentic scanned P&ID drawing from an active crude distillation unit. Our sovereign perception service extracts instruments, piping lines, and valve symbols locally in 400 milliseconds. Click on pump P-101A: notice the topological graph instantly traces its isolation boundaries: upstream suction valve XV-001, downstream discharge valve XV-002."*
- **Action**: Click on line segment `P-101A` in the P&ID viewer to trigger the topological isolation highlight.

---

### Beat 3: Journey 1 Kickoff & Execution Plan DAG (2:00 – 3:00)
- **Primary Visual**: Desktop **Workbench Screen** -> **Execution Plan Graph (DAG)**.
- **On-Screen Evidence**:
  - 8-stage Execution Plan DAG: `Document Intake` &rarr; `Tag Extraction` &rarr; `Hydraulic Replay` &rarr; `SOP Retrieval` &rarr; `Approval Synthesis` &rarr; `Critic Verification` &rarr; `C2PA Binding` &rarr; `Decision DNA`.
  - Live streaming WebSocket timeline showing monotonic sequence numbers (`#1` through `#8`).
- **Speaker Script**:
  > *"We now launch Journey 1: Refinery Piping Wall Thickness Verification. Notice the planner does not emit unconstrained natural language; it binds to our Schema Spine. Each stage is an explicit node in a directed acyclic graph. In stage 3, the Darcy-Weisbach hydraulic calculation is dispatched to our signed WebAssembly plugin. In 20 milliseconds, the pressure drop is evaluated to 0.385 bar."*
- **Action**: Click `🛠 Build / Edit Recipe` to showcase how plant engineers can inspect or customize the execution graph in real time without altering source code.

---

### Beat 4: Deterministic Critic Verification C1–C5 (3:00 – 4:00)
- **Primary Visual**: Desktop **Workbench Screen** -> **Deterministic Critic Summary Card**.
- **On-Screen Evidence**:
  - 5 green verdict chips: `✓ C1 Numeric Grounding`, `✓ C2 Calc Replay`, `✓ C3 Citation Resolvability`, `✓ C4 Template Format`, `✓ C5 Freshness Policy`.
  - Numeric drilldown showing raw ultrasound thickness $4.8\text{ mm}$, minimum allowable $4.2\text{ mm}$, remaining life $5.0\text{ years}$.
- **Speaker Script**:
  > *"Most agent systems hallucinate engineering figures. Outskirts employs a Deterministic Critic that sits between the LLM and the final deliverable. The model cannot output a number that was not grounded in raw sensor inputs. Gate C2 re-runs the physics calculation in the background: if the replayed Darcy-Weisbach pressure drop differs by more than 0.0001 bar from the text, the deliverable is rejected immediately."*
- **Action**: Open the "Tool Call Replay" tab to display the exact input/output payloads of the calculation plugin.

---

### Beat 5: Freshness Trap & Human Approval Gate (4:00 – 5:00)
- **Primary Visual**: Desktop **Review Queue Screen** with red banner `BLOCKED ON FRESHNESS`.
- **On-Screen Evidence**:
  - Citation: `MRPL-SOP-402 (Piping Maintenance Specification)`
  - Decay score: $0.95$ (Half-life exceeded; state `CRITICAL`).
  - "Approve Deliverable" button is **HARD-LOCKED** (disabled with lock icon).
- **Speaker Script**:
  > *"Here is our unique defense against operational disaster: Knowledge Freshness Decay. SOPs in refineries evolve; an old procedure can lead to a plant incident. Notice the citation to SOP-402 has a decay score of 0.95. The system automatically locks the approval gate. A senior engineer cannot accidentally approve this note. They must explicitly review and acknowledge the freshness alert."*
- **Action**: Click "Acknowledge Freshness Decay", input justification *"Verified against 2026 Addendum"*, unlocking the "Approve & Commit" button.

---

### Beat 6: Decision DNA & Immutable Audit Proof (5:00 – 6:00)
- **Primary Visual**: Desktop **Review Queue Screen** -> **Decision DNA Modal** & **Signed Approval Note**.
- **On-Screen Evidence**:
  - `.docx` deliverable with embedded Ed25519 signature and C2PA manifest.
  - Merkle Audit Chain visualizer showing hash-linked root `sha256:4f8e9...` and in-toto link attestations.
- **Speaker Script**:
  > *"Once approved, Outskirts generates a C2PA-compliant industrial approval note. Open the file in Word or Acrobat: the cryptographic signature is verified against the refinery's root key. Every decision—the exact prompt, model weights digest, tool inputs, human reviewer identity, and timestamp—is permanently sealed into an in-toto link attestation and Merkle chain. This document is admissible in a regulatory court."*
- **Action**: Click "View Decision DNA Attestation" to reveal the JSON-LD verifiable credential graph.

---

### Beat 7: Journey 2 Sandboxed Micro-Tool (6:00 – 7:00)
- **Primary Visual**: Desktop **Workbench Screen** -> **Journey 2 Micro-Tool Tab**.
- **On-Screen Evidence**:
  - Sandboxed iframe running the auto-generated HTML5/JS Hydraulic Sizing calculator.
  - Interactive slider controls for Pipe Length ($120\text{m}$), Diameter ($150\text{mm}$), Flow ($180\text{m}^3/\text{h}$).
  - Live calculation re-evaluating Darcy-Weisbach frictional loss in real-time ($0.385\text{ bar}$).
  - Simulated rogue fetch attack trapped by `sandbox="allow-scripts"` and `default-src 'none'` CSP.
- **Speaker Script**:
  > *"When an engineer needs an ad-hoc micro-utility, the model synthesizes a standalone micro-tool. But how do you run untrusted LLM-generated code safely? We isolate it inside an iframe with zero network privileges and no same-origin tokens. When the tool tries to leak data to an external server, the browser CSP terminates it with extreme prejudice."*
- **Action**: Drag the flow slider to show live recalculation, then click "Attempt Rogue Egress" to trigger the sandbox security interception.

---

### Beat 8: Wrap & Sovereign Scorecard (7:00 – 7:15)
- **Primary Visual**: **Terminal / Scorecard Screen** showing 14/14 green checkmarks.
- **Speaker Script**:
  > *"14 out of 14 non-negotiable industrial metrics passing. Zero egress packets. Zero model cost. Sub-second determinism. Outskirts delivers sovereign, verifiable intelligence for the physical world. Thank you."*

---

## 🛡 Contingency & Fallback Triggers

| Scenario | Contingency Action |
| :--- | :--- |
| **Network Failure on Stage** | No-op! Outskirts is 100% sovereign and air-gapped. Network drops do not affect execution. |
| **Local vLLM / Ollama Slowdown** | PAL automatically falls back to seeded deterministic fallback models (`qwen2.5-coder-7b-awq` loopback simulator). |
| **WebSocket Port Conflict** | Server automatically binds to dynamic port or falls back to polling event replay (`/api/tasks/:id/events?since=N`). |
| **Fast Time Limit (< 5 mins)** | Run `pnpm demo:rehearse --fast` to execute the full 8 beats in 120 milliseconds with complete programmatic verification. |
