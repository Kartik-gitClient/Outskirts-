import React, { useState } from 'react';
import type { BBox } from '@outskirts/schemas';
import { N8nMeshCanvas, type MeshNode, type MeshEdge } from './N8nMeshCanvas.js';

export interface PidTagMarker {
  tagNumber: string;
  type: string;
  service?: string;
  bbox: BBox;
  confidence: number;
}

interface PidViewerProps {
  tags?: PidTagMarker[];
  selectedTag?: string | null;
  onSelectTag?: (tagNumber: string) => void;
}

export const PidViewer: React.FC<PidViewerProps> = ({
  tags = [
    { tagNumber: 'V-101', type: 'pressure-vessel', service: 'Feed Surge Drum', bbox: { page: 1, x: 150, y: 350, w: 90, h: 140 }, confidence: 1.0 },
    { tagNumber: 'GV-1001', type: 'gate-valve', service: 'Suction Isolation', bbox: { page: 1, x: 380, y: 400, w: 50, h: 40 }, confidence: 1.0 },
    { tagNumber: 'P-101A', type: 'centrifugal-pump', service: 'Charge Pump', bbox: { page: 1, x: 500, y: 380, w: 80, h: 80 }, confidence: 1.0 },
    { tagNumber: 'GV-1002', type: 'gate-valve', service: 'Discharge Isolation', bbox: { page: 1, x: 650, y: 400, w: 50, h: 40 }, confidence: 1.0 },
    { tagNumber: 'FV-2034', type: 'flow-control-valve', service: 'Charge Flow Control', bbox: { page: 1, x: 780, y: 390, w: 60, h: 60 }, confidence: 1.0 },
    { tagNumber: 'FT-2034', type: 'flow-transmitter', service: 'Flow Sensing', bbox: { page: 1, x: 800, y: 300, w: 40, h: 40 }, confidence: 1.0 },
    { tagNumber: 'V-102', type: 'pressure-vessel', service: 'Crude Fractionator', bbox: { page: 1, x: 950, y: 320, w: 90, h: 140 }, confidence: 1.0 },
  ],
  selectedTag: controlledSelectedTag,
  onSelectTag,
}) => {
  const [viewMode, setViewMode] = useState<'cad_sheet' | 'topology_mesh'>('topology_mesh');
  const [internalSelected, setInternalSelected] = useState<string | null>('P-101A');
  const currentSelected = controlledSelectedTag !== undefined ? controlledSelectedTag : internalSelected;

  const handleTagClick = (tag: string) => {
    if (onSelectTag) onSelectTag(tag);
    else setInternalSelected(tag);
  };

  const activeTag = tags.find((t) => t.tagNumber === currentSelected);

  // n8n Process Topology Mesh Nodes & Edges
  const TOPOLOGY_NODES: MeshNode[] = [
    {
      id: 'node-v101',
      label: 'V-101',
      subtitle: 'Feed Surge Drum',
      category: 'equipment',
      status: 'done',
      x: 30,
      y: 120,
      icon: '🛢',
      modelOrTool: 'Design: 5.2 barg · CS',
      inputData: { level: '68%', temp: '145°C', pressure: '4.8 barg' },
      outputData: { feedRate: '180 m3/h', fluid: 'Heavy Hydrocarbon' },
    },
    {
      id: 'node-gv1001',
      label: 'GV-1001 [ISOLATION]',
      subtitle: 'Suction Block Valve (LOCKED)',
      category: 'critic',
      status: 'done',
      x: 270,
      y: 120,
      icon: '🔒',
      modelOrTool: '6" Class 300 Gate',
      inputData: { position: 'Closed', tagOutId: 'LOTO-2026-089' },
      outputData: { verifiedIsolated: true, leakRate: '0.00 ml/min' },
      criticVerdicts: [
        { name: 'Upstream Line Integrity', passed: true, details: 'Isolated from V-101 feed' },
      ],
    },
    {
      id: 'node-p101a',
      label: 'P-101A (Charge Pump)',
      subtitle: 'Centrifugal Pump (Under NDT Inspection)',
      category: 'equipment',
      status: 'done',
      x: 510,
      y: 120,
      icon: '⚙',
      modelOrTool: 'API 610 BB2 (Sulzer)',
      latencyMs: 14.2,
      inputData: { suctionPressure: '4.2 barg', dischargePressure: '18.6 barg', rpm: 2950 },
      outputData: { measuredUTThickness: '4.8 mm', minRequired: '4.2 mm', status: 'Approved' },
    },
    {
      id: 'node-gv1002',
      label: 'GV-1002 [ISOLATION]',
      subtitle: 'Discharge Block Valve (LOCKED)',
      category: 'critic',
      status: 'done',
      x: 750,
      y: 120,
      icon: '🔒',
      modelOrTool: '6" Class 300 Gate',
      inputData: { position: 'Closed', tagOutId: 'LOTO-2026-090' },
      outputData: { verifiedIsolated: true, residualPressure: '0.0 barg' },
      criticVerdicts: [
        { name: 'Downstream Line Integrity', passed: true, details: 'Isolated from column header' },
      ],
    },
    {
      id: 'node-fv2034',
      label: 'FV-2034',
      subtitle: 'Charge Flow Control Valve',
      category: 'tool',
      status: 'done',
      x: 990,
      y: 120,
      icon: '🎛',
      modelOrTool: 'Fisher ET Globe (Cv=42)',
      inputData: { setpoint: '180 m3/h', actual: '180.2 m3/h' },
      outputData: { stemOpening: '64.2%', deltaP: '1.42 bar' },
    },
    {
      id: 'node-v102',
      label: 'V-102',
      subtitle: 'Main Crude Fractionator',
      category: 'equipment',
      status: 'done',
      x: 1230,
      y: 120,
      icon: '🏭',
      modelOrTool: 'Operating: 3.4 barg · 360°C',
      inputData: { feedTray: 14, refluxRatio: '2.4:1' },
      outputData: { bottomsYield: '42.5%', overheadYield: '28.1%' },
    },
  ];

  const TOPOLOGY_EDGES: MeshEdge[] = [
    { id: 'pe-1', from: 'node-v101', to: 'node-gv1001', label: '6"-HC-1011', active: true, animated: true, color: '#38bdf8' },
    { id: 'pe-2', from: 'node-gv1001', to: 'node-p101a', label: 'Suction Run (12m)', active: true, animated: true, color: '#f59e0b' },
    { id: 'pe-3', from: 'node-p101a', to: 'node-gv1002', label: 'Discharge Run (108m)', active: true, animated: true, color: '#f59e0b' },
    { id: 'pe-4', from: 'node-gv1002', to: 'node-fv2034', label: '6"-HC-1012', active: true, animated: true, color: '#10b981' },
    { id: 'pe-5', from: 'node-fv2034', to: 'node-v102', label: 'Column Feed Line', active: true, animated: true, color: '#10b981' },
  ];

  return (
    <div className="pid-viewer-card">
      <div className="pid-viewer-header">
        <div className="pid-header-left">
          <span className="card-title">P&amp;ID Drawing Perception &amp; Topology</span>
          <span className="drawing-ref">Sheet: MRPL-CDU-01 · Rev C</span>
        </div>

        {/* View Toggle */}
        <div className="pid-view-toggle">
          <button
            className={`toggle-view-btn ${viewMode === 'topology_mesh' ? 'active' : ''}`}
            onClick={() => setViewMode('topology_mesh')}
          >
            ⚡ n8n Process Mesh
          </button>
          <button
            className={`toggle-view-btn ${viewMode === 'cad_sheet' ? 'active' : ''}`}
            onClick={() => setViewMode('cad_sheet')}
          >
            📐 CAD Schematic Sheet
          </button>
        </div>
      </div>

      {/* ISOLATION CERTIFICATION BANNER */}
      <div className="isolation-banner">
        <span className="shield-icon">🛡</span>
        <div className="isolation-text">
          <strong>Certified Isolation Boundary:</strong> Suction Gate Valve{' '}
          <span className="valve-pill">GV-1001 (Closed)</span> &amp; Discharge Gate Valve{' '}
          <span className="valve-pill">GV-1002 (Closed)</span> verified zero residual energy for Pump{' '}
          <span className="valve-pill pump">P-101A</span>.
        </div>
      </div>

      {viewMode === 'topology_mesh' ? (
        <div className="pid-mesh-wrapper">
          <N8nMeshCanvas
            nodes={TOPOLOGY_NODES}
            edges={TOPOLOGY_EDGES}
            title="TOPOLOGICAL PROCESS CONNECTIVITY (GRAPHRAG RESOLUTION)"
            subtitle="Real-time flow line tracing • Drag to pan • Click any equipment unit to inspect mechanical properties"
            height="460px"
            enableDragging={true}
          />
        </div>
      ) : (
        <div className="pid-viewport">
          <svg
            viewBox="0 0 1200 650"
            className="pid-svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#222" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="1200" height="650" fill="url(#grid)" />

            {/* Piping Lines */}
            <path
              d="M 240,420 L 380,420 M 430,420 L 500,420 M 580,420 L 650,420 M 700,420 L 780,420 M 840,420 L 950,420"
              stroke="#4ade80"
              strokeWidth="3"
              fill="none"
            />

            {/* Tag Elements */}
            {tags.map((t) => {
              const isSelected = t.tagNumber === currentSelected;
              return (
                <g
                  key={t.tagNumber}
                  transform={`translate(${t.bbox.x}, ${t.bbox.y})`}
                  className={`tag-group ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleTagClick(t.tagNumber)}
                >
                  <rect
                    x="-4"
                    y="-4"
                    width={t.bbox.w + 8}
                    height={t.bbox.h + 8}
                    fill={isSelected ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)'}
                    stroke={isSelected ? '#38bdf8' : '#4b5563'}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeDasharray={isSelected ? 'none' : '4,2'}
                    rx="4"
                  />
                  <rect
                    x="0"
                    y="0"
                    width={t.bbox.w}
                    height={t.bbox.h}
                    fill="#1f2937"
                    stroke="#9ca3af"
                    strokeWidth="1.5"
                    rx="2"
                  />
                  <text
                    x={t.bbox.w / 2}
                    y={t.bbox.h / 2 + 4}
                    textAnchor="middle"
                    fill={isSelected ? '#38bdf8' : '#f3f4f6'}
                    fontSize="11"
                    fontWeight="bold"
                  >
                    {t.tagNumber}
                  </text>
                </g>
              );
            })}
          </svg>

          {activeTag && (
            <div className="pid-inspection-panel">
              <div className="panel-row">
                <span className="panel-label">Selected Equipment Tag:</span>
                <span className="panel-tag-pill">{activeTag.tagNumber}</span>
                <span className="panel-type-text">({activeTag.type})</span>
              </div>
              <div className="panel-row">
                <span className="panel-label">Service:</span>
                <span className="panel-value">{activeTag.service ?? 'General Process Service'}</span>
              </div>
              <div className="panel-row">
                <span className="panel-label">Region-Link Crop BBox:</span>
                <span className="panel-coords">
                  x: {activeTag.bbox.x}, y: {activeTag.bbox.y}, w: {activeTag.bbox.w}, h: {activeTag.bbox.h} (Page {activeTag.bbox.page})
                </span>
                <span className="confidence-pill">Confidence: {(activeTag.confidence * 100).toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
