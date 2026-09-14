import { create } from 'zustand';
import { createWorkbenchSlice, type WorkbenchSlice } from './slices/workbench.js';
import { createSovereigntySlice, type SovereigntySlice } from './slices/sovereignty.js';
import { createMarketplaceSlice, type MarketplaceSlice } from './slices/marketplace.js';
import { createAdminSlice, type AdminSlice } from './slices/admin.js';
import { createReviewSlice, type ReviewSlice } from './slices/review.js';

export type AppStore = WorkbenchSlice &
  SovereigntySlice &
  MarketplaceSlice &
  AdminSlice &
  ReviewSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createWorkbenchSlice(...a),
  ...createSovereigntySlice(...a),
  ...createMarketplaceSlice(...a),
  ...createAdminSlice(...a),
  ...createReviewSlice(...a),
}));
