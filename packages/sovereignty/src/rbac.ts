import type { AuditEvent, Id } from '@outskirts/schemas';
import type { AuditChain } from './chain.js';

export type UserRole = 'junior' | 'senior' | 'admin';

export type RbacAction =
  | 'task.create'
  | 'task.read'
  | 'task.cancel'
  | 'plugin.install'
  | 'plugin.enable'
  | 'mode.switch'
  | 'artifact.override'
  | 'audit.export';

export interface Principal {
  userId: Id;
  role: UserRole;
  projectIds?: string[];
}

export interface Resource {
  type: 'task' | 'plugin' | 'system' | 'artifact' | 'audit';
  id: string;
  ownerId?: Id;
}

export interface RbacContext {
  mode?: 'SOVEREIGN' | 'ASSIST';
  justification?: string;
}

export interface RbacDecision {
  allowed: boolean;
  role: UserRole;
  action: RbacAction;
  resource: Resource;
  reason?: string;
  refusalAuditEvent?: AuditEvent;
}

export class RbacRefusalError extends Error {
  constructor(
    public readonly action: RbacAction,
    public readonly role: UserRole,
    message: string,
  ) {
    super(`RBAC Refusal [${role} -> ${action}]: ${message}`);
    this.name = 'RbacRefusalError';
  }
}

/**
 * Cedar-compatible RBAC Evaluator.
 * Principle: Deny-by-default. Any action not explicitly permitted is forbidden.
 * Refusals are audited directly into the tamper-evident AuditChain (Section 2.3, Rule 3).
 */
export class RbacEvaluator {
  /**
   * Evaluate whether a principal is authorized to perform an action on a resource.
   * If refused, records the refusal as an `rbac.refusal` event in the audit chain.
   */
  public evaluate(
    principal: Principal,
    action: RbacAction,
    resource: Resource,
    context?: RbacContext,
    auditChain?: AuditChain,
  ): RbacDecision {
    const isPermitted = this.checkPolicy(principal, action, resource, context);

    if (isPermitted) {
      return {
        allowed: true,
        role: principal.role,
        action,
        resource,
      };
    }

    const reason = `Role "${principal.role}" is not permitted to perform "${action}" on resource "${resource.type}:${resource.id}"`;

    let refusalAuditEvent: AuditEvent | undefined;
    if (auditChain) {
      refusalAuditEvent = auditChain.append(
        'rbac.refusal',
        {
          userId: principal.userId,
          role: principal.role,
          action,
          resourceType: resource.type,
          resourceId: resource.id,
          reason,
          context: context ?? {},
        },
        { actorId: principal.userId },
      );
    }

    return {
      allowed: false,
      role: principal.role,
      action,
      resource,
      reason,
      refusalAuditEvent,
    };
  }

  public enforce(
    principal: Principal,
    action: RbacAction,
    resource: Resource,
    context?: RbacContext,
    auditChain?: AuditChain,
  ): void {
    const decision = this.evaluate(principal, action, resource, context, auditChain);
    if (!decision.allowed) {
      throw new RbacRefusalError(action, principal.role, decision.reason ?? 'Access denied');
    }
  }

  private checkPolicy(
    principal: Principal,
    action: RbacAction,
    resource: Resource,
    _context?: RbacContext,
  ): boolean {
    // Admin has full system permissions
    if (principal.role === 'admin') {
      return true;
    }

    // Senior engineer permissions
    if (principal.role === 'senior') {
      switch (action) {
        case 'task.create':
        case 'task.read':
        case 'task.cancel':
        case 'artifact.override':
        case 'plugin.enable':
        case 'mode.switch':
        case 'audit.export':
          return true;
        case 'plugin.install':
          // Installing new binary plugins requires admin role
          return false;
        default:
          return false;
      }
    }

    // Junior engineer permissions
    if (principal.role === 'junior') {
      switch (action) {
        case 'task.create':
        case 'task.read':
          return true;
        case 'task.cancel':
          // Junior may only cancel their own tasks
          return resource.ownerId === undefined || resource.ownerId === principal.userId;
        case 'mode.switch':
        case 'plugin.install':
        case 'plugin.enable':
        case 'artifact.override':
        case 'audit.export':
          // Forbidden for junior role
          return false;
        default:
          return false;
      }
    }

    // Deny by default
    return false;
  }
}
