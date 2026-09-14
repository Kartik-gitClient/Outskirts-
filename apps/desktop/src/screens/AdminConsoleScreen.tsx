import React from 'react';
import { useAppStore } from '../store/index.js';

export const AdminConsoleScreen: React.FC = () => {
  const activeRole = useAppStore((s) => s.activeUserRole);
  const setUserRole = useAppStore((s) => s.setUserRole);
  const rbacMatrix = useAppStore((s) => s.rbacMatrix);
  const models = useAppStore((s) => s.models);
  const setModelStatus = useAppStore((s) => s.setModelStatus);

  const defaultModels = models.length > 0 ? models : [
    {
      modelId: 'qwen2.5-coder-7b-awq',
      providerId: 'vllm',
      locality: 'loopback' as const,
      trustBoundary: 'inside-perimeter' as const,
      taskTypes: ['code' as const],
      capabilities: ['text' as const, 'tool-use' as const, 'guided-json' as const],
      quantisation: 'AWQ',
      contextWindow: 32768,
      quality: 0.92,
      estLoadS: 0,
      pinned: true,
      status: 'enabled' as const,
      license: 'Apache-2.0',
    },
    {
      modelId: 'qwen2.5-7b-instruct-q4',
      providerId: 'ollama',
      locality: 'loopback' as const,
      trustBoundary: 'inside-perimeter' as const,
      taskTypes: ['document' as const, 'retrieve' as const],
      capabilities: ['text' as const, 'guided-json' as const],
      quantisation: 'Q4_K_M',
      contextWindow: 16384,
      quality: 0.85,
      estLoadS: 6.5,
      pinned: false,
      status: 'enabled' as const,
      license: 'Apache-2.0',
    },
    {
      modelId: 'deepseek-r1-distill-qwen-14b-lan',
      providerId: 'vllm',
      locality: 'lan' as const,
      trustBoundary: 'inside-perimeter' as const,
      taskTypes: ['calculation' as const],
      capabilities: ['text' as const, 'guided-json' as const],
      quantisation: 'AWQ',
      contextWindow: 65536,
      quality: 0.95,
      estLoadS: 0,
      pinned: true,
      status: 'enabled' as const,
      license: 'MIT',
    },
  ];

  return (
    <div className="admin-layout">
      <div className="admin-header">
        <h2>Admin Console &amp; Governance Plane</h2>
        <div className="role-selector">
          <span>Active Operator Role:</span>
          <select
            value={activeRole}
            onChange={(e) => setUserRole(e.target.value as any)}
            className="role-dropdown"
          >
            <option value="junior">Junior Engineer (Task Create/Read only)</option>
            <option value="senior">Senior Engineer (Override &amp; Mode switch)</option>
            <option value="admin">Platform Admin (Full system control)</option>
          </select>
        </div>
      </div>

      {/* Model Shelf Section */}
      <section className="admin-section">
        <div className="section-title-bar">
          <span className="section-title">Governed Model Registry Shelf</span>
          <span className="info-text">Residency, Locality &amp; Licence Attribution</span>
        </div>

        <div className="table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Model Identifier</th>
                <th>Provider Engine</th>
                <th>Locality</th>
                <th>Context Window</th>
                <th>Quality Score</th>
                <th>Licence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {defaultModels.map((m) => (
                <tr key={m.modelId}>
                  <td><strong><code>{m.modelId}</code></strong></td>
                  <td><code>{m.providerId}</code></td>
                  <td>
                    <span className={`locality-pill ${m.locality}`}>{m.locality}</span>
                  </td>
                  <td>{(m.contextWindow).toLocaleString()} tokens</td>
                  <td>{(m.quality * 100).toFixed(0)}%</td>
                  <td><span className="license-tag">{m.license ?? 'Apache-2.0'}</span></td>
                  <td>
                    <button
                      className={`status-toggle-btn ${m.status}`}
                      onClick={() => setModelStatus(m.modelId, m.status === 'enabled' ? 'disabled' : 'enabled')}
                    >
                      {m.status}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cedar RBAC Matrix */}
      <section className="admin-section">
        <div className="section-title-bar">
          <span className="section-title">Cedar RBAC Policy Matrix (Deny-by-Default)</span>
          <span className="info-text">Refusals are audited in the tamper-evident chain</span>
        </div>

        <div className="table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Allowed Actions</th>
                <th>Refusal Audit Behavior</th>
              </tr>
            </thead>
            <tbody>
              {rbacMatrix.map((row) => (
                <tr key={row.role} className={row.role === activeRole ? 'active-role-row' : ''}>
                  <td>
                    <strong>{row.role.toUpperCase()}</strong>
                    {row.role === activeRole && <span className="active-tag"> (Active)</span>}
                  </td>
                  <td>
                    <div className="actions-chips">
                      {row.allowedActions.map((act) => (
                        <span key={act} className="action-chip">{act}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className="audit-note">Emits <code>rbac.refusal</code> on blocked operations</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
