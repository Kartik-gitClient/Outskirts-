import React, { useEffect, useRef, useState } from 'react';
import type { ModelEntry, PlanStep } from '../lib/api.js';
import type { ChatMessage } from '../lib/useWorkbench.js';

/** Pipeline steps revealed progressively — cascading in as the plan unfolds,
 *  never dumped all at once. Settled (historical) plans render instantly. */
function PlanSteps({
  steps,
  stepStatus,
}: {
  steps: PlanStep[];
  stepStatus?: Record<string, string>;
}): React.ReactElement | null {
  const settledAtMount = useRef(steps.every((s) => (stepStatus?.[s.stepId] ?? s.status) === 'done'));
  const [reveal, setReveal] = useState(() => (settledAtMount.current ? steps.length : 0));

  useEffect(() => {
    if (settledAtMount.current) return;
    let r = 0;
    setReveal(0);
    const id = setInterval(() => {
      r += 1;
      setReveal(r);
      if (r >= steps.length) clearInterval(id);
    }, 260);
    return () => clearInterval(id);
  }, [steps]);

  if (steps.length === 0) return null;

  // steps already active/done are always visible, even ahead of the stagger
  let activeCount = 0;
  steps.forEach((s, i) => {
    const st = stepStatus?.[s.stepId] ?? s.status ?? 'pending';
    if (st !== 'pending') activeCount = i + 1;
  });
  const visible = Math.min(steps.length, Math.max(reveal, activeCount));

  return (
    <div className="pipeline">
      {steps.slice(0, visible).map((s, i) => {
        const st = stepStatus?.[s.stepId] ?? s.status ?? 'pending';
        const cls = st === 'done' ? 'done' : st === 'running' ? 'running' : st === 'failed' || st === 'cancelled' ? 'error' : '';
        return (
          <div key={s.stepId} className={`pipeline-step ${cls}`}>
            <span className="idx">{String(i + 1).padStart(2, '0')}</span>
            <span>{s.description}</span>
            <span className="state">{STATE_GLYPH[st] ?? st}</span>
          </div>
        );
      })}
      {visible < steps.length && (
        <div className="pipeline-step pending-next">
          <span className="idx">··</span>
          <span className="dim">planning next steps…</span>
        </div>
      )}
    </div>
  );
}

interface CenterProps {
  title: string;
  status: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  sending: boolean;
  onCancel?: () => void;
  placeholder?: string;
  hideComposer?: boolean;
  availableModels?: ModelEntry[];
  onlineProviders?: string[];
  preferredModel?: string | null;
  onPickModel?: (modelId: string | null) => void;
}

