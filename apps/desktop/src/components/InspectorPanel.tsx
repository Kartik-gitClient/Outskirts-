import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ArtifactInfo } from '../lib/api.js';
import type { ChatMessage } from '../lib/useWorkbench.js';

interface InspectorProps {
  message?: ChatMessage;
  allArtifacts: ArtifactInfo[];
  notificationsCount: number;
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function kindOf(a: ArtifactInfo): string {
  const f = a.fileName.toLowerCase();
  if (f.endsWith('.docx')) return 'docx';
  if (f.endsWith('.xlsx')) return 'xlsx';
  if (f.endsWith('.pptx')) return 'pptx';
  if (f.endsWith('.html')) return 'html';
  if (f.endsWith('.md')) return 'markdown';
  if (f.endsWith('.json')) return 'json';
  if (f.endsWith('.svg')) return 'svg';
  return 'file';
}

export const InspectorPanel: React.FC<InspectorProps> = ({ message, allArtifacts, notificationsCount }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const openPreview = useCallback((artifactId: string) => {
    if (preview === artifactId) {
      setPreview(null);
      setPreviewHtml(null);
      setPreviewError(null);
      return;
    }
    setPreview(artifactId);
    setPreviewHtml(null);
    setPreviewError(null);
    setLoadingPreview(true);
    api
      .artifactPreview(artifactId)
      .then((p) => setPreviewHtml(p.html))
      .catch((e) => setPreviewError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingPreview(false));
  }, [preview]);

  const artifacts = message?.artifacts ?? [];
  const steps = Array.isArray(message?.plan) ? message.plan : [];
  const doneSteps = steps.filter((s) => (message?.stepStatus?.[s.stepId] ?? s.status) === 'done').length;

  // The newest artifact of this chat — previewed by default when it changes.
  const visibleArtifacts = artifacts.length > 0 ? artifacts : allArtifacts;
  const latestArtifactId = visibleArtifacts[0]?.artifactId ?? null;
  const autoOpenedRef = useRef<string | null>(null);

  useEffect(() => {
    if (latestArtifactId && autoOpenedRef.current !== latestArtifactId) {
      autoOpenedRef.current = latestArtifactId;
      openPreview(latestArtifactId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestArtifactId]);

  return (
    <aside className="inspector">
      <div className="inspector-scroll">
        <div className="pane-head" style={{ padding: '4px 0 10px' }}>
          <span>05 / Output</span>
          <span className="pane-index">C</span>
        </div>

        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Run status</div>
            <div className="stat-value">{message?.status ?? 'idle'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Steps</div>
            <div className="stat-value">
              {doneSteps}
              <span className="stat-unit">/ {steps.length || 0}</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Artifacts</div>
            <div className="stat-value">{artifacts.length}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Decay alerts</div>
            <div className="stat-value" style={{ color: notificationsCount > 0 ? 'var(--warn)' : 'var(--text)' }}>
              {notificationsCount}
            </div>
          </div>
        </div>

        {artifacts.length === 0 && allArtifacts.length > 0 && (
          <div className="hint" style={{ marginBottom: 10 }}>
            Artifacts from this session:
          </div>
        )}

        {visibleArtifacts.map((a) => {
          const kind = kindOf(a);
          return (
            <div className="artifact" key={a.artifactId}>
              <div className="artifact-head">
                <span className="artifact-name" title={a.fileName}>
                  {a.fileName}
                </span>
                <span className="badge neutral" style={{ marginLeft: 'auto' }}>
                  {kind}
                </span>
              </div>
              {preview === a.artifactId && (
                <div className="preview-holder">
                  {loadingPreview && <div className="preview-loading">rendering preview…</div>}
                  {previewError && <div className="preview-loading">{previewError}</div>}
                  {previewHtml && (
                    <iframe
                      className="preview-frame preview-frame-tall"
                      srcDoc={previewHtml}
                      title={a.fileName}
                      sandbox="allow-scripts"
                    />
                  )}
                </div>
              )}
              <div className="artifact-meta">
                {bytes(a.sizeBytes)} · sha256 {a.sha256.slice(0, 16)}… · {new Date(a.createdAt).toLocaleTimeString()}
              </div>
              <div className="artifact-actions">
                <button className="btn-secondary" onClick={() => openPreview(a.artifactId)}>
                  {preview === a.artifactId ? 'hide' : 'preview'}
                </button>
                <a className="btn-primary" href={api.artifactUrl(a.url)} download style={{ textDecoration: 'none' }}>
                  download
                </a>
              </div>
            </div>
          );
        })}

        {artifacts.length === 0 && allArtifacts.length === 0 && (
          <div className="inspector-empty">No artifacts yet. Run a goal that produces a deliverable.</div>
        )}

        {message?.citations && message.citations.length > 0 && (
          <>
            <div className="divider" />
            <div className="pane-head" style={{ padding: '4px 0 10px' }}>
              <span>Retrieved evidence</span>
            </div>
            {message.citations.map((c, i) => (
              <div key={i} className="citation" style={{ marginBottom: 6 }}>
                <span>[{c.documentId}]</span>
                {c.decay !== undefined && (
                  <span className={`decay-badge ${(c.state ?? '').toLowerCase()}`}>
                    decay {(c.decay * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
};
