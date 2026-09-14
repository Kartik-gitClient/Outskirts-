import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ArtifactInfo, type PlanStep, type ServerEvent } from './api.js';

export interface CitationInfo {
  documentId: string;
  decay?: number;
  state?: string;
  quote?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  taskId?: string;
  status?: 'running' | 'done' | 'error' | 'cancelled';
  plan?: PlanStep[];
  stepStatus?: Record<string, string>;
  artifacts?: ArtifactInfo[];
  citations?: CitationInfo[];
  verdict?: { gate: string; deterministicPass: boolean };
  error?: string;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
}

const STORAGE_KEY = 'outskirts.threads.v1';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Thread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Drives the real agent pipeline: creates a task on the gateway, streams the
 * timeline over the WebSocket, and resolves the assistant message from the
 * task's grounded result (artifact content + citations + artifacts).
 */
export function useWorkbench() {
  const [threads, setThreads] = useState<Thread[]>(() => loadThreads());
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(() => loadThreads()[0]?.id);
  const sockets = useRef<WebSocket[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(threads.slice(0, 40)));
    } catch {
      /* storage full/unavailable */
    }
  }, [threads]);

  useEffect(
    () => () => {
      for (const ws of sockets.current) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    },
    [],
  );

  const activeThread = threads.find((t) => t.id === activeThreadId);

  const newThread = useCallback((): string => {
    const id = uid();
    const thread: Thread = { id, title: 'New session', createdAt: new Date().toISOString(), messages: [] };
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(id);
    return id;
  }, []);

  const deleteThread = useCallback((id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const patchMessage = useCallback((threadId: string, messageId: string, patch: Partial<ChatMessage>) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id !== threadId
          ? t
          : { ...t, messages: t.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) },
      ),
    );
  }, []);

  const send = useCallback(
    async (goal: string) => {
      const trimmed = goal.trim();
      if (!trimmed) return;

      let threadId = activeThreadId;
      if (!threadId) threadId = newThread();

      const userMsg: ChatMessage = { id: uid(), role: 'user', text: trimmed, createdAt: new Date().toISOString() };
      const assistantMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text: '',
        createdAt: new Date().toISOString(),
        status: 'running',
      };

      setThreads((prev) =>
        prev.map((t) =>
          t.id !== threadId
            ? t
            : {
                ...t,
                title: t.messages.length === 0 ? trimmed.slice(0, 56) : t.title,
                messages: [...t.messages, userMsg, assistantMsg],
              },
        ),
      );

      const update = (patch: Partial<ChatMessage>) => patchMessage(threadId!, assistantMsg.id, patch);

      try {
        const { taskId } = await api.startTask(trimmed);
        update({ taskId });

        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            try {
              ws.close();
            } catch {
              /* noop */
            }
            resolve();
          };

          let ws: WebSocket;
          try {
            ws = new WebSocket(api.wsUrl(taskId));
          } catch {
            finish();
            return;
          }
          sockets.current.push(ws);
          const timeout = setTimeout(finish, 120000);

          ws.onmessage = (evt) => {
            try {
              const event = JSON.parse(evt.data as string) as ServerEvent;
              if (event.type === 'plan.ready') {
                update({ plan: event.plan as PlanStep[] });
              } else if (event.type === 'step.update') {
                setThreads((prev) =>
                  prev.map((t) => {
                    if (t.id !== threadId) return t;
                    return {
                      ...t,
                      messages: t.messages.map((m) => {
                        if (m.id !== assistantMsg.id) return m;
                        return {
                          ...m,
                          stepStatus: { ...(m.stepStatus ?? {}), [String(event.stepId)]: String(event.status) },
                        };
                      }),
                    };
                  }),
                );
              } else if (event.type === 'critic.verdict') {
                const v = event.verdict as { gate: string; deterministicPass: boolean };
                update({ verdict: { gate: v.gate, deterministicPass: v.deterministicPass } });
              } else if (event.type === 'task.complete' || event.type === 'task.failed') {
                clearTimeout(timeout);
                finish();
              }
            } catch {
              /* ignore malformed frame */
            }
          };
          ws.onerror = () => {
            clearTimeout(timeout);
            finish();
          };
          ws.onclose = () => {
            clearTimeout(timeout);
            finish();
          };
        });

        const result = await api.taskResult(taskId);
        const citations: CitationInfo[] = [];
        const dna = result as unknown as { dna?: { citations?: Array<Record<string, unknown>> } };
        for (const c of dna.dna?.citations ?? []) {
          citations.push({
            documentId: String(c['documentId'] ?? ''),
            ...(typeof c['decayAtCitation'] === 'number' ? { decay: c['decayAtCitation'] } : {}),
            ...(typeof c['stateAtCitation'] === 'string' ? { state: c['stateAtCitation'] } : {}),
            ...(typeof c['quote'] === 'string' ? { quote: c['quote'] } : {}),
          });
        }

        const text =
          result.artifactContent?.trim() ||
          `Task ${result.status}. ${result.stepsCompleted?.length ?? 0} steps completed.`;

        update({
          text,
          status: result.status === 'completed' ? 'done' : result.status === 'cancelled' ? 'cancelled' : 'error',
          artifacts: result.artifacts ?? [],
          citations,
        });
      } catch (err) {
        update({ status: 'error', error: err instanceof Error ? err.message : String(err), text: 'Pipeline error.' });
      }
    },
    [activeThreadId, newThread, patchMessage],
  );

  return {
    threads,
    activeThread,
    activeThreadId,
    setActiveThreadId,
    newThread,
    deleteThread,
    send,
  };
}
