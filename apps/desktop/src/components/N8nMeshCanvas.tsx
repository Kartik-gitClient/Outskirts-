import React, { useState, useRef, useEffect, useCallback } from 'react';

export type NodeCategory =
  | 'trigger'
  | 'agent'
  | 'router'
  | 'perception'
  | 'rag'
  | 'tool'
  | 'critic'
  | 'provenance'
  | 'output'
  | 'equipment';

export type NodeStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'bypassed'
  | 'repaired'
  | 'cancelled';

export interface MeshNode {
  id: string;
  label: string;
  subtitle?: string;
  category: NodeCategory;
  status: NodeStatus;
  x: number;
  y: number;
  width?: number;
  height?: number;
  icon?: string;
  latencyMs?: number;
  modelOrTool?: string;
  inputData?: Record<string, unknown> | string;
  outputData?: Record<string, unknown> | string;
  criticVerdicts?: Array<{ name: string; passed: boolean; details: string }>;
  tags?: string[];
}

export interface MeshEdge {
  id: string;
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
  label?: string;
  color?: string;
  active?: boolean;
  animated?: boolean;
}

export interface N8nMeshCanvasProps {
  nodes: MeshNode[];
  edges: MeshEdge[];
  title?: string;
  subtitle?: string;
  selectedNodeId?: string | null;
  onSelectNode?: (node: MeshNode | null) => void;
  height?: number | string;
  enableDragging?: boolean;
  onNodesChange?: (nodes: MeshNode[]) => void;
}

const CATEGORY_STYLES: Record<
  NodeCategory,
  { bg: string; border: string; accent: string; icon: string }
