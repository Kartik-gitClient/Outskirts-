import React, { useState } from 'react';
import type { Notification, HealthReport } from '../lib/api.js';
import type { Thread } from '../lib/useWorkbench.js';

interface SidebarProps {
  threads: Thread[];
  activeThreadId?: string;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
  notifications: Notification[];
  mode: 'SOVEREIGN' | 'ASSIST';
  onModeChange: (mode: 'SOVEREIGN' | 'ASSIST') => void;
  providers: HealthReport[];
  onUseConnector: (prompt: string) => void;
  onConfigureNim: (key: string) => Promise<void> | void;
  nimModel: string;
}

const CONNECTORS: Array<{
  id: string;
  name: string;
  desc: string;
  tools: string;
  prompt: string;
  provider: string;
}> = [
  {
    id: 'engineering',
    name: 'Engineering Calculations',
    desc: 'Darcy-Weisbach, ISA-75.01 valve sizing, compressor head',
    tools: 'pipe-calc-plugin · engineering-svc',
    prompt: 'Run a Darcy-Weisbach pressure drop check for line P-101A',
    provider: 'engineering',
  },
  {
    id: 'knowledge',
    name: 'Sovereign Knowledge',
    desc: 'Hybrid BM25 + vector retrieval with freshness decay',
    tools: 'knowledge-base · BM25 · RRF',
    prompt: 'What is the minimum allowable wall thickness for CDU piping?',
    provider: 'knowledge',
  },
  {
    id: 'perception',
    name: 'P&ID Perception',
    desc: 'Vector symbol detection, tag OCR, GraphRAG topology',
    tools: 'perception-svc · pid-graph',
    prompt: 'Trace the isolation boundary for pump P-101A on the P&ID',
    provider: 'perception',
  },
  {
    id: 'twin',
    name: 'Digital Twin',
    desc: 'What-if simulation on the virtual plant before field change',
    tools: 'twin-simulator · engineering-svc',
    prompt: 'Simulate a shutdown of pump P-101A and show affected equipment',
    provider: 'twin',
  },
  {
    id: 'documents',
    name: 'Deliverable Synthesis',
    desc: 'Signed .docx, .xlsx and .pptx artifacts with Decision DNA',
    tools: 'docx · exceljs · pptxgenjs',
    prompt: 'Produce an engineering approval note for Refinery Line P-101A',
    provider: 'documents',
  },
  {
    id: 'sandbox',
    name: 'Micro-Tool Sandbox',
    desc: 'Generated interactive HTML tools in a zero-egress iframe',
    tools: 'csp default-src none',
    prompt: 'build a hydraulic sizing calculator micro tool',
    provider: 'sandbox',
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  notifications,
  mode,
  onModeChange,
  providers,
  onUseConnector,
  onConfigureNim,
  nimModel,
}) => {
  const [nimKey, setNimKey] = useState('');
  const [nimSaved, setNimSaved] = useState(false);

  const providerHealthy = (id: string): boolean => {
    if (id === 'knowledge' || id === 'twin' || id === 'documents' || id === 'sandbox') return true;
    if (id === 'engineering') return providers.some((p) => p.providerId === 'vllm' || p.healthy);
    if (id === 'perception') return providers.some((p) => p.providerId === 'ollama' || p.healthy);
    return true;
  };

  const critical = notifications.filter((n) => n.severity === 'critical').length;

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        {/* Sessions */}
        <div className="pane">
          <div className="pane-head">
            <span>01 / Sessions</span>
            <button className="btn-ghost" onClick={onNewThread}>
              + new
            </button>
          </div>
          {threads.length === 0 && <div className="hint">No sessions yet. Ask the workbench something.</div>}
          {threads.map((t) => (
            <div
              key={t.id}
              className={`thread ${t.id === activeThreadId ? 'active' : ''}`}
              onClick={() => onSelectThread(t.id)}
              role="button"
              tabIndex={0}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span className="thread-title">{t.title}</span>
                <button
                  className="btn-ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(t.id);
                  }}
                  title="delete session"
                >
                  x
                </button>
              </div>
              <div className="thread-meta">
                {new Date(t.createdAt).toLocaleTimeString()} · {t.messages.length} messages
              </div>
            </div>
          ))}
        </div>

        {/* Connector marketplace */}
        <div className="pane">
          <div className="pane-head">
            <span>02 / Connectors</span>
            <span className="pane-index">skills</span>
          </div>
          <div className="connector-grid">
            {CONNECTORS.map((c) => (
              <div key={c.id} className="connector" onClick={() => onUseConnector(c.prompt)} role="button" tabIndex={0}>
                <div className="connector-top">
                  <span className="connector-name">{c.name}</span>
                  <span className={`badge ${providerHealthy(c.provider) ? '' : 'neutral'}`}>
                    {providerHealthy(c.provider) ? 'ready' : 'idle'}
                  </span>
                </div>
                <div className="connector-desc">{c.desc}</div>
                <div className="connector-tools">{c.tools}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Data decay notifications */}
        <div className="pane">
          <div className="pane-head">
            <span>03 / Notifications</span>
            <span className="pane-index">{notifications.length}</span>
          </div>
          {notifications.length === 0 && <div className="hint">All governing documents are fresh.</div>}
          {notifications.map((n) => (
            <div key={n.id} className={`notif ${n.severity}`}>
              <div className="notif-title">{n.title}</div>
              <div className="notif-detail">{n.detail}</div>
            </div>
          ))}
        </div>

        {/* NIM configuration */}
        <div className="pane" style={{ borderBottom: 'none' }}>
          <div className="pane-head">
            <span>04 / Assist provider</span>
          </div>
          <div className="hint" style={{ marginBottom: 8 }}>
            NVIDIA NIM · {nimModel}
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <input
              type="password"
              placeholder="NIM_API_KEY"
              value={nimKey}
              onChange={(e) => {
                setNimKey(e.target.value);
                setNimSaved(false);
              }}
            />
          </div>
          <button
            className="btn-secondary"
            style={{ width: '100%' }}
            onClick={async () => {
              await onConfigureNim(nimKey);
              setNimSaved(true);
              setNimKey('');
            }}
          >
            {nimSaved ? 'configured' : 'configure provider'}
          </button>
        </div>
      </div>

      {/* Footer: mode switcher + decay indicator */}
      <div className="sidebar-foot">
        <div className="mode-toggle" style={{ flex: 1 }}>
          <button
            className={mode === 'SOVEREIGN' ? 'active' : ''}
            onClick={() => onModeChange('SOVEREIGN')}
            title="Refuse every outside-perimeter provider"
          >
            sovereign
          </button>
          <button
            className={mode === 'ASSIST' ? 'active' : ''}
            onClick={() => onModeChange('ASSIST')}
            title="Allow the configured NIM assist provider"
          >
            assist
          </button>
        </div>
        <span className={`badge ${critical > 0 ? 'bad' : 'neutral'}`} title="data decay alerts">
          {critical > 0 ? `${critical} decay` : 'decay 0'}
        </span>
      </div>
    </aside>
  );
};
