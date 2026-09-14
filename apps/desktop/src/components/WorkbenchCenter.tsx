import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../lib/useWorkbench.js';

interface CenterProps {
  title: string;
  status: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  sending: boolean;
  onCancel?: () => void;
  placeholder?: string;
  hideComposer?: boolean;
}

const STATE_GLYPH: Record<string, string> = {
  done: '[' + String.fromCharCode(0x2713) + ']',
  running: '[~]',
  failed: '[x]',
  cancelled: '[-]',
  pending: '[ ]',
  error: '[x]',
};

export const WorkbenchCenter: React.FC<CenterProps> = ({
  title,
  status,
  messages,
  onSend,
  sending,
  onCancel,
  placeholder = 'Ask the workbench — an approval note, an Excel register, a P&ID trace, a twin scenario...',
  hideComposer = false,
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
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="msg-role">{m.role === 'user' ? 'operator' : 'outskirts'}</div>
            <div className="msg-body" style={!m.text ? { color: '#888' } : undefined}>
              {m.text || (m.status === 'running' ? 'Planning and executing…' : '')}

              {m.plan && m.plan.length > 0 && (
                <div className="pipeline">
                  {m.plan.map((s, i) => {
                    const st = m.stepStatus?.[s.stepId] ?? s.status ?? 'pending';
                    const cls = st === 'done' ? 'done' : st === 'running' ? 'running' : st === 'failed' || st === 'cancelled' ? 'error' : '';
                    return (
                      <div key={s.stepId} className={`pipeline-step ${cls}`}>
                        <span className="idx">{String(i + 1).padStart(2, '0')}</span>
                        <span>{s.description}</span>
                        <span className="state">{STATE_GLYPH[st] ?? st}</span>
                      </div>
                    );
                  })}
                </div>
              )}

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
