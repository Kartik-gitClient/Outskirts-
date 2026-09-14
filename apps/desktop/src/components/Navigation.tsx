import React from 'react';
import type { ScreenTab } from '../types.js';
import { useAppStore } from '../store/index.js';

interface NavigationProps {
  currentTab: ScreenTab;
  onSelectTab: (tab: ScreenTab) => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
}) => {
  const mode = useAppStore((s) => s.mode);
  const egressCount = useAppStore((s) => s.egressPacketCount);
  const alertsCount = useAppStore((s) => s.alerts.length);

  const tabs: Array<{ id: ScreenTab; label: string; badge?: number | string }> = [
    { id: 'workbench', label: 'Workbench' },
    { id: 'blueprint', label: '⚡ Blueprint Mesh' },
    { id: 'sovereignty', label: 'Sovereignty Dashboard', badge: alertsCount > 0 ? `${alertsCount} alerts` : undefined },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'admin', label: 'Admin Console' },
    { id: 'review', label: 'Review Queue' },
  ];

  return (
    <header className="navbar">
      <div className="navbar-brand">
        <span className="brand-logo">OUTSKIRTS</span>
        <span className="brand-subtitle">The Sovereign AI Workbench</span>
      </div>

      <nav className="navbar-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${currentTab === t.id ? 'active' : ''}`}
            onClick={() => onSelectTab(t.id)}
          >
            {t.label}
            {t.badge && <span className="tab-badge">{t.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="navbar-status">
        <div className={`mode-badge ${mode.toLowerCase()}`}>
          <span className="status-dot" />
          {mode}
        </div>
        <div className="egress-pill">
          <span className="pill-label">Egress:</span>
          <span className="pill-value">{egressCount} packets leaked</span>
        </div>
      </div>
    </header>
  );
};
