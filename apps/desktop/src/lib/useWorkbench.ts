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
  model?: string;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
}

const STORAGE_KEY = 'outskirts.threads.v1';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
 * Drives the assistant: every message is first routed (conversation vs
 * pipeline). Conversation is answered in place; work goals create a task on
 * the gateway, stream the timeline over WebSocket, and resolve the assistant
 * message from the task's grounded result (artifact content + citations).
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

  /** The most recent completed task in the active thread — follow-up goals
   *  like "visualize this data" run against its dataset. */
  const recentTaskId = useCallback((): string | undefined => {
    const msgs = activeThread?.messages ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m && m.taskId && m.status && m.status !== 'running') return m.taskId;
    }
    return undefined;
  }, [activeThread]);

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

      const priorMessages = (threads.find((t) => t.id === threadId)?.messages ?? [])
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.text }));

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

      const startedAt = Date.now();

      try {
        // Route first: conversation stays conversation, work becomes a task.
        const routed = await api.assistant(
          [...priorMessages, { role: 'user' as const, content: trimmed }],
          recentTaskId(),
        );

        if (routed.mode === 'chat') {
          // Deterministic/instant replies still get a considered beat.
          await sleep(Math.max(0, 1100 - (Date.now() - startedAt)));
          update({
            text: routed.content ?? '',
            status: 'done',
            ...(routed.model ? { model: routed.model } : {}),
          });
          return;
        }

        const taskId = routed.taskId;
        const wsUrl = routed.wsUrl;
        if (!taskId || !wsUrl) {
          update({ status: 'error', error: 'Invalid task response from gateway', text: 'Pipeline error.' });
          return;
        }

        update({ taskId });

        let planReadyAt = 0;
        let planLen = 0;

        await new Promise<void>((resolve) => {
          let settled = false;
          let ws: WebSocket | undefined;
          const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            try {
              ws?.close();
            } catch {
              /* noop */
            }
            resolve();
          };

          try {
            ws = new WebSocket(wsUrl);
          } catch {
            finish();
            return;
          }
          sockets.current.push(ws);
          const timeout = setTimeout(finish, 120000);

          const applyEvent = (event: ServerEvent): void => {
            if (event.type === 'plan.ready') {
              // The gateway sends a Plan object { taskId, recipeId, steps }; the UI wants the steps array.
              const p = event.plan as PlanStep[] | { steps?: PlanStep[] } | undefined;
              const steps = Array.isArray(p) ? p : (p?.steps ?? []);
              planReadyAt = Date.now();
              planLen = steps.length;
              update({ plan: steps });
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
            }
          };

          let lastSeq = 0;
          ws.onmessage = (evt) => {
            try {
              const event = JSON.parse(evt.data as string) as ServerEvent;
              if (typeof event.seq === 'number') lastSeq = Math.max(lastSeq, event.seq);
              applyEvent(event);
              if (event.type === 'task.complete' || event.type === 'task.failed') {
                // The final step.update is emitted after task.complete; replay
                // everything past our last seq so no step is left hanging.
                clearTimeout(timeout);
                void (async () => {
                  try {
                    const { events } = await api.taskEvents(taskId, lastSeq);
                    for (const e of events) {
                      if (typeof e.seq === 'number') lastSeq = Math.max(lastSeq, e.seq);
                      applyEvent(e);
                    }
                  } catch {
                    /* replay is best-effort */
                  }
                  finish();
                })();
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

        // Pacing: let the step cascade finish and hold a short beat with all
        // steps settled before the deliverable lands. Never feels instant.
        const cascadeEnd = planReadyAt > 0 ? planReadyAt + planLen * 260 + 400 : 0;
        const target = Math.max(startedAt + 2200, cascadeEnd + 500, Date.now() + 600);
        await sleep(Math.max(0, target - Date.now()));

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
    [activeThreadId, threads, newThread, patchMessage, recentTaskId],
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