function ModelPicker({
  models,
  onlineProviders,
  preferred,
  onPick,
}: {
  models: ModelEntry[];
  onlineProviders: string[];
  preferred: string | null;
  onPick: (id: string | null) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const label =
    preferred !== null && preferred !== ''
      ? (models.find((m) => m.modelId === preferred)?.modelId ?? preferred)
      : 'auto';

  return (
    <div className="model-picker" ref={ref}>
      <button className="model-picker-chip" onClick={() => setOpen((o) => !o)} title="workhorse model for this workbench">
        <span className="dot" />
        model · {label}
      </button>
      {open && (
        <div className="model-picker-menu">
          <button
            className={`model-picker-item ${preferred === null || preferred === '' ? 'active' : ''}`}
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
          >
            <span className="model-picker-name">automatic</span>
            <span className="model-picker-detail">local-first chain · fails over per task</span>
          </button>
          {models.length === 0 && <div className="model-picker-empty">no models admissible in this mode</div>}
          {models.map((m) => {
            const online = onlineProviders.includes(m.providerId);
            return (
              <button
                key={m.modelId}
                className={`model-picker-item ${preferred === m.modelId ? 'active' : ''} ${online ? '' : 'offline'}`}
                onClick={() => {
                  onPick(m.modelId);
                  setOpen(false);
                }}
              >
                <span className="model-picker-name">
                  {m.modelId}
                  {m.trustBoundary === 'outside-perimeter' && (
                    <span className="badge warn" style={{ marginLeft: 8 }}>assist · opens perimeter</span>
                  )}
                  {!online && <span className="badge neutral" style={{ marginLeft: 8 }}>offline</span>}
                </span>
                <span className="model-picker-detail">
                  {m.providerId} · {m.taskTypes?.join('/') ?? 'general'} · {online ? 'ready' : 'falls back to chain'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STATE_GLYPH: Record<string, string> = {
  done: '[' + String.fromCharCode(0x2713) + ']',
  running: '[~]',
  failed: '[x]',
  cancelled: '[-]',
  pending: '[ ]',
  error: '[x]',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Minimal markdown -> HTML for chat bodies (headers, bullets, bold, inline code). */
function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  const inline = (t: string): string =>
    escapeHtml(t)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]/g, '<span class="cite-tag">$1</span>');

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('### ')) {
      closeList();
      out.push(`<h4 class="md-h">${inline(line.slice(4))}</h4>`);
    } else if (line.startsWith('## ')) {
      closeList();
      out.push(`<h3 class="md-h">${inline(line.slice(3))}</h3>`);
    } else if (line.startsWith('# ')) {
      closeList();
      out.push(`<h2 class="md-h md-title">${inline(line.slice(2))}</h2>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul class="md-list">');
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else if (line.length === 0) {
      closeList();
    } else {
      closeList();
      out.push(`<p class="md-p">${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('');
}

export const WorkbenchCenter: React.FC<CenterProps> = ({
  title,
  status,
  messages,
  onSend,
  sending,
  onCancel,
  placeholder = 'Ask the workbench — an approval note, an Excel register, a P&ID trace, a twin scenario...',
  hideComposer = false,
  availableModels,
  onlineProviders,
  preferredModel,
  onPickModel,
}) => {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    if (!draft.trim() || sending) return;
    onSend(draft);
    setDraft('');
  };

  return (
    <section className="center">
      <div className="center-head">
        <span className="center-title">{title}</span>
        <span className="center-sub">{status}</span>
        {sending && onCancel && (
          <button className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={onCancel}>
            cancel run
          </button>
        )}
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <div>OUTSKIRTS WORKBENCH</div>
            <div className="dim" style={{ maxWidth: 420 }}>
              Every run is planned into a typed DAG, executed against local services, verified by the deterministic critic
              and sealed into the Merkle audit chain.
            </div>
            <div className="suggestions">
              {[
                'Pull up the equipment register and make an Excel file',
                'Visualize this data',
                'Make a presentation about the equipment data',
                'Run a Darcy-Weisbach pressure drop check for line P-101A',
                'Simulate a shutdown of P-101 and show affected equipment',
              ].map((s) => (
                <button key={s} className="suggestion-chip" onClick={() => onSend(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="msg-role">{m.role === 'user' ? 'operator' : 'outskirts'}</div>
            <div
              className={`msg-body ${m.role === 'assistant' && m.text ? 'msg-md' : ''}`}
              style={!m.text ? { color: '#888' } : undefined}
            >
              {m.role === 'assistant' && m.text ? (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
              ) : (
                m.text || (m.status === 'running' ? 'Planning and executing…' : '')
              )}

              {m.plan && m.plan.length > 0 && <PlanSteps steps={m.plan} stepStatus={m.stepStatus} />}

              {m.verdict && (
                <div style={{ marginTop: 10 }}>
                  <span className={`badge ${m.verdict.gate === 'pass' ? '' : 'bad'}`}>
                    critic {m.verdict.gate}
                  </span>
                </div>
              )}

              {m.citations && m.citations.length > 0 && (
                <div className="citations">
                  {m.citations.map((c, i) => (
                    <div key={i} className="citation">
                      <span>[{c.documentId}]</span>
                      {c.quote && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.quote}</span>}
                      {c.decay !== undefined && (
                        <span className={`decay-badge ${(c.state ?? '').toLowerCase()}`}>
                          decay {(c.decay * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {m.error && <div className="warn-box" style={{ marginTop: 10 }}>{m.error}</div>}
            </div>
          </div>
        ))}
      </div>

      {!hideComposer && (
        <div className="composer">
          {availableModels && onPickModel && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 6 }}>
              <ModelPicker
                models={availableModels}
                onlineProviders={onlineProviders ?? []}
                preferred={preferredModel ?? null}
                onPick={onPickModel}
              />
            </div>
          )}
          <div className="composer-box">
            <textarea
              rows={1}
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <button className="btn-primary" onClick={submit} disabled={sending || !draft.trim()}>
              {sending ? 'running' : 'send'}
            </button>
          </div>
          <div className="composer-hint">enter to run · shift+enter newline · every step is audited</div>
        </div>
      )}
    </section>
  );
};
