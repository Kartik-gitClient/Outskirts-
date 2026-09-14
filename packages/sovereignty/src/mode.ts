import type { KeyObject } from 'node:crypto';
import type {
  AuditEvent,
  ChainAnchor,
  Id,
  Locality,
  PalAuditEvent,
  ProviderMode,
  TrustBoundary,
} from '@outskirts/schemas';
import type { AuditChain } from './chain.js';

export interface ModeTransitionResult {
  previousMode: ProviderMode;
  currentMode: ProviderMode;
  auditEvent: AuditEvent;
  anchor: ChainAnchor;
}

/**
 * Persisted system state machine for dual-mode operation (SOVEREIGN / ASSIST).
 * Principles 1 & 4: Sovereignty is provable; dual-mode is a guarded, audited transition.
 * Transitions immediately emit an audit event and create an Ed25519-signed anchor.
 */
export class ModeStateMachine {
  private _mode: ProviderMode = 'SOVEREIGN';

  constructor(initialMode: ProviderMode = 'SOVEREIGN') {
    this._mode = initialMode;
  }

  public get mode(): ProviderMode {
    return this._mode;
  }

  public transitionTo(
    newMode: ProviderMode,
    reason: string,
    actorId: Id,
    auditChain: AuditChain,
    keyId: string,
    signingKey: string | KeyObject,
  ): ModeTransitionResult {
    const previousMode = this._mode;
    this._mode = newMode;

    // 1. Emit audit event at the exact moment of transition
    const auditEvent = auditChain.append(
      'mode.transition',
      {
        fromMode: previousMode,
        toMode: newMode,
        reason,
        actorId,
      },
      { actorId },
    );

    // 2. Section 11.3: Signed anchor at every mode transition
    const anchor = auditChain.createAnchor(keyId, signingKey, {
      anchorId: `anchor-mode-transition-${Date.now()}`,
    });

    return {
      previousMode,
      currentMode: newMode,
      auditEvent,
      anchor,
    };
  }
}

export interface DashboardMetrics {
  currentMode: ProviderMode;
  totalModelCalls: number;
  cacheHits: number;
  insidePerimeterCalls: number;
  outsidePerimeterCalls: number;
  insidePerimeterPercentage: number;
  callsByLocality: Record<Locality, number>;
  tokensInside: { in: number; out: number; total: number };
  tokensOutside: { in: number; out: number; total: number };
  guardAlerts: number;
  blockedEgressCount: number;
  rbacRefusalCount: number;
  totalAuditEvents: number;
  totalAnchors: number;
}

/**
 * Live projection of the audit event stream onto the Sovereignty Dashboard.
 * Principle 1: Proof cannot drift from reality because dashboard is a projection of the audit stream.
 * Cache hits render differently and are excluded from model call counts (Section 5.2).
 */
export function projectSovereigntyDashboard(
  events: readonly AuditEvent[],
  anchors: readonly ChainAnchor[],
  currentMode: ProviderMode = 'SOVEREIGN',
): DashboardMetrics {
  const callsByLocality: Record<Locality, number> = {
    'in-process': 0,
    loopback: 0,
    lan: 0,
    internet: 0,
  };

  let totalModelCalls = 0;
  let cacheHits = 0;
  let insidePerimeterCalls = 0;
  let outsidePerimeterCalls = 0;
  const tokensInside = { in: 0, out: 0, total: 0 };
  const tokensOutside = { in: 0, out: 0, total: 0 };
  let guardAlerts = 0;
  let blockedEgressCount = 0;
  let rbacRefusalCount = 0;

  for (const evt of events) {
    if (evt.kind === 'pal.call') {
      const payload = evt.payload as Partial<PalAuditEvent>;
      const isCacheHit = payload.cacheHit === true;

      if (isCacheHit) {
        cacheHits++;
        // Excluded from model call counts per Section 5.2
        continue;
      }

      totalModelCalls++;

      const locality = (payload.locality as Locality) ?? 'loopback';
      callsByLocality[locality] = (callsByLocality[locality] ?? 0) + 1;

      const boundary = (payload.trustBoundary as TrustBoundary) ?? 'inside-perimeter';
      const tIn = typeof payload.tokensIn === 'number' ? payload.tokensIn : 0;
      const tOut = typeof payload.tokensOut === 'number' ? payload.tokensOut : 0;

      if (boundary === 'inside-perimeter') {
        insidePerimeterCalls++;
        tokensInside.in += tIn;
        tokensInside.out += tOut;
        tokensInside.total += tIn + tOut;
      } else {
        outsidePerimeterCalls++;
        tokensOutside.in += tIn;
        tokensOutside.out += tOut;
        tokensOutside.total += tIn + tOut;
      }
    } else if (evt.kind === 'guard.alert') {
      guardAlerts++;
      const detail = String(evt.payload?.['detail'] ?? evt.payload?.['reason'] ?? '');
      if (detail.includes('egress') || evt.payload?.['kind'] === 'egress-blocked') {
        blockedEgressCount++;
      }
    } else if (evt.kind === 'rbac.refusal') {
      rbacRefusalCount++;
    }
  }

  const insidePerimeterPercentage =
    totalModelCalls === 0 ? 100 : (insidePerimeterCalls / totalModelCalls) * 100;

  return {
    currentMode,
    totalModelCalls,
    cacheHits,
    insidePerimeterCalls,
    outsidePerimeterCalls,
    insidePerimeterPercentage: Number(insidePerimeterPercentage.toFixed(1)),
    callsByLocality,
    tokensInside,
    tokensOutside,
    guardAlerts,
    blockedEgressCount,
    rbacRefusalCount,
    totalAuditEvents: events.length,
    totalAnchors: anchors.length,
  };
}
