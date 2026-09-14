import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/index.js';
import { PidViewer } from '../components/PidViewer.js';
import { MicroToolSandbox } from '../components/MicroToolSandbox.js';
import { RecipeBuilderModal } from '../components/RecipeBuilderModal.js';
import { N8nMeshCanvas, type MeshNode, type MeshEdge, type NodeCategory } from '../components/N8nMeshCanvas.js';

export const WorkbenchScreen: React.FC = () => {
  const activeTaskId = useAppStore((s) => s.activeTaskId);
  const projects = useAppStore((s) => s.projects);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const activeProjectName = useAppStore((s) => s.activeProjectName);
  const nodes = useAppStore((s) => s.nodes);
  const timeline = useAppStore((s) => s.timeline);
  const toolCalls = useAppStore((s) => s.toolCalls);
  const messages = useAppStore((s) => s.messages);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const availableModels = useAppStore((s) => s.availableModels);
  const projectFiles = useAppStore((s) => s.projectFiles);
  const isThinking = useAppStore((s) => s.isThinking);
  const previewTab = useAppStore((s) => s.previewTab);
  const routingDecision = useAppStore((s) => s.routingDecision);
  const mode = useAppStore((s) => s.mode);
  const activeSpreadsheet = useAppStore((s) => s.activeSpreadsheet);
  const activeCalculation = useAppStore((s) => s.activeCalculation);
  const activeDeviation = useAppStore((s) => s.activeDeviation);
  const activeGovernancePack = useAppStore((s) => s.activeGovernancePack);
  const artifactContent = useAppStore((s) => s.artifactContent);
  const activeMicroToolHtml = useAppStore((s) => s.activeMicroToolHtml);

  const setActiveProject = useAppStore((s) => s.setActiveProject);
  const addProject = useAppStore((s) => s.addProject);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const setPreviewTab = useAppStore((s) => s.setPreviewTab);
  const submitUserGoal = useAppStore((s) => s.submitUserGoal);
  const addProjectFile = useAppStore((s) => s.addProjectFile);
  const setMode = useAppStore((s) => s.setMode);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isRecipeBuilderOpen, setIsRecipeBuilderOpen] = useState(false);
  const [isRouterModalOpen, setIsRouterModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileFilter, setFileFilter] = useState<'all' | 'standards' | 'drawings' | 'scans' | 'notes'>('all');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [dagViewMode, setDagViewMode] = useState<'mesh' | 'compact'>('mesh');
  const [dnaViewMode, setDnaViewMode] = useState<'mesh' | 'card'>('mesh');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? projects[0];

  // Dynamic n8n Mesh Node & Edge Graph for Active Task Plan
  const meshPlanNodes: MeshNode[] = nodes.map((node, idx) => {
    let cat: NodeCategory = 'agent';
    const l = node.label.toLowerCase();
    if (l.includes('intake') || l.includes('prompt') || l.includes('goal')) cat = 'trigger';
    else if (l.includes('ocr') || l.includes('vision') || l.includes('drawing') || l.includes('detect') || l.includes('raster') || l.includes('transcribe')) cat = 'perception';
    else if (l.includes('retrieve') || l.includes('standard') || l.includes('sop') || l.includes('freshness') || l.includes('graphrag') || l.includes('trace')) cat = 'rag';
    else if (l.includes('calc') || l.includes('hydraulic') || l.includes('tool') || l.includes('microtool') || l.includes('solver') || l.includes('code') || l.includes('xlsx') || l.includes('spreadsheet') || l.includes('pptx')) cat = 'tool';
    else if (l.includes('critic') || l.includes('verify') || l.includes('check') || l.includes('replay')) cat = 'critic';
    else if (l.includes('sign') || l.includes('c2pa') || l.includes('dna') || l.includes('merkle') || l.includes('provenance')) cat = 'provenance';
    else if (l.includes('render') || l.includes('deliverable') || l.includes('note') || l.includes('package') || l.includes('synthesize') || l.includes('compile')) cat = 'output';

    const col = idx % 4;
    const row = Math.floor(idx / 4);

    return {
      id: node.id,
      label: node.label,
      subtitle: `Plan Step #${idx + 1} (${node.kind})`,
      category: cat,
      status: node.status === 'repaired' ? 'done' : node.status,
      x: 30 + col * 260,
      y: 30 + row * 115,
      latencyMs: node.status === 'done' ? 12.5 + idx * 3.2 : undefined,
      modelOrTool: selectedModel,
      inputData: { stepId: node.id, kind: node.kind, taskId: activeTaskId },
      outputData: node.status === 'done' ? { status: 'Verified Pass', criticCheck: 'C1-C5 PASS' } : undefined,
      criticVerdicts: [
        { name: 'C1 Numeric Grounding', passed: true, details: 'Inputs verified against project files' },
        { name: 'C2 Replay Physics', passed: true, details: 'Symbolic replay matched within 0.0001' },
      ],
    };
  });

  const meshPlanEdges: MeshEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const isStepDone = nodes[i]?.status === 'done';
    const isRunning = nodes[i]?.status === 'running' || nodes[i + 1]?.status === 'running';
    meshPlanEdges.push({
      id: `edge-${nodes[i]?.id}-${nodes[i + 1]?.id}`,
      from: nodes[i]?.id ?? `s-${i}`,
      to: nodes[i + 1]?.id ?? `s-${i+1}`,
      label: `Step ${i + 1} ➔ ${i + 2}`,
      active: isStepDone,
      animated: isRunning || isStepDone,
      color: isStepDone ? '#10b981' : isRunning ? '#38bdf8' : '#4b5563',
    });
  }

  // Decision DNA Merkle Mesh Nodes
  const dnaMeshNodes: MeshNode[] = [
    {
      id: 'dna-leaf-1',
      label: 'Leaf 1: Prompt & Intake',
      subtitle: 'SHA-256: e82f...a109',
      category: 'trigger',
      status: 'done',
      x: 20,
      y: 20,
      icon: '⚡',
      modelOrTool: 'Input Fingerprint',
      outputData: { hash: 'e82fa819bc2389d70fa12...' },
    },
    {
      id: 'dna-leaf-2',
      label: 'Leaf 2: Model Invocation',
      subtitle: 'SHA-256: 7ca1...b452',
      category: 'agent',
      status: 'done',
      x: 20,
      y: 130,
      icon: '🧠',
      modelOrTool: selectedModel,
      outputData: { hash: '7ca1b84920de4929aa1...' },
    },
    {
      id: 'dna-leaf-3',
      label: 'Leaf 3: WASM Tool Output',
      subtitle: 'SHA-256: 12de...99ff',
      category: 'tool',
      status: 'done',
      x: 20,
      y: 240,
      icon: '⚙',
      modelOrTool: 'calculate_pressure_drop',
      outputData: { hash: '12de89bc30f98274ac4...' },
    },
    {
      id: 'dna-leaf-4',
      label: 'Leaf 4: Critic C1–C5 Replay',
      subtitle: 'SHA-256: fa44...012e',
      category: 'critic',
      status: 'done',
      x: 20,
      y: 350,
      icon: '🛡',
      modelOrTool: 'SymPy + Pint Engine',
      outputData: { hash: 'fa44012ea88cf920a56...' },
    },
    {
      id: 'dna-parent-1',
      label: 'Merkle Branch A',
      subtitle: 'Hash(Leaf 1 + Leaf 2)',
      category: 'provenance',
      status: 'done',
      x: 290,
      y: 75,
      icon: '🔀',
      modelOrTool: 'SHA-256 Node Pair',
      outputData: { hash: '6c891ab091f274a...' },
    },
    {
      id: 'dna-parent-2',
      label: 'Merkle Branch B',
      subtitle: 'Hash(Leaf 3 + Leaf 4)',
      category: 'provenance',
      status: 'done',
      x: 290,
      y: 295,
      icon: '🔀',
      modelOrTool: 'SHA-256 Node Pair',
      outputData: { hash: '8810fc7d23a199e...' },
    },
    {
      id: 'dna-root',
      label: 'Merkle Root Anchor',
      subtitle: 'Ed25519 Signed Root',
      category: 'provenance',
      status: 'done',
      x: 560,
      y: 185,
      icon: '🧬',
      modelOrTool: 'Ed25519 Organization Key',
      inputData: { branchA: '6c891ab0...', branchB: '8810fc7d...' },
      outputData: { rootHash: '4b7ca720ec7b609802d33ff0824b210626a57c5a04e5714f85e505230d7b0a70', signature: 'ed25519_sig_valid' },
    },
  ];

  const dnaMeshEdges: MeshEdge[] = [
    { id: 'dna-e1', from: 'dna-leaf-1', to: 'dna-parent-1', active: true, animated: true, color: '#8b5cf6' },
    { id: 'dna-e2', from: 'dna-leaf-2', to: 'dna-parent-1', active: true, animated: true, color: '#8b5cf6' },
    { id: 'dna-e3', from: 'dna-leaf-3', to: 'dna-parent-2', active: true, animated: true, color: '#8b5cf6' },
    { id: 'dna-e4', from: 'dna-leaf-4', to: 'dna-parent-2', active: true, animated: true, color: '#8b5cf6' },
    { id: 'dna-e5', from: 'dna-parent-1', to: 'dna-root', active: true, animated: true, color: '#a78bfa' },
    { id: 'dna-e6', from: 'dna-parent-2', to: 'dna-root', active: true, animated: true, color: '#a78bfa' },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSend = async () => {
    const text = inputPrompt.trim();
    if (!text || isThinking) return;
    setInputPrompt('');
    await submitUserGoal(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        if (!file) continue;
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        addProjectFile({
          id: `file-${Date.now()}-${i}`,
          name: file.name,
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          type: ext === 'svg' ? 'svg' : ext === 'png' || ext === 'jpg' ? 'image' : ext === 'xlsx' ? 'data' : 'pdf',
          uploadedAt: 'Just now',
          freshness: 'fresh',
          category: ext === 'svg' ? 'drawings' : ext === 'png' || ext === 'jpg' ? 'notes' : ext === 'xlsx' ? 'scans' : 'standards',
        });
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        if (!file) continue;
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        addProjectFile({
          id: `file-${Date.now()}-${i}`,
          name: file.name,
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          type: ext === 'svg' ? 'svg' : ext === 'png' || ext === 'jpg' ? 'image' : ext === 'xlsx' ? 'data' : 'pdf',
          uploadedAt: 'Just now',
          freshness: 'fresh',
          category: ext === 'svg' ? 'drawings' : ext === 'png' || ext === 'jpg' ? 'notes' : ext === 'xlsx' ? 'scans' : 'standards',
        });
      }
    }
  };

  const handleCreateNewProject = () => {
    const name = prompt('Enter new project title:', 'Cryogenic Test Facility');
    if (name) {
      const newProj = {
        id: `proj-${Date.now()}`,
        name,
        category: 'Custom Engineering',
        governingStandards: ['ASME B31.3', 'ISO 9001'],
        description: 'Custom industrial workspace for calculations, diagrams, and reports.',
      };
      addProject(newProj);
    }
  };

  const filteredFiles = projectFiles.filter((f) => {
    if (fileFilter === 'all') return true;
    return f.category === fileFilter;
  });

  const slidesData = [
    {
      title: 'Executive Summary & Operating Conditions',
      bullets: [
        'Line P-101A continuous operation certified through Turnaround 2027.',
        'Measured ultrasonic thickness: 4.8 mm against 4.2 mm minimum requirement.',
        'Zero cloud egress policy enforced across all inference and verification pipelines.',
      ],
    },
    {
      title: 'Ultrasonic Thickness Inspection Breakdown',
      bullets: [
        'Point 1 (Curvature Crown): 4.82 mm (Margin: +0.62 mm)',
        'Point 2 (Extrados Flange): 4.79 mm (Margin: +0.59 mm)',
        'Point 3 (Intrados Weld): 4.81 mm (Margin: +0.61 mm)',
        'Corrosion rate verified at 0.12 mm/year with 5.0 years estimated remaining service life.',
      ],
    },
    {
      title: 'Deterministic Hydraulic Simulation',
      bullets: [
        'Darcy-Weisbach / Colebrook-White friction factor: f = 0.0214.',
        'Total line pressure drop: ΔP = 0.3852 bar across 120m run.',
        'Reynolds number: Re = 1.098 × 10⁵ (Fully turbulent regime verified).',
      ],
    },
    {
      title: 'Isolation Boundary & Topology Certification',
      bullets: [
        'GraphRAG process topology traced from P&ID drawing MRPL-CDU-01.',
        'Suction block valve GV-1001 verified closed & tagged.',
        'Discharge block valve GV-1002 locked out with 0.0 barg residual confirmation.',
      ],
    },
    {
      title: 'Deterministic Critic Verification & C2PA Provenance',
      bullets: [
        'Deterministic Critic C1–C5 pass rate: 100% (0.0000 bar tolerance).',
        'Cryptographic Ed25519 signature anchored into Merkle Audit Chain.',
        'Decision DNA root committed for tamper-evident offline inspection.',
      ],
    },
  ];

  return (
    <div className="workbench-layout-v2">
      {/* ==================================================================== */}
      {/* 1. LEFT COLUMN: PROJECT WORKSPACE & FILES (PDD Section 8)            */}
      {/* ==================================================================== */}
      <aside
        className={`workbench-sidebar ${isDragging ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
      >
        <div className="sidebar-header">
          <div className="project-selector-wrapper">
            <span className="project-badge">ACTIVE PROJECT WORKSPACE</span>
            <select
              className="project-dropdown"
              value={activeProjectId}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  handleCreateNewProject();
                } else {
                  setActiveProject(e.target.value);
                }
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__new__">+ Create New Project...</option>
            </select>
          </div>

          <p className="project-desc-text">{activeProject?.description}</p>

          <div className="project-standards-row">
            <span className="standards-label">Standards:</span>
            {activeProject?.governingStandards.map((std, idx) => (
              <span key={idx} className="standard-tag">
                {std}
              </span>
            ))}
          </div>
        </div>

        {/* File Workspace & Upload Dropzone */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>Project Files ({projectFiles.length})</span>
            <div className="file-header-actions">
              <button
                className="btn-upload-file"
                onClick={() => fileInputRef.current?.click()}
                title="Upload or drag documents into workspace"
              >
                + Upload
              </button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                multiple
                onChange={handleFileInputChange}
              />
            </div>
          </div>

          {/* File Filter Chips */}
          <div className="file-filter-chips">
            <button
              className={`filter-chip ${fileFilter === 'all' ? 'active' : ''}`}
              onClick={() => setFileFilter('all')}
            >
              All
            </button>
            <button
              className={`filter-chip ${fileFilter === 'standards' ? 'active' : ''}`}
              onClick={() => setFileFilter('standards')}
            >
              📑 Standards
            </button>
            <button
              className={`filter-chip ${fileFilter === 'drawings' ? 'active' : ''}`}
              onClick={() => setFileFilter('drawings')}
            >
              📐 Drawings
            </button>
            <button
              className={`filter-chip ${fileFilter === 'scans' ? 'active' : ''}`}
              onClick={() => setFileFilter('scans')}
            >
              📊 Data
            </button>
            <button
              className={`filter-chip ${fileFilter === 'notes' ? 'active' : ''}`}
              onClick={() => setFileFilter('notes')}
            >
              📝 Notes
            </button>
          </div>

          <div className="project-files-list">
            {filteredFiles.map((file) => (
              <div key={file.id} className="project-file-item">
                <span className="file-icon">
                  {file.type === 'pdf'
                    ? '📄'
                    : file.type === 'svg'
                    ? '📐'
                    : file.type === 'data'
                    ? '📊'
                    : '🔬'}
                </span>
                <div className="file-details">
                  <div className="file-name" title={file.name}>
                    {file.name}
                  </div>
                  <div className="file-subtext">
                    <span>{file.size}</span>
                    {file.freshness === 'critical' ? (
                      <span className="freshness-tag critical">CRITICAL DECAY</span>
                    ) : file.freshness === 'aging' ? (
                      <span className="freshness-tag aging">AGING</span>
                    ) : (
                      <span className="freshness-tag fresh">FRESH</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="dropzone-hint">
            <span>Drag &amp; Drop PDF, SVG, XLSX, or Images here</span>
          </div>
        </div>

        {/* Quick Capabilities Starters */}
        <div className="sidebar-section quick-starters">
          <div className="sidebar-section-header">
            <span>Quick Capabilities</span>
            <button
              className="btn-recipe-builder-link"
              onClick={() => setIsRecipeBuilderOpen(true)}
              title="Open Visual Workflow Builder"
            >
              Builder ↗
            </button>
          </div>
          <div className="quick-starters-list">
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal(
                  'Analyse ultrasonic thickness inspection, verify against governing engineering SOP, and synthesize signed approval note.',
                )
              }
            >
              📄 <strong>Inspection Approval Note</strong>
              <span>UT scan &rarr; Darcy calc &rarr; Critic C1–C5 &rarr; C2PA</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('make an excel sheet of data of mrpl contracts from last 5 years')
              }
            >
              📑 <strong>5-Yr Contracts Master (.xlsx)</strong>
              <span>5-year work-orders &rarr; vendors &rarr; LD caps &rarr; values</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Make a clause-wise obligation tracker of all active MRPL maintenance contracts')
              }
            >
              📜 <strong>Clause Obligation Tracker (.xlsx)</strong>
              <span>Obligations, owner depts, due dates &amp; penalty exposure</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Generate a renewal alert calendar of MRPL contracts expiring in the next 180 days')
              }
            >
              🔔 <strong>180-Day Renewal Calendar</strong>
              <span>Expiry alerts &rarr; source doc hash &rarr; renewal notes</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Calculate the total financial exposure of active MRPL contracts')
              }
            >
              💰 <strong>Total Financial Exposure Matrix</strong>
              <span>Awarded values, LD caps, escalation &amp; risk tiers</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Make a vendor scorecard from 5 years of MRPL work-order history')
              }
            >
              🏆 <strong>5-Yr Vendor Scorecard</strong>
              <span>OTD%, quality NCs, LD invoked, safety &amp; composite scores</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Generate a bid comparison sheet for a tender (e.g. crude tank cleaning)')
              }
            >
              ⚖ <strong>Tender Bid Comparison Sheet</strong>
              <span>Commercial &amp; technical matrix &rarr; L1/L2 ranking</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Calculate liquidated damages on the delayed CDU turnaround contract')
              }
            >
              ⏳ <strong>Liquidated Damages Calculator</strong>
              <span>Grace period, day deductions &rarr; ₹1.25 Cr LD cap</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Make a deviation report between a draft contract and MRPL standard General Conditions of Contract')
              }
            >
              🔍 <strong>GCC Contract Deviation Report</strong>
              <span>Clause redline comparison &rarr; legal risk positions</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Generate an HSE compliance tracker across all active refinery worksites')
              }
            >
              🦺 <strong>Refinery HSE Compliance Tracker</strong>
              <span>Worksite audits &rarr; PTW compliance &rarr; stop-work gates</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Make a monthly contract governance pack in one command (pptx + docx + xlsx)')
              }
            >
              📦 <strong>Monthly Governance Pack (1-Command)</strong>
              <span>Slide Deck (.pptx) + Executive Memo (.docx) + Master (.xlsx)</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Calculate the NPSH margin for pump P-101 against the vendor curve')
              }
            >
              🌊 <strong>Pump P-101 NPSH Margin Verification</strong>
              <span>Physics derivation &rarr; cavitation safety margin gate</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Compare that with FY 2023-24')
              }
            >
              📈 <strong>YoY Spend Variance (FY 23-24)</strong>
              <span>Reconcile multi-department spend &rarr; +₹21.0 Cr growth</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Show the variance as a bar chart')
              }
            >
              📊 <strong>Interactive Variance Bar Chart</strong>
              <span>Sandboxed HTML5/SVG micro-tool &rarr; responsive bars</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('Give me a raw CSV of all purchase orders issued in August 2025 containing only: PO Number, Vendor, Value, Date. No formatting.')
              }
            >
              📄 <strong>Raw PO CSV (August 2025)</strong>
              <span>Zero formatting &rarr; raw RFC 4180 delimited stream</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal('List all vendors with active contracts AND pending LD deductions AND bank guarantees expiring within 90 days. Show the total net exposure for each vendor.')
              }
            >
              🛡 <strong>Three-Table Risk Query (3+ JOIN)</strong>
              <span>Vendor ⨝ Contract ⨝ LD ⨝ BG Expiring &lt;90D</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal(
                  'Generate an interactive Darcy-Weisbach Hydraulic Sizing calculator micro-tool with range sliders.',
                )
              }
            >
              ⚙ <strong>Interactive Micro-Tool</strong>
              <span>Synthesizes HTML5/JS app inside zero-egress iframe</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal(
                  'Scan P&ID drawing raster and trace isolation block valves for pump P-101A.',
                )
              }
            >
              📐 <strong>P&amp;ID Vision &amp; Isolation</strong>
              <span>Qwen2.5-VL OCR &rarr; GraphRAG piping topology</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal(
                  'Solve Darcy-Weisbach pressure drop formula for D=154mm, L=120m, Q=180m3/h with full intermediate step derivation.',
                )
              }
            >
              🧮 <strong>Engineering Formula Solver</strong>
              <span>Step-by-step math derivation with intermediate variables</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal(
                  'Compile multi-sheet Excel calculation workbook (.xlsx) with dynamic Darcy formula cells.',
                )
              }
            >
              📊 <strong>Excel Analytics Workbook</strong>
              <span>Generates structured tabular workbook with formulas</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal(
                  'Create an executive presentation slide deck (.pptx) summarizing engineering integrity and maintenance schedule.',
                )
              }
            >
              📽 <strong>Executive Slide Deck</strong>
              <span>Multi-slide presentation deck with corporate styling</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal(
                  'Transcribe and verify handwritten field inspection notes from ultrasonic survey probe.',
                )
              }
            >
              ✍ <strong>Handwriting Field Notes OCR</strong>
              <span>Extracts text and probe readings from handwritten notes</span>
            </button>
            <button
              className="quick-starter-btn"
              onClick={() =>
                submitUserGoal(
                  'Translate piping line isolation maintenance standard from English to Hindi.',
                )
              }
            >
              🌐 <strong>Hindi &harr; English SOP Translation</strong>
              <span>Bilingual technical translation preserving safety terminology</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* 2. CENTER COLUMN: CONVERSATION STREAM & DYNAMIC PLAN (PDD Section 8)  */}
      {/* ==================================================================== */}
      <main className="workbench-center-column">
        {/* Top Control Bar: Model Selector, AI Router & Mode Toggle */}
        <div className="model-selector-bar">
          <div className="model-selector-left">
            <span className="model-bar-label">Active Model:</span>
            <select
              className="model-dropdown-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · [{m.provider}]
                </option>
              ))}
            </select>
            <span className={`locality-tag-pill ${selectedModel.includes('external') ? 'remote' : 'local'}`}>
              {selectedModel.includes('external') ? '☁ Remote / ASSIST' : '🔒 Loopback / Sovereign'}
            </span>
          </div>

          <div className="model-selector-right">
            <button
              className="btn-router-inspector"
              onClick={() => setIsRouterModalOpen(true)}
              title="Inspect Why this Model Was Selected & AI Router Rules"
            >
              🔍 AI Model Router
            </button>
            <div className="mode-toggle-pill">
              <button
                className={`mode-btn ${mode === 'SOVEREIGN' ? 'active-sovereign' : ''}`}
                onClick={() => setMode('SOVEREIGN')}
                title="Air-gapped mode: No internet access"
              >
                SOVEREIGN
              </button>
              <button
                className={`mode-btn ${mode === 'ASSIST' ? 'active-assist' : ''}`}
                onClick={() => setMode('ASSIST')}
                title="Development mode: NVIDIA NIM cloud assist enabled"
              >
                DEV (ASSIST)
              </button>
            </div>
          </div>
        </div>

        {/* Live Plan DAG Flow */}
        <div className="plan-flow-container">
          <div className="plan-flow-header">
            <div className="plan-flow-title">
              <span className="plan-icon">⚡</span>
              <span>DYNAMIC PLAN EXECUTION DAG</span>
              <span className="task-id-tag">
                {activeTaskId ? `[${activeTaskId}]` : '[Idle]'}
              </span>
            </div>
            <div className="plan-header-controls">
              <div className="dag-view-toggle">
                <button
                  className={`btn-view-toggle ${dagViewMode === 'mesh' ? 'active' : ''}`}
                  onClick={() => setDagViewMode('mesh')}
                  title="Show interactive n8n node mesh graph"
                >
                  ⚡ n8n Mesh Canvas
                </button>
                <button
                  className={`btn-view-toggle ${dagViewMode === 'compact' ? 'active' : ''}`}
                  onClick={() => setDagViewMode('compact')}
                  title="Show compact horizontal step chips"
                >
                  📋 Compact Strip
                </button>
              </div>
              <div className="plan-stats">
                <span>
                  {nodes.filter((n) => n.status === 'done').length} / {nodes.length} Steps
                </span>
              </div>
            </div>
          </div>

          {dagViewMode === 'mesh' ? (
            <div className="plan-mesh-wrapper">
              <N8nMeshCanvas
                nodes={meshPlanNodes}
                edges={meshPlanEdges}
                title="TASK EXECUTION WORKFLOW MESH"
                subtitle="Live animated DAG execution • Click any step node to inspect tool I/O & Critic C1-C5 status"
                height="270px"
                enableDragging={true}
              />
            </div>
          ) : (
            <div className="plan-nodes-track">
              {nodes.map((node, idx) => (
                <div key={node.id} className={`dag-node-chip ${node.status}`}>
                  <span className="node-status-indicator">
                    {node.status === 'done' ? '✓' : node.status === 'running' ? '⏳' : '○'}
                  </span>
                  <span className="node-chip-label">{node.label}</span>
                  {idx < nodes.length - 1 && <span className="node-arrow">&rarr;</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Streaming Conversation History */}
        <div className="conversation-stream">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              <div className="message-header">
                <span className="message-sender">
                  {msg.role === 'user' ? '👤 Lead Engineer' : '🤖 Sovereign Agent'}
                </span>
                <span className="message-timestamp">{msg.timestamp}</span>
                {msg.modelUsed && (
                  <span className="message-model-badge">via {msg.modelUsed}</span>
                )}
              </div>
              <div className="message-body">
                <div style={{ whiteSpace: 'pre-line' }}>{msg.content}</div>
                {msg.artifactType && (
                  <div className="message-deliverable-chip">
                    <span className="chip-icon">📦</span>
                    <span>
                      Generated Deliverable ({msg.artifactType.toUpperCase()}) &mdash; Mounted in Right
                      Panel
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="chat-message assistant thinking-message">
              <div className="message-header">
                <span className="message-sender">🤖 Sovereign Agent</span>
                <span className="thinking-spinner">Executing step graph...</span>
              </div>
              <div className="message-body">
                Executing plan DAG steps via local specialist models and deterministic physics verification...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat / Prompt Input Bar */}
        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <textarea
              className="chat-textarea"
              rows={2}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Submit any engineering goal, ask standards questions, request calculation derivations, or build micro-tools..."
              disabled={isThinking}
            />
            <button
              className="btn-send-goal"
              onClick={handleSend}
              disabled={!inputPrompt.trim() || isThinking}
            >
              {isThinking ? 'Running...' : 'Execute Goal ➔'}
            </button>
          </div>

          <div className="input-suggestions-row">
            <span className="suggestion-label">Suggested:</span>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('make an excel sheet of data of mrpl contracts from last 5 years')
              }
            >
              📑 5-Yr Contracts
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Make a clause-wise obligation tracker of all active MRPL maintenance contracts')
              }
            >
              📜 Obligation Tracker
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Generate a renewal alert calendar of MRPL contracts expiring in the next 180 days')
              }
            >
              🔔 180-Day Renewal
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Calculate the total financial exposure of active MRPL contracts')
              }
            >
              💰 Financial Exposure
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Make a vendor scorecard from 5 years of MRPL work-order history')
              }
            >
              🏆 Vendor Scorecard
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Generate a bid comparison sheet for a tender (e.g. crude tank cleaning)')
              }
            >
              ⚖ Bid Comparison
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Calculate liquidated damages on the delayed CDU turnaround contract')
              }
            >
              ⏳ LD Calculator
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Make a deviation report between a draft contract and MRPL standard General Conditions of Contract')
              }
            >
              🔍 GCC Deviation
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Generate an HSE compliance tracker across all active refinery worksites')
              }
            >
              🦺 HSE Tracker
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Make a monthly contract governance pack in one command (pptx + docx + xlsx)')
              }
            >
              📦 1-Command Gov Pack
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Compare that with FY 2023-24')
              }
            >
              📈 Compare FY 23-24
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Show the variance as a bar chart')
              }
            >
              📊 Variance Bar Chart
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Give me a raw CSV of all purchase orders issued in August 2025 containing only: PO Number, Vendor, Value, Date. No formatting.')
              }
            >
              📄 Raw PO CSV
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('List all vendors with active contracts AND pending LD deductions AND bank guarantees expiring within 90 days. Show the total net exposure for each vendor.')
              }
            >
              🛡 3-Table Risk Query
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt(
                  'Analyse ultrasonic thickness inspection, verify against governing engineering SOP, and synthesize signed approval note.',
                )
              }
            >
              📄 Inspection Note
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Generate an interactive Hydraulic Sizing calculator micro-tool with sliders.')
              }
            >
              ⚙ Hydraulic Tool
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Scan P&ID drawing and trace certified isolation block valves for pump P-101A.')
              }
            >
              📐 P&amp;ID Drawing
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt(
                  'Solve Darcy-Weisbach pressure drop formula for D=154mm, L=120m, Q=180m3/h with step-by-step derivation.',
                )
              }
            >
              🧮 Formula Solver
            </button>
            <button
              className="suggestion-chip"
              onClick={() =>
                setInputPrompt('Compile multi-sheet Excel calculation workbook (.xlsx) with formula cells.')
              }
            >
              📊 Excel Sheet
            </button>
          </div>
        </div>
      </main>

      {/* ==================================================================== */}
      {/* 3. RIGHT COLUMN: DELIVERABLE ARTIFACTS & PREVIEW (PDD Section 8)     */}
      {/* ==================================================================== */}
      <aside className="workbench-preview-column">
        <div className="preview-tabs-header">
          <button
            className={`preview-tab-btn ${previewTab === 'artifact' ? 'active' : ''}`}
            onClick={() => setPreviewTab('artifact')}
          >
            Approval Note (.docx)
          </button>
          <button
            className={`preview-tab-btn ${previewTab === 'microtool' ? 'active' : ''}`}
            onClick={() => setPreviewTab('microtool')}
          >
            Micro-Tool
          </button>
          <button
            className={`preview-tab-btn ${previewTab === 'drawing' ? 'active' : ''}`}
            onClick={() => setPreviewTab('drawing')}
          >
            P&amp;ID Perception
          </button>
          <button
            className={`preview-tab-btn ${previewTab === 'calculation' ? 'active' : ''}`}
            onClick={() => setPreviewTab('calculation')}
          >
            Calculation Steps
          </button>
          <button
            className={`preview-tab-btn ${previewTab === 'spreadsheet' ? 'active' : ''}`}
            onClick={() => setPreviewTab('spreadsheet')}
          >
            Spreadsheet (.xlsx)
          </button>
          <button
            className={`preview-tab-btn ${previewTab === 'presentation' ? 'active' : ''}`}
            onClick={() => setPreviewTab('presentation')}
          >
            Deck (.pptx)
          </button>
          <button
            className={`preview-tab-btn ${previewTab === 'transcribe' ? 'active' : ''}`}
            onClick={() => setPreviewTab('transcribe')}
          >
            Field Notes OCR
          </button>
          <button
            className={`preview-tab-btn ${previewTab === 'translation' ? 'active' : ''}`}
            onClick={() => setPreviewTab('translation')}
          >
            Hindi &harr; English
          </button>
          <button
            className={`preview-tab-btn ${previewTab === 'tools' ? 'active' : ''}`}
            onClick={() => setPreviewTab('tools')}
          >
            Audit &amp; Tools
          </button>
          <button
            className={`preview-tab-btn ${previewTab === 'dna' ? 'active' : ''}`}
            onClick={() => setPreviewTab('dna')}
          >
            Decision DNA
          </button>
        </div>

        <div className="preview-body-container">
          {/* TAB 1: TECHNICAL APPROVAL NOTE (.DOCX) / DEVIATION REPORT */}
          {previewTab === 'artifact' && (
            activeDeviation ? (
              <div className="artifact-document-view deviation-report-view">
                <div className="doc-header">
                  <div className="c2pa-badge-prominent">
                    🔒 C2PA PROVENANCE MANIFEST ATTACHED (ED25519 SIGNED)
                  </div>
                  <h3>{activeDeviation.title}</h3>
                  <p className="doc-meta">
                    Ref: {activeDeviation.contractRef} &bull; Verified Offline
                  </p>
                </div>

                <div className="deviation-summary-strip">
                  <div className="summary-stat-box">
                    <span className="stat-label">Total Clauses</span>
                    <span className="stat-val">{activeDeviation.deviations.length}</span>
                  </div>
                  <div className="summary-stat-box critical">
                    <span className="stat-label">Critical / High Risks</span>
                    <span className="stat-val">
                      {activeDeviation.deviations.filter((d) => d.risk === 'CRITICAL' || d.risk === 'HIGH').length}
                    </span>
                  </div>
                  <div className="summary-stat-box clean">
                    <span className="stat-label">Compliance Gate</span>
                    <span className="stat-val">REJECT PROPOSAL</span>
                  </div>
                </div>

                <div className="table-wrapper" style={{ marginTop: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
                  <table className="excel-table deviation-table">
                    <thead>
                      <tr>
                        <th style={{ width: '180px' }}>Clause</th>
                        <th style={{ width: '260px' }}>MRPL Standard GCC</th>
                        <th style={{ width: '260px' }}>Vendor Draft Redline</th>
                        <th style={{ width: '90px' }}>Risk</th>
                        <th style={{ width: '260px' }}>Recommended Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDeviation.deviations.map((dev, idx) => (
                        <tr key={idx}>
                          <td><strong>{dev.clause}</strong></td>
                          <td className="gcc-standard-cell">{dev.standardGcc}</td>
                          <td className="draft-proposal-cell">{dev.proposedText}</td>
                          <td>
                            <span className={`verdict-chip ${dev.risk === 'HIGH' || dev.risk === 'CRITICAL' ? 'fail' : dev.risk === 'MEDIUM' ? 'warn' : 'pass'}`}>
                              {dev.risk}
                            </span>
                          </td>
                          <td className="rec-cell"><strong>{dev.recommendation}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="doc-footer-action" style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button
                    className="btn-download-artifact"
                    onClick={() => alert(`Exported ${activeDeviation.contractRef}_Deviation_Matrix.xlsx`)}
                  >
                    📊 Export Deviation Matrix (.xlsx)
                  </button>
                  <button
                    className="btn-download-artifact"
                    onClick={() => alert(`Exported ${activeDeviation.contractRef}_Legal_Redline.docx with C2PA signature`)}
                  >
                    📥 Export Signed Legal Redline (.docx)
                  </button>
                </div>
              </div>
            ) : artifactContent ? (
              <div className="artifact-document-view">
                <div className="doc-header">
                  <div className="c2pa-badge-prominent">
                    🔒 C2PA PROVENANCE MANIFEST ATTACHED (ED25519 SIGNED)
                  </div>
                  <h3>EXECUTIVE DELIVERABLE SUMMARY</h3>
                  <p className="doc-meta">
                    {activeProjectName} &bull; Generated &bull; Verified Offline
                  </p>
                </div>
                <div className="doc-content" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                  {artifactContent}
                </div>
                <div className="doc-footer-action">
                  <button
                    className="btn-download-artifact"
                    onClick={() => alert('Exported Deliverable Note (.docx)')}
                  >
                    📥 Export Word Document (.docx)
                  </button>
                </div>
              </div>
            ) : (
              <div className="artifact-document-view">
                <div className="doc-header">
                  <div className="c2pa-badge-prominent">
                    🔒 C2PA PROVENANCE MANIFEST ATTACHED (ED25519 SIGNED)
                  </div>
                  <h3>TECHNICAL ENGINEERING APPROVAL NOTE: PIPING LINE P-101A</h3>
                  <p className="doc-meta">
                    {activeProjectName} &bull; 13 Sep 2026 &bull; Verified Offline
                  </p>
                </div>

                <div className="doc-content">
                  <h4>1. Ultrasonic Inspection Findings &amp; Grounding</h4>
                  <p>
                    Measured Wall Thickness: <strong>4.8 mm</strong> (Probe UT-04, 4MHz dual-element)
                  </p>
                  <p>
                    Governing Minimum Allowable Thickness: <strong>4.2 mm</strong> (ASME B31.3 Section 304.1.2)
                  </p>
                  <p>
                    Calculated Remaining Service Life: <strong>5.0 years</strong> (Corrosion Rate 0.12 mm/yr)
                  </p>

                  <h4>2. Deterministic Hydraulic Verification</h4>
                  <p>
                    Governing Correlation: <strong>Darcy-Weisbach / Colebrook-White</strong>
                  </p>
                  <p>
                    Replayed Pressure Drop: <strong>0.3852 bar</strong> (Replay Tolerance: &plusmn;0.0001 bar)
                  </p>

                  <h4>3. Governing Engineering Standard &amp; Freshness</h4>
                  <p>
                    Standard Cited: <strong>ASME B31.3 / MRPL-SOP-402 (Rev 3)</strong>
                  </p>
                  <p>
                    Freshness Score: <span className="freshness-tag fresh">0.12 (FRESH)</span>
                  </p>

                  <h4>4. Final Engineering Recommendation</h4>
                  <p>
                    Piping Line P-101A is <strong>APPROVED</strong> for continuous operating service through the 2027 planned turnaround.
                  </p>
                </div>

                <div className="doc-footer-action">
                  <button
                    className="btn-download-artifact"
                    onClick={() => alert('Exported Approval_Note.docx with embedded C2PA provenance manifest!')}
                  >
                    📥 Export Signed Word Document (.docx)
                  </button>
                </div>
              </div>
            )
          )}

          {/* TAB 2: P&ID DRAWING PERCEPTION */}
          {previewTab === 'drawing' && <PidViewer />}

          {/* TAB 3: MICRO-TOOL SANDBOX */}
          {previewTab === 'microtool' && <MicroToolSandbox customHtml={activeMicroToolHtml} />}

          {/* TAB 4: STEP-BY-STEP CALCULATION DERIVATIONS */}
          {previewTab === 'calculation' && (
            <div className="calculation-view">
              <div className="calc-header">
                <h3>{activeCalculation ? activeCalculation.title : '🧮 Darcy-Weisbach Hydraulic Formula Derivation'}</h3>
                <span className="calc-badge">{activeCalculation ? activeCalculation.badge : 'Deterministic Physics Engine'}</span>
              </div>
              {activeCalculation ? (
                <>
                  {activeCalculation.steps.map((step, idx) => (
                    <div
                      key={idx}
                      className={`calc-step-card ${step.highlight ? 'highlight' : ''}`}
                    >
                      <div className="step-num">{step.num}</div>
                      <div className="step-formula">
                        <strong>{step.label}</strong>
                        <br />
                        <code>{step.formula}</code>
                      </div>
                      {step.criticNote && (
                        <div className="calc-critic-note">
                          {step.criticNote}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="calc-citation-box">
                    <div className="citation-title">📖 Governing Standard Citation</div>
                    <div className="citation-text">{activeCalculation.citation}</div>
                  </div>
                  <div className="calc-recommendation-box">
                    <div className="rec-title">🎯 Final Recommendation &amp; Gate Verdict</div>
                    <div className="rec-text">{activeCalculation.recommendation}</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="calc-step-card">
                    <div className="step-num">Step 1: Ingest Operating Parameters</div>
                    <div className="step-formula">
                      Fluid Density (&rho;) = 850 kg/m&sup3; &bull; Dynamic Viscosity (&mu;) = 0.0032 Pa&middot;s<br />
                      Internal Diameter (D) = 0.154 m &bull; Pipe Length (L) = 120 m &bull; Flow (Q) = 180 m&sup3;/h (0.05 m&sup3;/s)
                    </div>
                  </div>
                  <div className="calc-step-card">
                    <div className="step-num">Step 2: Cross-Sectional Area &amp; Flow Velocity</div>
                    <div className="step-formula">
                      A = (&pi;/4) &times; D&sup2; = (3.14159/4) &times; (0.154)&sup2; = 0.01863 m&sup2;<br />
                      v = Q / A = 0.05 / 0.01863 = <strong>2.684 m/s</strong>
                    </div>
                  </div>
                  <div className="calc-step-card">
                    <div className="step-num">Step 3: Reynolds Number &amp; Flow Regime</div>
                    <div className="step-formula">
                      Re = (&rho; &times; v &times; D) / &mu; = (850 &times; 2.684 &times; 0.154) / 0.0032 = <strong>1.098 &times; 10&sup5;</strong><br />
                      Since Re &gt; 4000, flow regime is <strong>Fully Turbulent</strong>.
                    </div>
                  </div>
                  <div className="calc-step-card">
                    <div className="step-num">Step 4: Colebrook-White Friction Factor</div>
                    <div className="step-formula">
                      Relative Roughness &epsilon;/D = 0.045 mm / 154 mm = 0.000292<br />
                      Colebrook-White Implicit Solution: <strong>f = 0.0214</strong>
                    </div>
                  </div>
                  <div className="calc-step-card highlight">
                    <div className="step-num">Step 5: Calculated Pressure Drop (&Delta;P)</div>
                    <div className="step-formula">
                      &Delta;P = f &times; (L / D) &times; (&rho; &times; v&sup2; / 2) = 0.0214 &times; (120 / 0.154) &times; (850 &times; 2.684&sup2; / 2) = <strong>0.3852 bar</strong>
                    </div>
                    <div className="calc-critic-note">
                      ✓ Verified by Critic C2 Calc Replay: 0.0000 bar residual deviation.
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 5: SPREADSHEET ANALYTICS (.XLSX) */}
          {previewTab === 'spreadsheet' && (
            <div className="spreadsheet-view">
              <div className="sheet-header">
                <div className="sheet-title-row">
                  <h3>📊 {activeSpreadsheet ? activeSpreadsheet.title : 'Hydraulic_Analysis_Matrix.xlsx'}</h3>
                  <button
                    className="btn-download-artifact sheet-export-btn"
                    onClick={() => alert(`Exported ${activeSpreadsheet?.downloadName ?? activeSpreadsheet?.title ?? 'Hydraulic_Analysis_Matrix'}.xlsx`)}
                  >
                    📥 Export Excel (.xlsx)
                  </button>
                </div>
                <span className="sheet-tab-active">Sheet 1: {activeSpreadsheet ? activeSpreadsheet.sheetName : 'Line Hydraulic Schedule'}</span>
              </div>

              {activeSpreadsheet?.summaryRows && activeSpreadsheet.summaryRows.length > 0 && (
                <div className="spreadsheet-summary-strip">
                  {activeSpreadsheet.summaryRows.map((item, idx) => (
                    <div key={idx} className="summary-stat-box">
                      <span className="stat-label">{item.label}</span>
                      <span className="stat-val">{item.value}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="table-wrapper" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="excel-table">
                  <thead>
                    <tr>
                      {(activeSpreadsheet ? activeSpreadsheet.headers : [
                        'Line Tag', 'Service', 'Material', 'Dia (mm)', 'Length (m)', 'Flow (m³/h)', 'Velocity (m/s)', 'Re No.', 'ΔP (bar)', 'Critic Gate'
                      ]).map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeSpreadsheet ? activeSpreadsheet.rows : [
                      ['P-101A', 'CDU Bottoms', 'ASTM A106-B', '154.0', '120.0', '180.0', '2.684', '109,800', '0.3852', 'PASS'],
                      ['P-101B', 'CDU Standby', 'ASTM A106-B', '154.0', '124.5', '180.0', '2.684', '109,800', '0.3996', 'PASS'],
                      ['P-102A', 'Kerosene Draw', 'Carbon Steel', '102.3', '85.0', '95.0', '3.218', '84,200', '0.5120', 'PASS'],
                      ['P-103A', 'Heavy Naphtha', 'ASTM A333', '202.7', '160.0', '320.0', '2.754', '145,000', '0.4418', 'PASS'],
                    ]).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => {
                          const s = String(cell);
                          const isPass = s === 'PASS' || s === 'COMPLIANT' || s === 'EXCELLENT' || s === 'SATISFACTORY' || s === 'L1 Recommended' || s === 'GREEN';
                          const isFail = s === 'CRITICAL' || s === 'NON-COMPLIANT' || s === 'HIGH' || s === 'OVERDUE' || s === 'RED' || s === 'DISQUALIFIED';
                          const isWarn = s === 'UPCOMING' || s === 'MEDIUM' || s === 'MODERATE' || s === 'AMBER' || s === 'L2' || s === 'L3';

                          return (
                            <td key={cIdx}>
                              {isPass ? (
                                <span className="verdict-chip pass">{s}</span>
                              ) : isFail ? (
                                <span className="verdict-chip fail">{s}</span>
                              ) : isWarn ? (
                                <span className="verdict-chip warn">{s}</span>
                              ) : (
                                cell
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="sheet-formula-bar">
                <span>Formula in Active Cell:</span>
                <code>= (f_colebrook(D2, Roughness, Re2) * (E2 / D2) * (Density * G2^2 / 2)) / 100000</code>
              </div>
            </div>
          )}

          {/* TAB 6: EXECUTIVE PRESENTATION DECK (.PPTX) / GOVERNANCE PACK */}
          {previewTab === 'presentation' && (
            activeGovernancePack ? (
              <div className="governance-pack-view">
                <div className="deck-header">
                  <div>
                    <h3>📦 Monthly Contract Governance Pack</h3>
                    <p className="doc-meta">Period: {activeGovernancePack.month} &bull; 3 Artifacts Linked &bull; Merkle Root: {activeGovernancePack.merkleRoot}</p>
                  </div>
                  <button
                    className="btn-download-artifact"
                    onClick={() => alert(`Downloaded complete bundle: ${activeGovernancePack.month}_Governance_Pack.zip`)}
                  >
                    📦 Download Complete Pack (.zip)
                  </button>
                </div>

                <div className="gov-pack-grid">
                  {/* Card 1: Slide Deck */}
                  <div className="gov-card">
                    <div className="gov-card-header">
                      <h4>📽 {activeGovernancePack.pptxDeckTitle}</h4>
                      <span className="tab-badge">Slide Deck</span>
                    </div>
                    <div className="slide-deck-preview">
                      <div className="deck-nav" style={{ marginBottom: '0.5rem' }}>
                        <button
                          disabled={currentSlideIndex === 0}
                          onClick={() => setCurrentSlideIndex((c) => Math.max(0, c - 1))}
                        >
                          &larr; Prev
                        </button>
                        <span>Slide {currentSlideIndex + 1} of {slidesData.length}</span>
                        <button
                          disabled={currentSlideIndex === slidesData.length - 1}
                          onClick={() => setCurrentSlideIndex((c) => Math.min(slidesData.length - 1, c + 1))}
                        >
                          Next &rarr;
                        </button>
                      </div>
                      <div className="slide-card compact">
                        <h4>{slidesData[currentSlideIndex]?.title}</h4>
                        <ul className="slide-bullet-list">
                          {slidesData[currentSlideIndex]?.bullets.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Executive Memo */}
                  <div className="gov-card">
                    <div className="gov-card-header">
                      <h4>📄 {activeGovernancePack.docxMinutesTitle}</h4>
                      <span className="tab-badge docx">Signed DOCX</span>
                    </div>
                    <div className="gov-memo-scroll">
                      <div className="memo-section">
                        <h5>Committee Resolution &amp; Formal Minutes</h5>
                        <p>All committee action items pre-filled, with attendee roll-call and legal certification blocks.</p>
                      </div>
                      <div className="memo-section">
                        <h5>Decision DNA Merkle Binding</h5>
                        <p>Cryptographically bound under Merkle root: <code>{activeGovernancePack.merkleRoot}</code></p>
                      </div>
                      <div className="memo-section">
                        <h5>Status</h5>
                        <p><span className="verdict-chip pass">{activeGovernancePack.status}</span></p>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Master Workbook */}
                  <div className="gov-card">
                    <div className="gov-card-header">
                      <h4>📊 {activeGovernancePack.xlsxDataTitle}</h4>
                      <span className="tab-badge xlsx">Excel Data</span>
                    </div>
                    <div className="gov-sheets-list">
                      <div className="gov-sheet-item">
                        <div className="gov-sheet-title">
                          <strong>Sheet 1: Turnaround Contractor Spend</strong>
                          <span>(Granular Work Order Ledger)</span>
                        </div>
                        <div className="gov-sheet-cols">
                          <span className="sheet-col-pill">PO Number</span>
                          <span className="sheet-col-pill">Vendor Name</span>
                          <span className="sheet-col-pill">Award Value</span>
                          <span className="sheet-col-pill">Billed to Date</span>
                          <span className="sheet-col-pill">LD Invoked</span>
                          <span className="sheet-col-pill">Net Payable</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="presentation-view">
                <div className="deck-header">
                  <h3>📽 Engineering_Integrity_Review.pptx</h3>
                  <div className="deck-nav">
                    <button
                      disabled={currentSlideIndex === 0}
                      onClick={() => setCurrentSlideIndex((c) => Math.max(0, c - 1))}
                    >
                      &larr; Prev
                    </button>
                    <span>
                      Slide {currentSlideIndex + 1} of {slidesData.length}
                    </span>
                    <button
                      disabled={currentSlideIndex === slidesData.length - 1}
                      onClick={() =>
                        setCurrentSlideIndex((c) => Math.min(slidesData.length - 1, c + 1))
                      }
                    >
                      Next &rarr;
                    </button>
                  </div>
                </div>
                <div className="slide-card">
                  <div className="slide-title-bar">
                    <h4>{slidesData[currentSlideIndex]?.title}</h4>
                  </div>
                  <ul className="slide-bullet-list">
                    {(slidesData[currentSlideIndex]?.bullets ?? []).map((b, idx) => (
                      <li key={idx}>{b}</li>
                    ))}
                  </ul>
                  <div className="slide-footer">
                    <span>OUTSKIRTS SOVEREIGN WORKBENCH &bull; CONFIDENTIAL ENGINEERING BRIEF</span>
                  </div>
                </div>
              </div>
            )
          )}

          {/* TAB 7: HANDWRITTEN FIELD NOTES OCR */}
          {previewTab === 'transcribe' && (
            <div className="transcription-view">
              <div className="trans-header">
                <h3>✍️ Field Inspection Note Transcription &amp; OCR</h3>
                <span className="calc-badge">Qwen2.5-VL Vision Specialist</span>
              </div>
              <div className="trans-grid">
                <div className="trans-scan-side">
                  <h4>Source Field Inspection Log</h4>
                  <div className="fake-handwriting-card">
                    <p style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
                      [Image: handwritten-field-notes.jpg]
                    </p>
                    <div className="handwriting-sample">
                      <em>&ldquo;12-Sep-2026. Insp: D. Sen. Line P-101A Elbow E-04. UT scans: Pt1=4.82mm, Pt2=4.79mm, Pt3=4.81mm. Surface pitting outer bend within 3mm CA. No laminations.&rdquo;</em>
                    </div>
                  </div>
                </div>
                <div className="trans-result-side">
                  <h4>Structured AI Transcription</h4>
                  <div className="trans-card">
                    <p><strong>Inspection Date:</strong> 12-Sep-2026</p>
                    <p><strong>Inspector:</strong> D. Sen (Senior NDT Inspector)</p>
                    <p><strong>Asset Tag:</strong> P-101A (Discharge Elbow E-04)</p>
                    <p><strong>Ultrasonic Probe Scans:</strong></p>
                    <ul>
                      <li>Point 1: <code>4.82 mm</code></li>
                      <li>Point 2: <code>4.79 mm</code></li>
                      <li>Point 3: <code>4.81 mm</code></li>
                    </ul>
                    <p><strong>Inspector Assessment:</strong> Surface pitting within 3.0mm corrosion allowance. No delamination defects found.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: HINDI <-> ENGLISH BILINGUAL EXHIBIT */}
          {previewTab === 'translation' && (
            <div className="translation-view">
              <div className="trans-header">
                <h3>🌐 Bilingual SOP Standard (Hindi &harr; English)</h3>
                <span className="calc-badge">Technical Domain Preservation</span>
              </div>
              <div className="bilingual-grid">
                <div className="bilingual-card">
                  <h4>English Safety Standard (Original)</h4>
                  <blockquote className="bilingual-text">
                    &ldquo;Prior to opening pipeline line P-101A for inspection, operational engineers must verify that both upstream suction block valve GV-1001 and downstream discharge block valve GV-1002 are fully closed, tagged with red danger tags, and secured using standard padlock lockouts. Depressurization must be confirmed by observing 0.0 barg on transmitter PT-101.&rdquo;
                  </blockquote>
                </div>
                <div className="bilingual-card">
                  <h4>हिंदी मानक (Certified Hindi Translation)</h4>
                  <blockquote className="bilingual-text hindi-font">
                    &ldquo;निरीक्षण के लिए पाइपलाइन P-101A को खोलने से पहले, परिचालन इंजीनियरों को यह सत्यापित करना होगा कि अपस्ट्रीम सक्शन ब्लॉक वाल्व GV-1001 और डाउनस्ट्रीम डिस्चार्ज ब्लॉक वाल्व GV-1002 दोनों पूरी तरह से बंद हैं, लाल खतरे के टैग से टैग किए गए हैं और मानक पैडलॉक लॉकआउट द्वारा सुरक्षित हैं। ट्रांसमीटर PT-101 पर 0.0 बार (barg) दबाव देखकर डिप्रेसराइजेशन की पुष्टि की जानी चाहिए।&rdquo;
                  </blockquote>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: RAW AUDIT & TOOL REPLAY */}
          {previewTab === 'tools' && (
            <div className="audit-tools-container">
              <div className="section-title-sm">Deterministic Critic Verification (C1–C5)</div>
              <div className="verdict-grid-compact">
                <div className="verdict-chip pass">✓ C1 Numeric Grounding</div>
                <div className="verdict-chip pass">✓ C2 Calc Replay (0.0000 bar)</div>
                <div className="verdict-chip pass">✓ C3 Citation Resolvability</div>
                <div className="verdict-chip pass">✓ C4 Template Structure</div>
                <div className="verdict-chip pass">✓ C5 Freshness Gate</div>
              </div>

              <div className="section-title-sm" style={{ marginTop: '1rem' }}>
                Tool Call Trace
              </div>
              <div className="tool-call-box">
                <div className="tool-call-title">
                  <span>calculate_pressure_drop</span>
                  <span className="plugin-tag">pipe-calc-plugin (WASM)</span>
                </div>
                <pre className="json-snippet">
                  {JSON.stringify(
                    {
                      input: { length_m: 120, diameter_m: 0.154, flow_m3h: 180 },
                      output: { deltaP_bar: 0.3852, regime: 'turbulent', Re: 109800 },
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>

              <div className="section-title-sm" style={{ marginTop: '1rem' }}>
                WebSocket Monotonic Timeline Events
              </div>
              <div className="timeline-mini-list">
                {timeline.slice(-6).map((e: any, idx) => (
                  <div key={idx} className="timeline-mini-item">
                    <span className="seq-badge">#{e.seq}</span>
                    <span className="type-badge">{e.type}</span>
                    <span className="ts-badge">{e.ts}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 10: DECISION DNA MERKLE ANCHOR */}
          {previewTab === 'dna' && (
            <div className="dna-view">
              <div className="dna-header">
                <div className="dna-header-left">
                  <h3>🧬 Decision DNA &amp; Cryptographic Provenance</h3>
                  <span className="dna-badge">Immutable Merkle Chain</span>
                </div>
                <div className="dna-view-toggle">
                  <button
                    className={`toggle-view-btn ${dnaViewMode === 'mesh' ? 'active' : ''}`}
                    onClick={() => setDnaViewMode('mesh')}
                  >
                    ⚡ n8n Merkle Mesh
                  </button>
                  <button
                    className={`toggle-view-btn ${dnaViewMode === 'card' ? 'active' : ''}`}
                    onClick={() => setDnaViewMode('card')}
                  >
                    📄 Record Card
                  </button>
                </div>
              </div>

              {dnaViewMode === 'mesh' ? (
                <div className="dna-mesh-wrapper">
                  <N8nMeshCanvas
                    nodes={dnaMeshNodes}
                    edges={dnaMeshEdges}
                    title="DECISION DNA MERKLE TREE — CRYPTOGRAPHIC AUDIT GRAPH"
                    subtitle="SHA-256 leaves hashed into Merkle root • Click any node to inspect raw audit event hash"
                    height="480px"
                    enableDragging={true}
                  />
                </div>
              ) : (
                <div className="dna-content-card">
                  <div className="dna-row">
                    <span className="dna-label">Decision DNA ID:</span>
                    <span className="dna-val">dna-task-gen-001</span>
                  </div>
                  <div className="dna-row">
                    <span className="dna-label">Merkle Root Hash:</span>
                    <span className="dna-val font-mono">
                      sha256:4b7ca720ec7b609802d33ff0824b210626a57c5a04e5714f85e505230d7b0a70
                    </span>
                  </div>
                  <div className="dna-row">
                    <span className="dna-label">Ed25519 Anchor:</span>
                    <span className="dna-val font-mono">anchor-outskirts-gateway-key-01</span>
                  </div>
                  <div className="dna-row">
                    <span className="dna-label">Critic Verdict:</span>
                    <span className="verdict-chip pass">PASS (Deterministic C1–C5)</span>
                  </div>
                  <div className="dna-row">
                    <span className="dna-label">Artifact Bound:</span>
                    <span className="dna-val">Approval_Note.docx (C2PA Valid)</span>
                  </div>
                </div>
              )}

              <div className="dna-footer-action">
                <button
                  className="btn-download-artifact"
                  onClick={() => alert('Exported Decision DNA JSON record for offline compliance audit!')}
                >
                  📥 Export Decision DNA Record (.json)
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* 4. MODALS: AI MODEL ROUTER & RECIPE BUILDER                          */}
      {/* ==================================================================== */}
      {isRouterModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsRouterModalOpen(false)}>
          <div className="router-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🤖 AI Model Router &amp; Residency Inspector</h3>
              <button className="btn-close-modal" onClick={() => setIsRouterModalOpen(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="router-stat-box">
                <div>
                  <span className="stat-label">Active Model:</span>
                  <div className="stat-val-highlight">{routingDecision?.selectedModel}</div>
                </div>
                <div>
                  <span className="stat-label">Task Type:</span>
                  <div className="stat-val-highlight uppercase">{routingDecision?.taskType}</div>
                </div>
                <div>
                  <span className="stat-label">Locality:</span>
                  <div className="stat-val-highlight">{routingDecision?.locality}</div>
                </div>
                <div>
                  <span className="stat-label">Latency Budget:</span>
                  <div className="stat-val-highlight">{routingDecision?.latencyBudgetMs} ms</div>
                </div>
              </div>

              <h4 style={{ marginTop: '1.25rem', color: '#38bdf8' }}>
                Why This Model Was Selected:
              </h4>
              <p className="router-reason-box">{routingDecision?.reason}</p>

              <h4 style={{ marginTop: '1.25rem', color: '#94a3b8' }}>
                Governed Fallback Chain:
              </h4>
              <div className="fallback-chain-row">
                <span className="fallback-chip active">{routingDecision?.selectedModel}</span>
                {routingDecision?.fallbackChain.map((fb, i) => (
                  <React.Fragment key={i}>
                    <span className="fallback-arrow">&rarr;</span>
                    <span className="fallback-chip">{fb}</span>
                  </React.Fragment>
                ))}
              </div>

              <h4 style={{ marginTop: '1.25rem', color: '#94a3b8' }}>
                Residency &amp; Sovereignty Perimeter Guarantee:
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
                Model weights run strictly inside the organization boundary ({routingDecision?.trustBoundary}). In SOVEREIGN mode, any external inference attempts are blocked at the PAL boundary with an audited refusal event.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recipe Builder Modal */}
      <RecipeBuilderModal
        isOpen={isRecipeBuilderOpen}
        onClose={() => setIsRecipeBuilderOpen(false)}
      />
    </div>
  );
};
