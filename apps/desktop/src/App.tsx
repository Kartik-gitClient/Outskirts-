import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ArtifactInfo, type HealthReport, type ModelEntry, type Notification } from './lib/api.js';
import { useWorkbench } from './lib/useWorkbench.js';
import { Sidebar } from './components/Sidebar.js';
import { WorkbenchCenter } from './components/WorkbenchCenter.js';
import { InspectorPanel } from './components/InspectorPanel.js';
import { MachineSimulation } from './components/MachineSimulation.js';
import { BlueprintMesh } from './components/BlueprintMesh.js';
import { AdminWindow } from './components/AdminWindow.js';
import { Splitter, clampWidth, storedWidth, storeWidth } from './components/Splitter.js';

type View = 'workbench' | 'machine' | 'blueprint';

export const App: React.FC = () => {
  const [view, setView] = useState<View>('workbench');
  const [mode, setModeState] = useState<'SOVEREIGN' | 'ASSIST'>('SOVEREIGN');
  const [providers, setProviders] = useState<HealthReport[]>([]);
  const [nimModel, setNimModel] = useState('nim');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [preferredModel, setPreferredModelState] = useState<string | null>(null);
  const modeInitialised = useRef(false);

  // Resizable pane widths (persisted across sessions).
  const [sidebarW, setSidebarW] = useState(() => storedWidth('outskirts.pane.sidebar', 240));
  const [inspectorW, setInspectorW] = useState(() => storedWidth('outskirts.pane.inspector', 360));
  const workspaceRef = useRef<HTMLDivElement>(null);

  const wb = useWorkbench();

  const refresh = useCallback(async () => {
    try {
      const p = await api.providers();
      setProviders(p.providers);
      setNimModel(p.nimModel);
      if (!modeInitialised.current) {
        setModeState(p.mode === 'ASSIST' ? 'ASSIST' : 'SOVEREIGN');
        modeInitialised.current = true;
      }
    } catch {
      /* gateway offline */
    }
    try {
      const m = await api.models();
      setModels(m.models);
      setPreferredModelState(m.preferredModel ?? null);
    } catch {
      /* gateway offline */
    }
    try {
      setNotifications((await api.notifications()).notifications);
    } catch {
      /* gateway offline */
    }
    try {
      setArtifacts((await api.allArtifacts()).artifacts);
    } catch {
      /* gateway offline */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 20000);
    return () => clearInterval(id);
  }, [refresh]);

  const changeMode = useCallback(
    async (next: 'SOVEREIGN' | 'ASSIST') => {
      setModeState(next);
      try {
        await api.setMode(next);
      } catch {
        /* keep optimistic state */
      }
    },
    [],
  );

  const configureNim = useCallback(async (key: string) => {
    if (!key.trim()) return;
    try {
      await api.configureNim(key);
      await refresh();
    } catch {
      /* surfaced by provider health */
    }
  }, [refresh]);

  const active = wb.activeThread;
  const lastAssistant = [...(active?.messages ?? [])].reverse().find((m) => m.role === 'assistant');
  const sending = lastAssistant?.status === 'running';
  const criticalCount = notifications.filter((n) => n.severity === 'critical').length;

  // Artifacts of THIS thread only — the inspector is chat-scoped.
  const threadArtifacts = useMemo(() => {
    const seen = new Set<string>();
    const list: ArtifactInfo[] = [];
    for (const m of active?.messages ?? []) {
      for (const a of m.artifacts ?? []) {
        if (!seen.has(a.artifactId)) {
          seen.add(a.artifactId);
          list.push(a);
        }
      }
    }
    return list;
  }, [active]);

  const gatewayUp = providers.length > 0;

  // All enabled models are listed in both modes; an outside-perimeter pick
  // opens the perimeter (the gateway switches to ASSIST and audits it).
  const chatModels = useMemo(() => models.filter((m) => m.status === 'enabled'), [models]);

  const onlineProviders = useMemo(
    () => providers.filter((p) => p.healthy).map((p) => p.providerId),
    [providers],
  );

  const pickModel = useCallback(async (modelId: string | null) => {
    try {
      const r = await api.setPreferredModel(modelId ?? '');
      setPreferredModelState(r.preferredModel ?? null);
      // picking an outside-perimeter model opens the perimeter — sync the toggle
      if (r.mode === 'ASSIST' || r.mode === 'SOVEREIGN') setModeState(r.mode);
    } catch {
      /* keep current selection */
    }
  }, []);

  const resizeSidebar = useCallback((dx: number) => {
    setSidebarW((w) => {
      const next = clampWidth(w + dx, 200, 420);
      storeWidth('outskirts.pane.sidebar', next);
      return next;
    });
  }, []);

  const resizeInspector = useCallback((dx: number) => {
    setInspectorW((w) => {
      const next = clampWidth(w - dx, 280, 560);
      storeWidth('outskirts.pane.inspector', next);
      return next;
    });
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo">OUTSKIRTS</span>
          <span className="brand-sub">the sovereign ai workbench</span>
        </div>

        <div className="mode-toggle">
          <button className={view === 'workbench' ? 'active' : ''} onClick={() => setView('workbench')}>
            workbench
          </button>
          <button className={view === 'machine' ? 'active' : ''} onClick={() => setView('machine')}>
            machine simulation
          </button>
          <button className={view === 'blueprint' ? 'active' : ''} onClick={() => setView('blueprint')}>
            blueprint mesh
          </button>
        </div>

        <div className="topbar-status">
          {criticalCount > 0 && (
            <span className={`badge bad`} title="data decay alerts">
              {criticalCount} decay
            </span>
          )}
          <button className="admin-btn" onClick={() => setAdminOpen(true)} title="gateway, providers, perimeter mode">
            <span className={`dot ${gatewayUp ? '' : 'off'}`} />
            admin
          </button>
        </div>
      </header>

      <div
        ref={workspaceRef}
        className={`workspace ${view === 'workbench' ? 'with-inspector' : ''}`}
      >
        <div className="pane-col pane-side" style={{ width: sidebarW, flexShrink: 0 }}>
          <Sidebar
            threads={wb.threads}
            {...(wb.activeThreadId ? { activeThreadId: wb.activeThreadId } : {})}
            onSelectThread={wb.setActiveThreadId}
            onNewThread={wb.newThread}
            onDeleteThread={wb.deleteThread}
            notifications={notifications}
            mode={mode}
            onModeChange={(m) => void changeMode(m)}
            providers={providers}
            onUseConnector={(prompt) => {
              setView('workbench');
              void wb.send(prompt);
            }}
          />
        </div>

        {view === 'workbench' && (
          <>
            <Splitter onDelta={resizeSidebar} />
            <div className="pane-col" style={{ flex: 1, minWidth: 0 }}>
              <WorkbenchCenter
                title={active?.title ?? 'New session'}
                status={sending ? 'executing pipeline' : `${active?.messages.length ?? 0} messages`}
                messages={active?.messages ?? []}
                onSend={(text) => void wb.send(text)}
                sending={sending}
                {...(lastAssistant?.taskId
                  ? { onCancel: () => void api.cancelTask(lastAssistant.taskId!).catch(() => undefined) }
                  : {})}
                availableModels={chatModels}
                onlineProviders={onlineProviders}
                preferredModel={preferredModel}
                onPickModel={(m) => void pickModel(m)}
              />
            </div>
            <Splitter onDelta={resizeInspector} />
            <div className="pane-col" style={{ width: inspectorW, flexShrink: 0 }}>
              <InspectorPanel
                {...(lastAssistant ? { message: lastAssistant } : {})}
                allArtifacts={threadArtifacts}
                notificationsCount={criticalCount}
              />
            </div>
          </>
        )}

        {view === 'machine' && (
          <>
            <Splitter onDelta={resizeSidebar} />
            <MachineSimulation aiReady={providers.some((p) => p.healthy)} />
          </>
        )}
        {view === 'blueprint' && (
          <>
            <Splitter onDelta={resizeSidebar} />
            <BlueprintMesh />
          </>
        )}
      </div>

      {adminOpen && (
        <AdminWindow
          onClose={() => setAdminOpen(false)}
          mode={mode}
          onModeChange={(m) => void changeMode(m)}
          providers={providers}
          nimModel={nimModel}
          onConfigureNim={configureNim}
        />
      )}
    </div>
  );
};

export default App;
