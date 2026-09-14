import type { StateCreator } from 'zustand';
import type { ReviewQueueEntry } from '../../types.js';

export interface ReviewSlice {
  reviewItems: ReviewQueueEntry[];
  selectedReviewId: string | null;

  setReviewItems: (items: ReviewQueueEntry[]) => void;
  selectReviewItem: (reviewId: string | null) => void;
  acknowledgeFreshness: (
    taskId: string,
    citationId: string,
    reviewerId: string,
  ) => void;
  approveDeliverable: (taskId: string, reviewerId: string) => void;
}

export const createReviewSlice: StateCreator<
  ReviewSlice,
  [],
  [],
  ReviewSlice
> = (set) => ({
  reviewItems: [],
  selectedReviewId: null,

  setReviewItems: (items) => set({ reviewItems: items }),

  selectReviewItem: (reviewId) => set({ selectedReviewId: reviewId }),

  acknowledgeFreshness: (taskId, citationId, reviewerId) =>
    set((state) => ({
      reviewItems: state.reviewItems.map((item) => {
        if (item.taskId !== taskId) return item;

        const updatedCitations = item.citations.map((c) =>
          c.citationId === citationId
            ? { ...c, acknowledgedBy: reviewerId, acknowledgedAt: new Date().toISOString() }
            : c,
        );

        const hasRemainingCritical = updatedCitations.some(
          (c) => c.stateAtCitation === 'CRITICAL' && !c.acknowledgedBy,
        );

        return {
          ...item,
          citations: updatedCitations,
          humanGateLocked: hasRemainingCritical,
          status: hasRemainingCritical ? 'blocked_on_freshness' : 'pending_review',
        };
      }),
    })),

  approveDeliverable: (taskId, reviewerId) =>
    set((state) => ({
      reviewItems: state.reviewItems.map((item) => {
        if (item.taskId !== taskId) return item;
        if (item.humanGateLocked) {
          throw new Error('Cannot approve: gate is locked on stale freshness citations');
        }
        return {
          ...item,
          status: 'approved',
          approvedBy: reviewerId,
          approvedAt: new Date().toISOString(),
        };
      }),
    })),
});
