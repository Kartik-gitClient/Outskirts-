import type { StateCreator } from 'zustand';
import type { GuardAlert, ProviderMode } from '@outskirts/schemas';
import type { LocalityLogEntry } from '../../types.js';

export interface SovereigntySlice {
  mode: ProviderMode;
  egressPacketCount: number;
  localityCounts: {
    loopback: number;
    lan: number;
    wan: number;
  };
  localityLogs: LocalityLogEntry[];
  alerts: GuardAlert[];

  setMode: (mode: ProviderMode) => void;
  recordLocalityCall: (entry: LocalityLogEntry) => void;
  recordAlert: (alert: GuardAlert) => void;
  clearAlerts: () => void;
}

export const createSovereigntySlice: StateCreator<
  SovereigntySlice,
  [],
  [],
  SovereigntySlice
> = (set) => ({
  mode: 'SOVEREIGN',
  egressPacketCount: 0,
  localityCounts: {
    loopback: 0,
    lan: 0,
    wan: 0,
  },
  localityLogs: [],
  alerts: [],

  setMode: (mode) => set({ mode }),

  recordLocalityCall: (entry) =>
    set((state) => {
      const counts = { ...state.localityCounts };
      if (entry.locality === 'loopback') counts.loopback++;
      else if (entry.locality === 'lan') counts.lan++;
      else if (entry.locality === 'wan') counts.wan++;

      return {
        localityCounts: counts,
        localityLogs: [entry, ...state.localityLogs.slice(0, 49)],
      };
    }),

  recordAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts],
    })),

  clearAlerts: () => set({ alerts: [] }),
});
