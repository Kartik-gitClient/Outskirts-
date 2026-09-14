import React from 'react';
import { useAppStore } from '../store/index.js';

interface FreshnessBannerProps {
  onNavigateToReview: () => void;
}

export const FreshnessBanner: React.FC<FreshnessBannerProps> = ({
  onNavigateToReview,
}) => {
  const reviewItems = useAppStore((s) => s.reviewItems);
  const blockedItem = reviewItems.find((i) => i.humanGateLocked);

  if (!blockedItem) {
    return null;
  }

  const criticalCitations = blockedItem.citations.filter(
    (c) => c.stateAtCitation === 'CRITICAL' && !c.acknowledgedBy,
  );

  return (
    <div className="freshness-banner">
      <div className="banner-content">
        <span className="banner-icon">⚠️</span>
        <div className="banner-text">
          <strong>FRESHNESS POLICY VIOLATION (C5 GATE LOCKED):</strong>
          <span>
            Task &ldquo;{blockedItem.taskId}&rdquo; carries {criticalCitations.length} unacknowledged CRITICAL stale citation(s). Human approval gate is locked.
          </span>
        </div>
      </div>
      <button className="banner-action-btn" onClick={onNavigateToReview}>
        Review &amp; Acknowledge &rarr;
      </button>
    </div>
  );
};