> = {
  trigger: { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', accent: '#fbbf24', icon: '⚡' },
  agent: { bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7', accent: '#c084fc', icon: '🤖' },
  router: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', accent: '#60a5fa', icon: '🔀' },
  perception: { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', accent: '#f472b6', icon: '👁' },
  rag: { bg: 'rgba(14, 165, 233, 0.15)', border: '#0ea5e9', accent: '#38bdf8', icon: '📚' },
  tool: { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', accent: '#34d399', icon: '⚙' },
  critic: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', accent: '#f87171', icon: '🛡' },
  provenance: { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', accent: '#a78bfa', icon: '🧬' },
  output: { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', accent: '#4ade80', icon: '📦' },
  equipment: { bg: 'rgba(20, 184, 166, 0.15)', border: '#14b8a6', accent: '#2dd4bf', icon: '🏭' },
};

export const N8nMeshCanvas: React.FC<N8nMeshCanvasProps> = ({
  nodes: initialNodes,
  edges,
  title,
  subtitle,
  selectedNodeId: controlledSelectedId,
  onSelectNode,
  height = '520px',
  enableDragging = true,
  onNodesChange,
}) => {
  const [nodes, setNodes] = useState<MeshNode[]>(initialNodes);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1.0);
  const [isPanning, setIsPanning] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes]);

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    // Only pan if clicking on svg background
    if ((e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).id === 'mesh-canvas-bg') {
      setIsPanning(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    } else if (draggedNodeId && enableDragging) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;
      setNodes((prev) =>
        prev.map((n) =>
          n.id === draggedNodeId
            ? { ...n, x: Math.max(20, n.x + dx), y: Math.max(20, n.y + dy) }
            : n,
        ),
      );
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUpCanvas = () => {
    if (isPanning) setIsPanning(false);
    if (draggedNodeId) {
      setDraggedNodeId(null);
      if (onNodesChange) onNodesChange(nodes);
    }
  };

  const handleWheelCanvas = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((z) => Math.min(2.0, Math.max(0.4, z * zoomFactor)));
  };

  const handleNodeClick = (node: MeshNode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelectNode) onSelectNode(node);
    else setInternalSelectedId(node.id === selectedId ? null : node.id);
  };

  const handleNodeDragStart = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!enableDragging) return;
    setDraggedNodeId(nodeId);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const resetView = useCallback(() => {
    setPan({ x: 40, y: 40 });
    setZoom(1.0);
  }, []);

  const getNodePos = (id: string): { x: number; y: number; w: number; h: number } | null => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return null;
    const w = node.width ?? 220;
    const h = node.height ?? 88;
    return { x: node.x, y: node.y, w, h };
  };

  return (
    <div
      className="n8n-mesh-container"
      ref={containerRef}
      style={{ height, position: 'relative', overflow: 'hidden' }}
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMoveCanvas}
      onMouseUp={handleMouseUpCanvas}
      onWheel={handleWheelCanvas}
    >
      {/* Header Bar */}
      <div className="n8n-mesh-toolbar">
        <div className="toolbar-info">
          {title && <span className="toolbar-title">{title}</span>}
          {subtitle && <span className="toolbar-subtitle">{subtitle}</span>}
        </div>
        <div className="toolbar-actions">
          <button
            className="mesh-btn"
            onClick={() => setZoom((z) => Math.min(2.0, z * 1.15))}
            title="Zoom In"
          >
            +
          </button>
          <button
            className="mesh-btn"
            onClick={() => setZoom((z) => Math.max(0.4, z * 0.85))}
            title="Zoom Out"
          >
            -
          </button>
          <button className="mesh-btn" onClick={resetView} title="Reset View">
            ⛶ Reset
          </button>
          <span className="mesh-zoom-pill">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Main SVG Graph Surface */}
      <svg
        className="n8n-mesh-svg"
        style={{
          width: '100%',
          height: '100%',
          cursor: isPanning ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <defs>
          {/* Blueprint dot grid pattern */}
          <pattern id="n8n-dot-mesh" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="#2d3748" />
          </pattern>

          {/* Neon Glow Filter */}
          <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Connection Markers */}
          <marker
            id="mesh-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 8 5 L 0 9 z" fill="#38bdf8" />
          </marker>

          <marker
            id="mesh-arrow-done"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 8 5 L 0 9 z" fill="#10b981" />
          </marker>
        </defs>

        {/* Background Grid */}
        <rect id="mesh-canvas-bg" width="100%" height="100%" fill="#0a0e17" />
        <rect width="100%" height="100%" fill="url(#n8n-dot-mesh)" opacity="0.85" />

        {/* Transformed Graph Group */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Edges / Connections with Bezier Curves */}
          {edges.map((edge) => {
            const src = getNodePos(edge.from);
            const tgt = getNodePos(edge.to);
            if (!src || !tgt) return null;

            // Port coordinates: from right port to left port
            const x1 = src.x + src.w;
            const y1 = src.y + src.h / 2;
            const x2 = tgt.x;
            const y2 = tgt.y + tgt.h / 2;

            // Horizontal cubic bezier curve
            const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
            const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

            const isDone = edge.active ?? true;
            const edgeColor = edge.color ?? (isDone ? '#38bdf8' : '#4b5563');

            return (
              <g key={edge.id} className="mesh-edge-group">
                {/* Background Wide Stroke for Selection/Glow */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth="5"
                  opacity={isDone ? 0.25 : 0.1}
                  filter="url(#neon-glow)"
                />

                {/* Primary Connection Line */}
                <path
                  id={`edge-path-${edge.id}`}
                  d={pathD}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth="2.2"
                  strokeDasharray={isDone ? 'none' : '4,4'}
                  markerEnd={isDone ? 'url(#mesh-arrow-done)' : 'url(#mesh-arrow)'}
                />

                {/* Flowing animated pulse particle */}
                {(edge.animated ?? isDone) && (
                  <circle r="4" fill="#38bdf8" filter="url(#neon-glow)">
                    <animateMotion
                      dur="2.4s"
                      repeatCount="indefinite"
                      path={pathD}
                    />
                  </circle>
                )}

                {/* Optional Edge Label */}
                {edge.label && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 8}
                    fill="#94a3b8"
                    fontSize="10"
                    textAnchor="middle"
                    className="mesh-edge-label"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isSelected = node.id === selectedId;
            const w = node.width ?? 220;
            const h = node.height ?? 88;
            const style = CATEGORY_STYLES[node.category] ?? CATEGORY_STYLES.agent;

            const isRunning = node.status === 'running';
            const isDone = node.status === 'done';
            const isFailed = node.status === 'failed';

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className={`mesh-node-group ${isSelected ? 'selected' : ''}`}
                onClick={(e) => handleNodeClick(node, e)}
                onMouseDown={(e) => handleNodeDragStart(node.id, e)}
                style={{ cursor: enableDragging ? 'move' : 'pointer' }}
              >
                {/* Node Outer Glow when active or selected */}
                {isSelected && (
                  <rect
                    x="-6"
                    y="-6"
                    width={w + 12}
                    height={h + 12}
                    rx="16"
                    fill="none"
                    stroke={style.accent}
                    strokeWidth="2.5"
                    filter="url(#neon-glow)"
                    opacity="0.8"
                  />
                )}

                {isRunning && (
                  <rect
                    x="-4"
                    y="-4"
                    width={w + 8}
                    height={h + 8}
                    rx="14"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="6,4"
                    className="running-ring"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      values="0;20"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  </rect>
                )}

                {/* Node Card Background */}
                <rect
                  x="0"
                  y="0"
                  width={w}
                  height={h}
                  rx="10"
                  fill="#111827"
                  stroke={isSelected ? style.accent : isDone ? '#10b981' : isRunning ? '#38bdf8' : '#374151'}
                  strokeWidth={isSelected ? '2' : '1.2'}
                  filter="drop-shadow(0 4px 12px rgba(0,0,0,0.5))"
                />

                {/* Header Banner */}
                <path
                  d={`M 0 10 Q 0 0 10 0 L ${w - 10} 0 Q ${w} 0 ${w} 10 L ${w} 28 L 0 28 Z`}
                  fill={style.bg}
                />
                <line x1="0" y1="28" x2={w} y2="28" stroke={style.border} strokeWidth="1" opacity="0.4" />

                {/* Header Icon & Title */}
                <text x="10" y="19" fontSize="13">
                  {node.icon ?? style.icon}
                </text>
                <text
                  x="30"
                  y="18"
                  fill="#f3f4f6"
                  fontSize="11"
                  fontWeight="600"
                  letterSpacing="0.3px"
                >
                  {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                </text>

                {/* Status Badge in Header */}
                <g transform={`translate(${w - 60}, 6)`}>
                  <rect
                    x="0"
                    y="0"
                    width="52"
                    height="16"
                    rx="8"
                    fill={isDone ? '#064e3b' : isRunning ? '#0c4a6e' : isFailed ? '#7f1d1d' : '#1f2937'}
                  />
                  <text
                    x="26"
                    y="11"
                    textAnchor="middle"
                    fill={isDone ? '#34d399' : isRunning ? '#38bdf8' : isFailed ? '#f87171' : '#9ca3af'}
                    fontSize="8.5"
                    fontWeight="700"
                  >
                    {isDone ? '✓ DONE' : isRunning ? '⏳ RUN' : isFailed ? '✗ FAIL' : 'IDLE'}
                  </text>
                </g>

                {/* Node Body Content */}
                <text x="12" y="46" fill="#9ca3af" fontSize="10.5">
                  {node.subtitle
                    ? node.subtitle.length > 28
                      ? `${node.subtitle.slice(0, 27)}…`
                      : node.subtitle
                    : node.category.toUpperCase()}
                </text>

                {/* Telemetry pill / Model info */}
                <g transform="translate(10, 58)">
                  {node.modelOrTool && (
                    <g>
                      <rect x="0" y="0" width="115" height="18" rx="4" fill="#1f2937" />
                      <text x="6" y="12" fill="#cbd5e1" fontSize="9" fontWeight="500">
                        {node.modelOrTool.length > 18
                          ? `${node.modelOrTool.slice(0, 17)}…`
                          : node.modelOrTool}
                      </text>
                    </g>
                  )}

                  {node.latencyMs !== undefined && (
                    <g transform={`translate(${node.modelOrTool ? 122 : 0}, 0)`}>
                      <rect x="0" y="0" width="65" height="18" rx="4" fill="#0f172a" stroke="#334155" strokeWidth="0.8" />
                      <text x="32" y="12" textAnchor="middle" fill="#38bdf8" fontSize="9" fontWeight="600">
                        {node.latencyMs.toFixed(1)}ms
                      </text>
                    </g>
                  )}
                </g>

                {/* Left Input Port */}
                <circle
                  cx="0"
                  cy={h / 2}
                  r="5"
                  fill="#111827"
                  stroke={style.accent}
                  strokeWidth="2"
                  className="mesh-port"
                />

                {/* Right Output Port */}
                <circle
                  cx={w}
                  cy={h / 2}
                  r="5"
                  fill="#111827"
                  stroke={style.accent}
                  strokeWidth="2"
                  className="mesh-port"
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Interactive Node Inspector Drawer */}
      {selectedNode && (
        <div className="n8n-inspector-drawer">
          <div className="drawer-header">
            <div className="drawer-title-group">
              <span className="drawer-icon">
                {selectedNode.icon ?? (CATEGORY_STYLES[selectedNode.category]?.icon || '📦')}
              </span>
              <div>
                <h4 className="drawer-node-title">{selectedNode.label}</h4>
                <span className="drawer-node-cat">{selectedNode.category.toUpperCase()} NODE</span>
              </div>
            </div>
            <button
              className="btn-close-drawer"
              onClick={() => {
                if (onSelectNode) onSelectNode(null);
                else setInternalSelectedId(null);
              }}
            >
              &times;
            </button>
          </div>

          <div className="drawer-body">
            {/* Status & Latency Pills */}
            <div className="drawer-meta-row">
              <span className={`status-pill ${selectedNode.status}`}>
                {selectedNode.status.toUpperCase()}
              </span>
              {selectedNode.latencyMs !== undefined && (
                <span className="meta-pill latency">
                  ⏱ {selectedNode.latencyMs.toFixed(1)} ms
                </span>
              )}
              {selectedNode.modelOrTool && (
                <span className="meta-pill model">
                  ⚡ {selectedNode.modelOrTool}
                </span>
              )}
            </div>

            {/* Subtitle / Description */}
            {selectedNode.subtitle && (
              <div className="drawer-desc-card">
                <span className="section-label">Execution Summary</span>
                <p>{selectedNode.subtitle}</p>
              </div>
            )}

            {/* Critic Verification Checks */}
            {selectedNode.criticVerdicts && selectedNode.criticVerdicts.length > 0 && (
              <div className="drawer-section">
                <span className="section-label">Deterministic Critic Checks (C1–C5)</span>
                <div className="critic-checks-list">
                  {selectedNode.criticVerdicts.map((c, i) => (
                    <div key={i} className={`critic-check-item ${c.passed ? 'pass' : 'fail'}`}>
                      <span className="check-icon">{c.passed ? '✓' : '✗'}</span>
                      <div className="check-text">
                        <strong>{c.name}:</strong> <span>{c.details}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inputs & Outputs Data */}
            {selectedNode.inputData && (
              <div className="drawer-section">
                <span className="section-label">Node Inputs</span>
                <pre className="json-code-block">
                  {typeof selectedNode.inputData === 'string'
                    ? selectedNode.inputData
                    : JSON.stringify(selectedNode.inputData, null, 2)}
                </pre>
              </div>
            )}

            {selectedNode.outputData && (
              <div className="drawer-section">
                <span className="section-label">Node Output / Result</span>
                <pre className="json-code-block">
                  {typeof selectedNode.outputData === 'string'
                    ? selectedNode.outputData
                    : JSON.stringify(selectedNode.outputData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
