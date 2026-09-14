import { randomUUID } from 'node:crypto';
import type { BBox, Citation, Id } from '@outskirts/schemas';
import type { AuditChain } from '@outskirts/sovereignty';

export interface ReviewItem {
  reviewId: string;
  taskId: Id;
  deliverableId: string;
  title: string;
  status: 'pending_review' | 'blocked_on_freshness' | 'approved' | 'rejected';
  humanGateLocked: boolean;
  citations: Citation[];
  regionLinks: Array<{ tagNumber: string; bbox: BBox }>;
  approvedBy?: Id;
  approvedAt?: string;
  acknowledgements: Map<string, { reviewerId: Id; acknowledgedAt: string; note?: string }>;
}

export class ReviewQueue {
  private items = new Map<string, ReviewItem>();

  constructor(private auditChain?: AuditChain) {}

  public submitForReview(options: {
    taskId: Id;
    deliverableId: string;
    title: string;
    citations: Citation[];
    regionLinks?: Array<{ tagNumber: string; bbox: BBox }>;
  }): ReviewItem {
    const reviewId = `rev-${randomUUID().slice(0, 8)}`;
    const hasCritical = options.citations.some((c) => c.stateAtCitation === 'CRITICAL');
    const humanGateLocked = hasCritical;

    const item: ReviewItem = {
      reviewId,
      taskId: options.taskId,
      deliverableId: options.deliverableId,
      title: options.title,
      status: humanGateLocked ? 'blocked_on_freshness' : 'pending_review',
      humanGateLocked,
      citations: options.citations,
      regionLinks: options.regionLinks ?? [],
      acknowledgements: new Map(),
    };

    this.items.set(options.taskId, item);
    return item;
  }

  public getItem(taskId: Id): ReviewItem | undefined {
    return this.items.get(taskId);
  }

  public listItems(): ReviewItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Human reviewer acknowledges a CRITICAL stale citation, supplying required rationale.
   * Unlocks the human approval gate once all CRITICAL citations are acknowledged.
   */
  public acknowledgeFreshness(
    taskId: Id,
    citationId: Id,
    reviewerId: Id,
    note: string,
  ): ReviewItem {
    const item = this.items.get(taskId);
    if (!item) {
      throw new Error(`Review item for task "${taskId}" not found`);
    }

    const citation = item.citations.find((c) => c.citationId === citationId);
    if (!citation) {
      throw new Error(`Citation "${citationId}" not found in review item`);
    }

    const acknowledgedAt = new Date().toISOString();
    item.acknowledgements.set(citationId, { reviewerId, acknowledgedAt, note });

    // Update citation in-place
    citation.acknowledgedBy = reviewerId;
    citation.acknowledgedAt = acknowledgedAt;

    // Check if any unacknowledged CRITICAL citation remains
    const remainingCritical = item.citations.filter(
      (c) => c.stateAtCitation === 'CRITICAL' && !item.acknowledgements.has(c.citationId),
    );

    if (remainingCritical.length === 0) {
      item.humanGateLocked = false;
      item.status = 'pending_review';
    }

    if (this.auditChain) {
      this.auditChain.append(
        'human.override',
        {
          action: 'acknowledge_freshness',
          taskId,
          citationId,
          documentId: citation.documentId,
          reviewerId,
          note,
        },
        { taskId, actorId: reviewerId },
      );
    }

    return item;
  }

  /**
   * Approve deliverable. Strictly blocked if humanGateLocked is true.
   */
  public approve(taskId: Id, reviewerId: Id): ReviewItem {
    const item = this.items.get(taskId);
    if (!item) {
      throw new Error(`Review item for task "${taskId}" not found`);
    }

    if (item.humanGateLocked) {
      throw new Error(
        `Human approval gate is LOCKED: Task "${taskId}" carries unacknowledged CRITICAL stale citations. Reviewer must acknowledge before approval can proceed.`,
      );
    }

    item.status = 'approved';
    item.approvedBy = reviewerId;
    item.approvedAt = new Date().toISOString();

    if (this.auditChain) {
      this.auditChain.append(
        'human.override',
        {
          action: 'approve_deliverable',
          taskId,
          deliverableId: item.deliverableId,
          reviewerId,
        },
        { taskId, actorId: reviewerId },
      );
    }

    return item;
  }
}
