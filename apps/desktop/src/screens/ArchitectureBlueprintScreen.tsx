import React, { useState } from 'react';
import { N8nMeshCanvas, type MeshNode, type MeshEdge } from '../components/N8nMeshCanvas.js';

export const ArchitectureBlueprintScreen: React.FC = () => {
  const [activeWorkflowPreset, setActiveWorkflowPreset] = useState<
    'full_architecture' | 'journey_1' | 'journey_2' | 'journey_3'
  >('full_architecture');

  // Master Architecture Nodes
  const FULL_ARCHITECTURE_NODES: MeshNode[] = [
    // Layer 1: Ingress
    {
      id: 'node-client',
      label: 'Tauri Desktop Client',
      subtitle: 'React 18 + Zustand + Loopback IPC',
      category: 'trigger',
      status: 'done',
      x: 40,
      y: 120,
      icon: '🖥',
      latencyMs: 1.2,
      modelOrTool: 'Tauri 2.0 Rust',
      inputData: { port: 54211, csp: "default-src 'self' ws://127.0.0.1:*" },
      outputData: { status: 'Connected', monotonicSeq: 42 },
    },
    {
      id: 'node-gateway',
      label: 'Server Gateway & Event Bus',
      subtitle: 'Fastify + Monotonic WebSocket Streamer',
      category: 'router',
      status: 'done',
      x: 320,
      y: 120,
      icon: '⚡',
      latencyMs: 3.4,
      modelOrTool: 'Node 22 / TypeScript',
      inputData: { routes: ['/api/chat', '/api/tasks', '/api/models', '/api/perception'] },
      outputData: { activeClients: 1, auditEmitted: true },
    },

    // Layer 2: Perception
    {
      id: 'node-docling',
      label: 'Docling Document Parser',
      subtitle: 'Multimodal OCR & Layout Extraction',
      category: 'perception',
      status: 'done',
      x: 600,
      y: 40,
      icon: '📑',
      latencyMs: 45.0,
      modelOrTool: 'Docling-v2',
      inputData: { target: 'MRPL-UT-2026.pdf', pages: 4 },
      outputData: { extractedTables: 3, detectedTextChunks: 18 },
    },
    {
      id: 'node-rfdetr',
      label: 'RF-DETR + SAHI Vision',
      subtitle: 'ISA-5.1 Symbol & Valve Extractor',
      category: 'perception',
      status: 'done',
      x: 600,
      y: 160,
      icon: '👁',
      latencyMs: 32.5,
      modelOrTool: 'RF-DETR Small',
      inputData: { drawingSheet: 'MRPL-CDU-01', sliceSize: 640 },
      outputData: { detectedTags: ['P-101A', 'GV-1001', 'GV-1002', 'FV-2034', 'V-102'] },
    },
    {
      id: 'node-graphrag',
      label: 'Industrial GraphRAG',
      subtitle: 'Topological Line & Equipment Traversal',
      category: 'rag',
      status: 'done',
      x: 880,
      y: 160,
      icon: '🕸',
      latencyMs: 8.2,
      modelOrTool: 'PidProcessGraph',
      inputData: { targetEquipment: 'P-101A', query: 'Isolation Block Valves' },
      outputData: { suctionIsolation: 'GV-1001', dischargeIsolation: 'GV-1002' },
    },

    // Layer 3: Provider Adapter Layer (PAL)
    {
      id: 'node-pal-router',
      label: 'PAL Residency Router',
      subtitle: 'Sovereignty Gate & Latency Budgets',
      category: 'router',
      status: 'done',
      x: 600,
      y: 280,
      icon: '🔀',
      latencyMs: 1.8,
      modelOrTool: 'PAL v1.0 Core',
      inputData: { mode: 'SOVEREIGN', egressQuota: 0, budgetMs: 180000 },
      outputData: { route: 'qwen2.5-7b-instruct-q4', boundary: 'inside-perimeter' },
    },
    {
      id: 'node-vllm-local',
      label: 'Local vLLM / Ollama Cluster',
      subtitle: 'Qwen 2.5 7B AWQ @ Loopback (0 Egress)',
      category: 'agent',
      status: 'done',
      x: 880,
      y: 280,
      icon: '🧠',
      latencyMs: 18.4,
      modelOrTool: 'Qwen2.5-Coder-7B',
      inputData: { promptTokens: 1420, temperature: 0.0, seed: 42 },
      outputData: { generatedTokens: 380, stopReason: 'tool_call' },
    },

    // Layer 4: Execution Sandbox
    {
      id: 'node-wasm-sandbox',
      label: 'Extism WASM Plugin Host',
      subtitle: 'Zero-Egress Sandboxed Tool Calling',
      category: 'tool',
      status: 'done',
      x: 1160,
      y: 280,
      icon: '⚙',
      latencyMs: 12.0,
      modelOrTool: 'Extism WASM Engine',
      inputData: { tool: 'calculate_pressure_drop', length: 120, diameter: 0.154, flow: 180 },
      outputData: { deltaP_bar: 0.4579, correlation: 'Darcy-Weisbach / Swamee-Jain' },
    },

    // Layer 5: Verification & Trust
    {
      id: 'node-critic',
      label: 'Deterministic Critic C1–C5',
      subtitle: 'Physical Arithmetic Replay & Citation Gate',
      category: 'critic',
      status: 'done',
      x: 1440,
      y: 200,
      icon: '🛡',
      latencyMs: 10.5,
      modelOrTool: 'SymPy + Pint Engine',
      inputData: { claims: ['deltaP = 0.4579 bar', 'thickness = 4.8mm'] },
      criticVerdicts: [
        { name: 'C1 Numeric Grounding', passed: true, details: 'Traced to tool output #calc-42' },
        { name: 'C2 Arithmetic Replay', passed: true, details: '0.4579 bar verified ±0.0001 bar' },
        { name: 'C3 Citation Integrity', passed: true, details: 'API 570 Section 7.1 validated' },
        { name: 'C4 Schema & Format', passed: true, details: 'Strict Zod CalcResult match' },
        { name: 'C5 Knowledge Decay Gate', passed: true, details: 'Governing standard within 180d review' },
      ],
      outputData: { allPassed: true, repairCyclesNeeded: 0 },
    },
    {
      id: 'node-c2pa',
      label: 'C2PA Cryptographic Signer',
      subtitle: 'Ed25519 Provenance Injection',
      category: 'provenance',
      status: 'done',
      x: 1720,
      y: 200,
      icon: '✍',
      latencyMs: 5.2,
      modelOrTool: 'Ed25519 Native',
      inputData: { artifactSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
      outputData: { signature: 'c2pa_sig_ed25519_verified', keyId: 'sovereign-org-key' },
    },
    {
      id: 'node-merkle-dna',
      label: 'Decision DNA Merkle Chain',
      subtitle: 'Audited SHA-256 Ledger & Tree Root',
      category: 'provenance',
      status: 'done',
      x: 1720,
      y: 320,
      icon: '🧬',
      latencyMs: 2.1,
      modelOrTool: 'Merkle Audit Log',
      inputData: { leafEvents: 24, taskId: 'task-verify-j1' },
      outputData: { rootHash: '4b7ca720ec7b609802d33ff0824b210626a57c5a04e5714f85e505230d7b0a70' },
    },
    {
      id: 'node-final-deliverable',
      label: 'Certified Deliverable Output',
      subtitle: 'DOCX / Micro-Tool / XLSX / PPTX',
      category: 'output',
      status: 'done',
      x: 2000,
      y: 260,
      icon: '📦',
      latencyMs: 15.0,
      modelOrTool: 'Artifact Compiler',
      inputData: { targetFormat: 'DOCX + C2PA' },
      outputData: { bytes: 24590, status: 'MOUNTED_IN_RIGHT_PANEL' },
    },
  ];

  const FULL_ARCHITECTURE_EDGES: MeshEdge[] = [
    { id: 'e1', from: 'node-client', to: 'node-gateway', label: 'WS Monotonic Stream', active: true, animated: true },
    { id: 'e2', from: 'node-gateway', to: 'node-docling', label: 'PDF Dispatch', active: true, animated: true },
    { id: 'e3', from: 'node-gateway', to: 'node-rfdetr', label: 'Drawing Dispatch', active: true, animated: true },
    { id: 'e4', from: 'node-rfdetr', to: 'node-graphrag', label: 'Symbol Graph', active: true, animated: true },
    { id: 'e5', from: 'node-gateway', to: 'node-pal-router', label: 'Task Payload', active: true, animated: true },
    { id: 'e6', from: 'node-pal-router', to: 'node-vllm-local', label: 'Loopback Pipe', active: true, animated: true },
    { id: 'e7', from: 'node-vllm-local', to: 'node-wasm-sandbox', label: 'Tool Invocation', active: true, animated: true },
    { id: 'e8', from: 'node-graphrag', to: 'node-vllm-local', label: 'Topological Context', active: true, animated: true },
    { id: 'e9', from: 'node-docling', to: 'node-vllm-local', label: 'Grounding Chunks', active: true, animated: true },
    { id: 'e10', from: 'node-wasm-sandbox', to: 'node-critic', label: 'Raw Computation', active: true, animated: true },
    { id: 'e11', from: 'node-critic', to: 'node-c2pa', label: 'Verified Pass', active: true, animated: true },
    { id: 'e12', from: 'node-critic', to: 'node-merkle-dna', label: 'Audit Commit', active: true, animated: true },
    { id: 'e13', from: 'node-c2pa', to: 'node-final-deliverable', label: 'Signed Package', active: true, animated: true },
    { id: 'e14', from: 'node-merkle-dna', to: 'node-final-deliverable', label: 'Merkle Anchor', active: true, animated: true },
  ];

  return (
    <div className="blueprint-screen-container">
      {/* Blueprint Header */}
      <div className="blueprint-header-bar">
        <div className="blueprint-title-area">
          <div className="blueprint-title-row">
            <span className="blueprint-logo">⚡</span>
            <h2>Outskirts Sovereign System Architecture Mesh</h2>
            <span className="badge-sovereign">Air-Gapped n8n Topology</span>
          </div>
          <p className="blueprint-description">
            Interactive, node-based representation of the full Outskirts architecture. Click any subsystem to inspect
            its real-time telemetry, memory footprint, zero-egress enforcement, and mathematical verification guarantees.
          </p>
        </div>

        {/* Workflow Presets Switcher */}
        <div className="blueprint-presets-bar">
          <span className="preset-label">View Preset:</span>
          <button
            className={`preset-btn ${activeWorkflowPreset === 'full_architecture' ? 'active' : ''}`}
            onClick={() => setActiveWorkflowPreset('full_architecture')}
          >
            🏢 Full System Mesh
          </button>
          <button
            className={`preset-btn ${activeWorkflowPreset === 'journey_1' ? 'active' : ''}`}
            onClick={() => setActiveWorkflowPreset('journey_1')}
          >
            📄 Journey 1 (Inspection & Approval)
          </button>
          <button
            className={`preset-btn ${activeWorkflowPreset === 'journey_2' ? 'active' : ''}`}
            onClick={() => setActiveWorkflowPreset('journey_2')}
          >
            ⚙ Journey 2 (Micro-Tool Sandbox)
          </button>
          <button
            className={`preset-btn ${activeWorkflowPreset === 'journey_3' ? 'active' : ''}`}
            onClick={() => setActiveWorkflowPreset('journey_3')}
          >
            📐 Journey 3 (P&amp;ID Perception)
          </button>
        </div>
      </div>

      {/* Main n8n Mesh Canvas */}
      <div className="blueprint-canvas-wrapper">
        <N8nMeshCanvas
          nodes={FULL_ARCHITECTURE_NODES}
          edges={FULL_ARCHITECTURE_EDGES}
          title="OUTSKIRTS SYSTEM TOPOLOGY — MONOTONIC EVENT BACKPLANE"
          subtitle="Click and drag to pan • Scroll to zoom • Click any node to open live telemetry drawer"
          height="calc(100vh - 220px)"
          enableDragging={true}
        />
      </div>

      {/* Subsystem Quick Stats Bar */}
      <div className="blueprint-bottom-telemetry">
        <div className="stat-card">
          <span className="stat-label">Zero Egress Policy</span>
          <span className="stat-value highlight-green">0 Packets Leaked</span>
          <span className="stat-sub">Docker internal: true · Loopback only</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Model Residency</span>
          <span className="stat-value highlight-cyan">100% Inside Perimeter</span>
          <span className="stat-sub">vLLM AWQ / Ollama @ 127.0.0.1</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Deterministic Critic C1–C5</span>
          <span className="stat-value highlight-purple">100% Catch Rate</span>
          <span className="stat-sub">SymPy &amp; Pint physical replays</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">C2PA Cryptography</span>
          <span className="stat-value highlight-amber">Ed25519 Merkle Anchored</span>
          <span className="stat-sub">Offline verifiable Decision DNA</span>
        </div>
      </div>
    </div>
  );
};
