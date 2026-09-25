import React, { useEffect, useState } from 'react';
import { api, type HealthReport } from '../lib/api.js';

interface AdminWindowProps {
  onClose: () => void;
  mode: 'SOVEREIGN' | 'ASSIST';
  onModeChange: (mode: 'SOVEREIGN' | 'ASSIST') => void;
  providers: HealthReport[];
  nimModel: string;
  onConfigureNim: (key: string) => Promise<void> | void;
}

const PROVIDER_LABEL: Record<string, string> = {
  vllm: 'vllm inference',
  ollama: 'local llm · ollama',
  nim: 'nim assist · outside perimeter',
};

export const AdminWindow: React.FC<AdminWindowProps> = ({
  onClose,
  mode,
  onModeChange,
  providers,
  nimModel,
  onConfigureNim,
}) => {
  const [nimKey, setNimKey] = useState('');
  const [nimSaved, setNimSaved] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const gatewayUp = providers.length > 0;

  return (
    <div className="admin-overlay" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-head">
          <span className="admin-title">system administration</span>
          <button className="btn-ghost" onClick={onClose}>
            close [esc]
          </button>
        </div>

        <div className="admin-body">
          {/* Gateway + provider health */}
          <div className="pane-head">
            <span>Gateway &amp; providers</span>
          </div>
          <div className="admin-row">
            <span className={`dot ${gatewayUp ? '' : 'off'}`} />
            <span className="admin-row-name">gateway</span>
            <span className="admin-row-detail">{gatewayUp ? 'loopback · online' : 'offline'}</span>
          </div>
          {providers.map((p) => (
            <div className="admin-row" key={p.providerId}>
              <span className={`dot ${p.healthy ? '' : 'off'}`} />
              <span className="admin-row-name">{PROVIDER_LABEL[p.providerId] ?? p.providerId}</span>
              <span className="admin-row-detail">
                {p.healthy
                  ? `${p.devicePlacement ?? 'ok'} · ${(p.residentModels ?? []).length} models`
                  : (p.detail ?? 'unreachable')}
              </span>
            </div>
          ))}

          {/* Perimeter mode */}
          <div className="pane-head" style={{ marginTop: 14 }}>
            <span>Perimeter mode</span>
          </div>
          <div className="mode-toggle" style={{ width: 'fit-content' }}>
            <button className={mode === 'SOVEREIGN' ? 'active' : ''} onClick={() => onModeChange('SOVEREIGN')}>
              sovereign
            </button>
            <button className={mode === 'ASSIST' ? 'active' : ''} onClick={() => onModeChange('ASSIST')}>
              assist
            </button>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            sovereign refuses every outside-perimeter provider · assist allows the configured NIM model
          </div>

          {/* NIM configuration */}
          <div className="pane-head" style={{ marginTop: 14 }}>
            <span>Assist provider · NVIDIA NIM</span>
          </div>
          <div className="hint" style={{ marginBottom: 8 }}>
            model {nimModel}
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
    </div>
  );
};
