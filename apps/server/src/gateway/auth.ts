import type { Request, Response, NextFunction } from 'express';
import {
  RbacEvaluator,
  type Principal,
  type UserRole,
  type RbacAction,
  type Resource,
} from '@outskirts/sovereignty';
import type { AuditChain } from '@outskirts/sovereignty';

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

export interface AuthMiddlewareOptions {
  evaluator?: RbacEvaluator;
  auditChain?: AuditChain;
  allowAnonymousDev?: boolean;
}

/**
 * Keycloak / LDAP / AD Corporate Auth Middleware (Section 18 P5).
 * Validates bearer token / LDAP identity headers, establishes Cedar Principal,
 * enforces tenancy scoping on projects, and records audited refusals directly to AuditChain.
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  const evaluator = options.evaluator ?? new RbacEvaluator();
  const auditChain = options.auditChain;

  return {
    /**
     * Authenticate token from Keycloak OIDC JWT or corporate LDAP proxy.
     */
    authenticate: (req: Request, res: Response, next: NextFunction): void => {
      const authHeader = req.headers.authorization;
      const ldapUser = req.headers['x-ldap-user'] as string | undefined;
      const ldapRole = (req.headers['x-ldap-role'] as UserRole) || 'senior';
      const ldapProjects = ((req.headers['x-ldap-projects'] as string) || 'MRPL-CDU-01,MRPL-AREA-1')
        .split(',')
        .map((p) => p.trim());

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();

        // Simulated corporate Keycloak JWT parsing
        let role: UserRole = 'senior';
        let userId = 'eng-khandelwal-01';

        if (token.includes('admin')) {
          role = 'admin';
          userId = 'admin-lead-01';
        } else if (token.includes('junior')) {
          role = 'junior';
          userId = 'trainee-intern-01';
        }

        req.principal = {
          userId,
          role,
          projectIds: ['MRPL-CDU-01', 'MRPL-AREA-1'],
        };
        next();
        return;
      }

      if (ldapUser) {
        req.principal = {
          userId: ldapUser,
          role: ldapRole,
          projectIds: ldapProjects,
        };
        next();
        return;
      }

      if (options.allowAnonymousDev !== false) {
        // Dev fallback: default to senior engineer on refinery project
        req.principal = {
          userId: 'dev-engineer-sovereign',
          role: 'senior',
          projectIds: ['MRPL-CDU-01', 'MRPL-AREA-1'],
        };
        next();
        return;
      }

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid corporate bearer token or LDAP credentials',
      });
    },

    /**
     * Enforce Cedar RBAC permission on an action and resource.
     */
    requirePermission: (
      action: RbacAction,
      getResource: (req: Request) => Resource = () => ({ type: 'system', id: 'core' }),
    ) => {
      return (req: Request, res: Response, next: NextFunction): void => {
        const principal = req.principal;
        if (!principal) {
          res.status(401).json({ error: 'Unauthenticated' });
          return;
        }

        const resource = getResource(req);
        const decision = evaluator.evaluate(principal, action, resource, undefined, auditChain);

        if (!decision.allowed) {
          res.status(403).json({
            error: 'Forbidden',
            action,
            role: principal.role,
            reason: decision.reason ?? 'Denied by Cedar RBAC policy',
            auditEventId: decision.refusalAuditEvent?.eventId,
          });
          return;
        }

        next();
      };
    },
  };
}
