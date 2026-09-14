import type { StateCreator } from 'zustand';
import type { PluginRecord } from '@outskirts/schemas';

export interface MarketplaceSlice {
  plugins: PluginRecord[];
  selectedPluginId: string | null;

  setPlugins: (plugins: PluginRecord[]) => void;
  selectPlugin: (pluginId: string | null) => void;
  togglePluginEnabled: (pluginId: string, enabled: boolean) => void;
}

export const createMarketplaceSlice: StateCreator<
  MarketplaceSlice,
  [],
  [],
  MarketplaceSlice
> = (set) => ({
  plugins: [],
  selectedPluginId: null,

  setPlugins: (plugins) => set({ plugins }),

  selectPlugin: (pluginId) => set({ selectedPluginId: pluginId }),

  togglePluginEnabled: (pluginId, enabled) =>
    set((state) => ({
      plugins: state.plugins.map((p) =>
        p.manifest.id === pluginId ? { ...p, enabled } : p,
      ),
    })),
});
