import type { StateCreator } from 'zustand';
import type { RegistryEntry } from '@outskirts/schemas';

export interface AdminSlice {
  models: RegistryEntry[];
  activeUserRole: 'junior' | 'senior' | 'admin';
  rbacMatrix: Array<{
    role: 'junior' | 'senior' | 'admin';
    allowedActions: string[];
  }>;

  setModels: (models: RegistryEntry[]) => void;
  setUserRole: (role: 'junior' | 'senior' | 'admin') => void;
  setModelStatus: (modelId: string, status: 'enabled' | 'disabled' | 'untested') => void;
}

export const createAdminSlice: StateCreator<
  AdminSlice,
  [],
  [],
  AdminSlice
> = (set) => ({
  models: [],
  activeUserRole: 'admin',
  rbacMatrix: [
    { role: 'junior', allowedActions: ['task.read', 'task.create', 'task.cancel'] },
    { role: 'senior', allowedActions: ['task.read', 'task.create', 'task.cancel', 'mode.switch', 'artifact.override'] },
    { role: 'admin', allowedActions: ['task.*', 'plugin.install', 'plugin.enable', 'mode.switch', 'audit.export'] },
  ],

  setModels: (models) => set({ models }),

  setUserRole: (role) => set({ activeUserRole: role }),

  setModelStatus: (modelId, status) =>
    set((state) => ({
      models: state.models.map((m) => (m.modelId === modelId ? { ...m, status } : m)),
    })),
});
