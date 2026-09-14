import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ArtifactInfo, type HealthReport, type Notification } from './lib/api.js';
import { useWorkbench } from './lib/useWorkbench.js';
import { Sidebar } from './components/Sidebar.js';
import { WorkbenchCenter } from './components/WorkbenchCenter.js';
import { InspectorPanel } from './components/InspectorPanel.js';
import { MachineSimulation } from './components/MachineSimulation.js';
import { BlueprintMesh } from './components/BlueprintMesh.js';

type View = 'workbench' | 'machine' | 'blueprint';

export const App: React.FC = () => {
  const [view, setView] = useState<View>('workbench');
  const [mode, setModeState] = useState<'SOVEREIGN' | 'ASSIST'>('SOVEREIGN');
  const [providers, setProviders] = useState<HealthReport[]>([]);
  const [nimModel, setNimModel] = useState('nim');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const modeInitialised = useRef(false);

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

  const gatewayUp = providers.length > 0;
  const ollamaUp = providers.find((p) => p.providerId === 'ollama')?.healthy ?? false;
  const nimUp = providers.find((p) => p.providerId === 'nim')?.healthy ?? false;

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
          <span className="status-chip">
            <span className={`dot ${gatewayUp ? '' : 'off'}`} />
            gateway
          </span>
          <span className="status-chip" title="local sovereign inference (Ollama)">
            <span className={`dot ${ollamaUp ? '' : 'off'}`} />
            local llm
          </span>
          <span className="status-chip" title="NVIDIA NIM assist provider (outside perimeter)">
            <span className={`dot ${nimUp ? '' : 'off'}`} />
            nim assist
          </span>
          <span className={`status-chip`} title="perimeter mode">
            <span className={`dot ${mode === 'SOVEREIGN' ? '' : 'warn'}`} />
            {mode}
          </span>
        </div>
      </header>

      <div className={`workspace ${view === 'workbench' ? 'with-inspector' : ''}`}>
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
          onConfigureNim={configureNim}
          nimModel={nimModel}
        />

        {view === 'workbench' && (
          <>
            <WorkbenchCenter
              title={active?.title ?? 'New session'}
              status={sending ? 'executing pipeline' : `${active?.messages.length ?? 0} messages`}
              messages={active?.messages ?? []}
              onSend={(text) => void wb.send(text)}
              sending={sending}
              {...(lastAssistant?.taskId
                ? { onCancel: () => void api.cancelTask(lastAssistant.taskId!).catch(() => undefined) }
                : {})}
            />
            <InspectorPanel
              {...(lastAssistant ? { message: lastAssistant } : {})}
              allArtifacts={artifacts}
              notificationsCount={criticalCount}
            />
          </>
        )}

        {view === 'machine' && <MachineSimulation />}
        {view === 'blueprint' && <BlueprintMesh />}
      </div>
    </div>
  );
};

export default App;
