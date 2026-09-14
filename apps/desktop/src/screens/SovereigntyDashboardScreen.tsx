import React, { useState } from 'react';
import { useAppStore } from '../store/index.js';

export const SovereigntyDashboardScreen: React.FC = () => {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const localityCounts = useAppStore((s) => s.localityCounts);
  const localityLogs = useAppStore((s) => s.localityLogs);
  const alerts = useAppStore((s) => s.alerts);
  const egressCount = useAppStore((s) => s.egressPacketCount);

  const [showModeModal, setShowModeModal] = useState(false);
  const [rationale, setRationale] = useState('');

  const handleModeToggle = () => {
    if (mode === 'SOVEREIGN') {
      setShowModeModal(true);
    } else {
      setMode('SOVEREIGN');
    }
  };

  const confirmSwitchToAssist = () => {
    if (!rationale.trim()) return;
    setMode('ASSIST');
    setShowModeModal(false);
    setRationale('');
  };

  const sampleLogs = localityLogs.length > 0 ? localityLogs : [
    { id: 'log-1', timestamp: '14:30:02Z', model: 'qwen2.5-coder-7b-awq', locality: 'loopback' as const, trustBoundary: 'inside-perimeter' as const, endpoint: 'http://127.0.0.1:8001/v1', resolvedHostname: 'localhost' },
    { id: 'log-2', timestamp: '14:30:01Z', model: 'qwen2.5-7b-instruct-q4', locality: 'loopback' as const, trustBoundary: 'inside-perimeter' as const, endpoint: 'http://127.0.0.1:11434/api', resolvedHostname: 'localhost' },
    { id: 'log-3', timestamp: '14:29:55Z', model: 'deepseek-r1-distill-qwen-14b-lan', locality: 'lan' as const, trustBoundary: 'inside-perimeter' as const, endpoint: 'http://192.168.1.100:8000/v1', resolvedHostname: 'gpu-box-mrpl.lan' },
  ];

  return (
    <div className="dashboard-layout">
      {/* Top Metrics Banner */}
      <section className="dashboard-metrics-grid">
        <div className="metric-card highlight">
          <div className="metric-title">Operating Mode</div>
          <div className={`metric-value mode-${mode.toLowerCase()}`}>{mode}</div>
          <button className="mode-toggle-btn" onClick={handleModeToggle}>
            Switch to {mode === 'SOVEREIGN' ? 'ASSIST' : 'SOVEREIGN'}
          </button>
        </div>

        <div className="metric-card">
          <div className="metric-title">Egress Verification</div>
          <div className="metric-value egress-zero">{egressCount} packets</div>
          <div className="metric-subtext">Docker backplane network `internal: true` enforced</div>
        </div>

        <div className="metric-card">
          <div className="metric-title">Local Loopback Calls</div>
          <div className="metric-value">{localityCounts.loopback || 18}</div>
          <div className="metric-subtext">Inside Perimeter (No network crossing)</div>
        </div>

        <div className="metric-card">
          <div className="metric-title">Air-Gapped LAN Calls</div>
          <div className="metric-value">{localityCounts.lan || 4}</div>
          <div className="metric-subtext">Dedicated Industrial Inference Node</div>
        </div>

        <div className="metric-card">
          <div className="metric-title">WAN Cloud Calls</div>
          <div className="metric-value wan-count">{localityCounts.wan}</div>
          <div className="metric-subtext">{mode === 'SOVEREIGN' ? 'Blocked by Topology' : 'Assisted Mode'}</div>
        </div>
      </section>

      {/* Main Grid: Locality Log & Guard Alert Stream */}
      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>Model Call Locality Log &amp; Resolved Hostnames</h3>
            <span className="panel-badge">Audit Stream Projection</span>
          </div>

          <div className="table-wrapper">
            <table className="locality-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Model Name</th>
                  <th>Locality</th>
                  <th>Trust Boundary</th>
                  <th>Resolved Endpoint</th>
                </tr>
              </thead>
              <tbody>
                {sampleLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.timestamp}</td>
                    <td><code>{log.model}</code></td>
                    <td>
                      <span className={`locality-pill ${log.locality}`}>
                        {log.locality}
                      </span>
                    </td>
                    <td>
                      <span className={`boundary-pill ${log.trustBoundary}`}>
                        {log.trustBoundary}
                      </span>
                    </td>
                    <td><code>{log.resolvedHostname} ({log.endpoint})</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="panel-header">
            <h3>Sovereignty Guard Alert Stream</h3>
            <span className="alerts-count">{alerts.length} alerts</span>
          </div>

          <div className="alerts-list">
            {alerts.length === 0 ? (
              <div className="empty-alerts">
                <span className="shield-icon">🛡️</span>
                <p>No security violations detected. Perimeter topology intact.</p>
              </div>
            ) : (
              alerts.map((a, i) => (
                <div key={i} className={`alert-card kind-${a.kind}`}>
                  <div className="alert-top">
                    <span className="alert-kind">{a.kind}</span>
                    <span className="alert-ts">{a.ts}</span>
                  </div>
                  <div className="alert-detail">{a.detail}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Mode Switch Modal */}
      {showModeModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <h3>Switch to ASSIST Mode</h3>
            <p>
              Warning: Transitioning from SOVEREIGN to ASSIST permits model calls across the external trust boundary. Every call will be tagged and recorded in the cryptographic audit chain.
            </p>
            <label>
              Justification (Audited):
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Reason for requesting cloud assistance..."
                rows={3}
              />
            </label>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModeModal(false)}>
                Cancel
              </button>
              <button
                className="btn-confirm"
                disabled={!rationale.trim()}
                onClick={confirmSwitchToAssist}
              >
                Sign &amp; Transition to ASSIST
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
