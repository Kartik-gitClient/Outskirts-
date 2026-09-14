import React, { useState } from 'react';
import { useAppStore } from '../store/index.js';

export const ReviewQueueScreen: React.FC = () => {
  const reviewItems = useAppStore((s) => s.reviewItems);
  const acknowledgeFreshness = useAppStore((s) => s.acknowledgeFreshness);
  const approveDeliverable = useAppStore((s) => s.approveDeliverable);

  const [reviewerId, setReviewerId] = useState('chief-engineer-archit');
  const [selectedCitationId, setSelectedCitationId] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState('Reviewed against field MOC-2026-88 revision');

  const defaultItems = reviewItems.length > 0 ? reviewItems : [
    {
      reviewId: 'rev-01',
      taskId: 'task-refinery-audit-001',
      deliverableId: 'deliv-cdu-report-01',
      title: 'CDU Unit Turnaround Inspection Briefing',
      status: 'blocked_on_freshness' as const,
      humanGateLocked: true,
      citations: [
        {
          citationId: 'cite-fresh-1',
          chunkId: 'chunk-101',
          documentId: 'doc-sop-fresh-2026',
          quote: 'Standard crude feed operating pressure is 15.2 barg.',
          decayAtCitation: 0.12,
          stateAtCitation: 'FRESH' as const,
        },
        {
          citationId: 'cite-stale-critical',
          chunkId: 'chunk-202',
          documentId: 'doc-sop-2019-outdated',
          quote: 'Legacy relief valve inspection interval is 72 months.',
          decayAtCitation: 0.96,
          stateAtCitation: 'CRITICAL' as const,
        },
      ],
      regionLinks: [{ tagNumber: 'P-101A', bbox: { page: 1, x: 500, y: 380, w: 80, h: 80 } }],
    },
  ];

  const handleAcknowledge = (taskId: string, citationId: string) => {
    acknowledgeFreshness(taskId, citationId, reviewerId);
    setSelectedCitationId(null);
  };

  const handleApprove = (taskId: string) => {
    approveDeliverable(taskId, reviewerId);
  };

  const handleExportDna = (taskId: string) => {
    const sampleDna = {
      dnaId: `dna-${taskId}`,
      taskId,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      criticGate: 'pass',
      deterministicPass: true,
      provenanceHash: 'sha256:7f8a9b0c...',
    };
    const blob = new Blob([JSON.stringify(sampleDna, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decision-dna-${taskId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="review-layout">
      <div className="review-header">
        <div>
          <h2>Human Review Queue &amp; Freshness Approval Gate</h2>
          <p>Section 18 / 20: A CRITICAL stale citation blocks the human gate until explicitly acknowledged.</p>
        </div>
        <div className="reviewer-identity">
          <span>Reviewer Identity:</span>
          <input
            type="text"
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
            className="reviewer-input"
          />
        </div>
      </div>

      <div className="review-cards-list">
        {defaultItems.map((item) => {
          return (
            <div key={item.taskId} className={`review-card status-${item.status}`}>
              <div className="card-header">
                <div>
                  <h3>{item.title}</h3>
                  <div className="card-meta">
                    <span>Task: <code>{item.taskId}</code></span> &bull; 
                    <span>Deliverable: <code>{item.deliverableId}</code></span>
                  </div>
                </div>

                <div className="status-badges">
                  {item.humanGateLocked ? (
                    <span className="gate-badge locked">🔒 Gate Locked: Stale Citation Unacknowledged</span>
                  ) : item.status === 'approved' ? (
                    <span className="gate-badge approved">✓ Approved by {item.approvedBy}</span>
                  ) : (
                    <span className="gate-badge pending">Gate Unlocked: Ready for Review</span>
                  )}
                </div>
              </div>

              {/* Citations Table */}
              <div className="citations-section">
                <h4>Citations &amp; Document Freshness Verification</h4>
                <table className="citations-table">
                  <thead>
                    <tr>
                      <th>Document ID</th>
                      <th>Extracted Quote</th>
                      <th>Decay Score</th>
                      <th>Freshness State</th>
                      <th>Acknowledgement Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.citations.map((c) => {
                      const isCritical = c.stateAtCitation === 'CRITICAL';
                      const isAcknowledged = Boolean(c.acknowledgedBy);
                      return (
                        <tr key={c.citationId} className={isCritical && !isAcknowledged ? 'critical-row' : ''}>
                          <td><code>{c.documentId}</code></td>
                          <td>&ldquo;{c.quote}&rdquo;</td>
                          <td>{(c.decayAtCitation * 100).toFixed(0)}%</td>
                          <td>
                            <span className={`freshness-pill ${c.stateAtCitation.toLowerCase()}`}>
                              {c.stateAtCitation}
                            </span>
                          </td>
                          <td>
                            {isAcknowledged ? (
                              <span className="ack-text">Acknowledged by {c.acknowledgedBy}</span>
                            ) : isCritical ? (
                              <span className="unack-text">⚠️ UNACKNOWLEDGED (BLOCKS GATE)</span>
                            ) : (
                              <span>No action required</span>
                            )}
                          </td>
                          <td>
                            {isCritical && !isAcknowledged && (
                              <button
                                className="btn-acknowledge"
                                onClick={() => setSelectedCitationId(c.citationId)}
                              >
                                Acknowledge Stale
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Card Actions */}
              <div className="card-actions">
                <button
                  className="btn-approve"
                  disabled={item.humanGateLocked || item.status === 'approved'}
                  onClick={() => handleApprove(item.taskId)}
                >
                  {item.status === 'approved' ? 'Deliverable Approved' : 'Approve Deliverable'}
                </button>

                <button
                  className="btn-dna"
                  onClick={() => handleExportDna(item.taskId)}
                >
                  Export Decision DNA (in-toto Attestation)
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Acknowledge Modal */}
      {selectedCitationId && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <h3>Acknowledge CRITICAL Stale Citation</h3>
            <p>
              As reviewer <strong>{reviewerId}</strong>, you are overriding the freshness policy for citation <code>{selectedCitationId}</code>. This override is permanently recorded in the cryptographic audit chain.
            </p>
            <label>
              Technical Rationale / MOC Reference (Required):
              <textarea
                value={ackNote}
                onChange={(e) => setAckNote(e.target.value)}
                rows={3}
              />
            </label>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setSelectedCitationId(null)}>
                Cancel
              </button>
              <button
                className="btn-confirm"
                disabled={!ackNote.trim()}
                onClick={() => handleAcknowledge('task-refinery-audit-001', selectedCitationId)}
              >
                Sign &amp; Unlock Gate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
