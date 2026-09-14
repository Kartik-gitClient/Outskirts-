import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import { AuditChain } from '@outskirts/sovereignty';
import { createAuthMiddleware } from '../src/gateway/auth.js';
import { PerceptionBridge } from '../../../services/perception/bridge.js';

describe('Corporate Auth & Tenancy Middleware (Section 18 P5)', () => {
  async function withTestServer(
    app: express.Express,
    callback: (baseUrl: string) => Promise<void>,
  ): Promise<void> {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      await callback(baseUrl);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('authenticates bearer token and maps Cedar roles', async () => {
    const app = express();
    const auth = createAuthMiddleware({ allowAnonymousDev: false });
    app.use(auth.authenticate);
    app.get('/test-me', (req, res) => {
      res.json({ principal: req.principal });
    });

    await withTestServer(app, async (baseUrl) => {
      const resAdmin = await fetch(`${baseUrl}/test-me`, {
        headers: { Authorization: 'Bearer token-admin-corporate' },
      });
      expect(resAdmin.status).toBe(200);
      const dataAdmin = (await resAdmin.json()) as { principal: { role: string; userId: string } };
      expect(dataAdmin.principal.role).toBe('admin');
      expect(dataAdmin.principal.userId).toBe('admin-lead-01');

      const resJunior = await fetch(`${baseUrl}/test-me`, {
        headers: { Authorization: 'Bearer token-junior-intern' },
      });
      expect(resJunior.status).toBe(200);
      const dataJunior = (await resJunior.json()) as { principal: { role: string } };
      expect(dataJunior.principal.role).toBe('junior');
    });
  });

  it('authenticates LDAP identity headers with project scoping', async () => {
    const app = express();
    const auth = createAuthMiddleware({ allowAnonymousDev: false });
    app.use(auth.authenticate);
    app.get('/test-me', (req, res) => {
      res.json({ principal: req.principal });
    });

    await withTestServer(app, async (baseUrl) => {
      const resLdap = await fetch(`${baseUrl}/test-me`, {
        headers: {
          'X-Ldap-User': 'ldap.eng.vishwakarma',
          'X-Ldap-Role': 'senior',
          'X-Ldap-Projects': 'MRPL-CDU-01,MRPL-FCCU-02',
        },
      });

      expect(resLdap.status).toBe(200);
      const data = (await resLdap.json()) as { principal: { userId: string; role: string; projectIds: string[] } };
      expect(data.principal.userId).toBe('ldap.eng.vishwakarma');
      expect(data.principal.role).toBe('senior');
      expect(data.principal.projectIds).toEqual(['MRPL-CDU-01', 'MRPL-FCCU-02']);
    });
  });

  it('rejects unauthenticated requests when dev fallback is disabled', async () => {
    const app = express();
    const auth = createAuthMiddleware({ allowAnonymousDev: false });
    app.use(auth.authenticate);
    app.get('/test-me', (_req, res) => res.json({ ok: true }));

    await withTestServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/test-me`);
      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Unauthorized');
    });
  });

  it('enforces RBAC permission and logs refusal to AuditChain on unauthorized action', async () => {
    const chain = new AuditChain();
    const app = express();
    const auth = createAuthMiddleware({ auditChain: chain, allowAnonymousDev: false });

    app.use(auth.authenticate);
    app.post(
      '/admin/mode-switch',
      auth.requirePermission('mode.switch'),
      (_req, res) => res.json({ success: true }),
    );

    await withTestServer(app, async (baseUrl) => {
      // Junior engineer attempting mode switch -> must be refused
      const resRefused = await fetch(`${baseUrl}/admin/mode-switch`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-junior-intern' },
      });

      expect(resRefused.status).toBe(403);
      const data = (await resRefused.json()) as { error: string; action: string; auditEventId: string };
      expect(data.error).toBe('Forbidden');
      expect(data.action).toBe('mode.switch');
      expect(data.auditEventId).toBeDefined();

      // Verify refusal was appended to the cryptographic AuditChain
      const events = chain.getEvents();
      expect(events.length).toBe(1);
      expect(events[0]!.kind).toBe('rbac.refusal');
      expect(events[0]!.payload['action']).toBe('mode.switch');
      expect(events[0]!.payload['role']).toBe('junior');
    });
  });
});

describe('PerceptionBridge (Section 7.2 & 18 P5)', () => {
  it('performs local deterministic extraction when container is offline', async () => {
    const bridge = new PerceptionBridge({ serviceUrl: 'http://127.0.0.1:59998', timeoutMs: 100 });
    const health = await bridge.checkHealth();
    expect(health.available).toBe(false);

    const extractionRes = await bridge.extractPid('MRPL-CDU-01', 7);
    expect(extractionRes.source).toBe('local-deterministic-replay');
    expect(extractionRes.extraction.tags.length).toBe(7);
    expect(extractionRes.extraction.connections.length).toBeGreaterThan(0);

    const tags = extractionRes.extraction.tags.map((t) => t.tagNumber);
    expect(tags).toContain('P-101A');
    expect(tags).toContain('V-101');
    expect(tags).toContain('FV-2034');
  });

  it('resolves industrial GraphRAG topological queries locally', async () => {
    const bridge = new PerceptionBridge({ serviceUrl: 'http://127.0.0.1:59998', timeoutMs: 100 });
    const queryRes = await bridge.queryTopology('MRPL-CDU-01', 'What feeds V-102?');

    expect(queryRes.answer).toContain('Equipment V-102 is fed by process path');
    expect(queryRes.path).toContain('V-101');
    expect(queryRes.path).toContain('P-101A');
  });
});
