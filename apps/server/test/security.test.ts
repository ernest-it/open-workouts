import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { assertSafeWebhookUrl } from '../src/insights';
import type { LlmProvider } from '../src/llm';

type App = ReturnType<typeof buildApp>;
let app: App;
afterEach(async () => app?.close());

const fakeLlm: LlmProvider = { name: 'fake', model: 'fake', complete: async () => ({ text: 'ok', model: 'fake' }) };

async function start(extra: Partial<ReturnType<typeof loadConfig>['insights']> = {}) {
  const base = loadConfig({});
  app = buildApp({ ...base, databaseFile: ':memory:', logLevel: 'silent', insights: { ...base.insights, ...extra } }, undefined, { llm: fakeLlm });
  await app.ready();
}
const register = async (username: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username, password: 'correct horse' } });

describe('security', () => {
  it('rejects unauthenticated requests before reading large bodies', async () => {
    await start();
    const big = '{"x":"' + 'a'.repeat(5 * 1024 * 1024) + '"}';
    for (const url of ['/api/v1/sync', '/api/v1/import/strong', '/mcp']) {
      const r = await app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: big });
      expect(r.statusCode, url).toBe(401);
    }
    // public endpoints have a small body limit
    const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { 'content-type': 'application/json' }, payload: big });
    expect(reg.statusCode).toBe(413);
  });

  it('still accepts large bodies on sync for signed-in users', async () => {
    await start();
    const { token } = (await register('alice')).json();
    const rows = Array.from({ length: 20_000 }, (_, i) => ({ id: `m${i}`, kind: 'body_weight', value: 80, takenAt: i, note: null, createdAt: 1, updatedAt: 1, deletedAt: null }));
    const r = await app.inject({ method: 'POST', url: '/api/v1/sync', headers: { authorization: `Bearer ${token}` }, payload: { since: 0, changes: { measurements: rows } } });
    expect(r.statusCode).toBe(200);
  });

  it('makes exactly one admin even with concurrent first sign-ups', async () => {
    await start();
    const results = await Promise.all(['a1', 'a2', 'a3'].map(register));
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 403, 403]);
  });

  it('sends security headers', async () => {
    await start();
    const r = await app.inject('/api/v1/health');
    expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
  });

  it('requires the password to delete an account', async () => {
    await start();
    const { token } = (await register('alice')).json();
    const auth = { authorization: `Bearer ${token}` };
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/me', headers: auth, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/me', headers: auth, payload: { password: 'wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/me', headers: auth, payload: { password: 'correct horse' } })).statusCode).toBe(200);
  });

  it('rate-limits AI requests per user', async () => {
    await start({ aiRequestsPerHour: 2 });
    const { token } = (await register('alice')).json();
    const ask = () =>
      app.inject({ method: 'POST', url: '/api/v1/insights/ask', headers: { authorization: `Bearer ${token}` }, payload: { question: 'How am I doing?' } });
    expect([(await ask()).statusCode, (await ask()).statusCode, (await ask()).statusCode]).toEqual([200, 200, 429]);
  });

  it('blocks webhooks to loopback, link-local and metadata addresses', async () => {
    const pub = async () => ['93.184.215.14'];
    await expect(assertSafeWebhookUrl('https://ntfy.example.com/topic', pub)).resolves.toBeUndefined();
    await expect(assertSafeWebhookUrl('http://192.168.1.20/topic', pub)).resolves.toBeUndefined(); // home LAN ntfy is fine
    for (const bad of [
      'http://127.0.0.1:8080/api',
      'http://localhost/x',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/x',
      'http://[fd00:ec2::254]/x',
      'http://[::ffff:127.0.0.1]/x',
      'http://user:pass@ntfy.example.com/x',
      'file:///etc/passwd',
    ]) {
      await expect(assertSafeWebhookUrl(bad, pub), bad).rejects.toThrow();
    }
    // a public-looking hostname that resolves to a metadata address is blocked too
    await expect(assertSafeWebhookUrl('https://evil.example.com/x', async () => ['169.254.169.254'])).rejects.toThrow(/not allowed/);
  });
});
