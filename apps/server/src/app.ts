import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  BUILTIN_EXERCISES,
  COLLECTION_NAMES,
  exportStrongCsv,
  importStrongCsv,
  syncRequestSchema,
  type Exercise,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@open-workouts/shared';
import { z } from 'zod';
import { RateLimiter, createSession, hashPassword, userForToken, verifyPassword, type User } from './auth';
import type { Config } from './config';
import { openDatabase, type DB } from './db';
import { allRows, applyChanges, pullChanges } from './sync';
import { VERSION } from './version';
import { createLlmProvider, type LlmProvider } from './llm';
import { ensureInsightsTables, registerInsightsRoutes, runScheduledReports, type InsightsDeps } from './insights';
import { registerMcp } from './mcp';

export interface AppDeps {
  /** Override the LLM provider (tests); `null` disables AI insights. */
  llm?: LlmProvider | null;
  now?: () => number;
  fetchImpl?: typeof fetch;
  lookup?: (host: string) => Promise<string[]>;
}

export { VERSION };

declare module 'fastify' {
  interface FastifyRequest {
    user?: User & { sessionId: string };
  }
}

const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Z0-9_.@-]+$/, 'letters, digits and _ . @ - only'),
  password: z.string().min(8).max(256),
  deviceName: z.string().max(100).optional(),
});

export function buildApp(config: Config, db: DB = openDatabase(config.databaseFile), deps: AppDeps = {}) {
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    // Small default limit; the few authenticated routes that need large bodies
    // (sync, import) raise it per route. Authentication runs in onRequest, i.e.
    // before any body is read, so anonymous clients can't make us buffer 50 MB.
    bodyLimit: 1024 * 1024,
    trustProxy: config.trustProxy,
  });
  const LARGE_BODY = 50 * 1024 * 1024;
  const authLimiter = new RateLimiter(20, 15 * 60 * 1000);

  ensureInsightsTables(db);
  app.decorate('owDb', db);
  const insights: InsightsDeps = {
    db,
    llm: deps.llm !== undefined ? deps.llm : createLlmProvider(config),
    now: deps.now,
    fetchImpl: deps.fetchImpl,
    allowWebhooks: config.insights.allowWebhooks,
    aiRequestsPerHour: config.insights.aiRequestsPerHour,
    lookup: deps.lookup,
    log: { info: (m) => app.log.info(m), warn: (m) => app.log.warn(m) },
  };
  if (config.insights.scheduler && insights.llm) {
    const tick = () => void runScheduledReports(insights).catch((e) => app.log.error(e));
    const timer = setInterval(tick, 10 * 60_000);
    timer.unref();
    app.addHook('onReady', async () => tick());
    app.addHook('onClose', async () => clearInterval(timer));
  }

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
    reply.header(
      'content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; " +
        "connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
  });

  app.register(cors, { origin: config.corsOrigins.length ? config.corsOrigins : true, credentials: false });

  app.addContentTypeParser(['text/csv', 'text/plain'], { parseAs: 'string' }, (_req, body, done) => done(null, body));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'validation', issues: err.issues });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'internal error' : (err as Error).message });
  });

  const userCount = () => (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  const registrationOpen = () => config.allowRegistration || userCount() === 0;

  async function requireUser(req: FastifyRequest, reply: FastifyReply) {
    const h = req.headers.authorization;
    const token = h?.startsWith('Bearer ') ? h.slice(7) : undefined;
    const user = token ? userForToken(db, token) : undefined;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    req.user = user;
  }

  // ---- public ---------------------------------------------------------------
  app.get('/api/v1/health', async () => ({ ok: true }));

  app.get('/api/v1/server-info', async () => ({
    name: 'open-workouts',
    version: VERSION,
    apiVersion: 1,
    registrationOpen: registrationOpen(),
    serverId: serverId(db),
  }));

  app.get('/api/v1/exercises/builtin', async () => BUILTIN_EXERCISES);

  app.post('/api/v1/auth/register', async (req, reply) => {
    if (!authLimiter.allow(`reg:${req.ip}`)) return reply.code(429).send({ error: 'too many attempts' });
    if (!registrationOpen()) return reply.code(403).send({ error: 'registration is disabled on this server' });
    const body = credentials.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    // Re-check everything synchronously after the (slow) hash so concurrent
    // sign-ups can't both become admin or slip in after registration closes.
    const result = db.transaction(() => {
      if (!registrationOpen()) return { status: 403 as const, error: 'registration is disabled on this server' };
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(body.username)) return { status: 409 as const, error: 'username already taken' };
      const id = crypto.randomUUID();
      const isAdmin = userCount() === 0 ? 1 : 0;
      db.prepare('INSERT INTO users (id, username, passwordHash, isAdmin, createdAt) VALUES (?, ?, ?, ?, ?)').run(
        id,
        body.username,
        passwordHash,
        isAdmin,
        Date.now(),
      );
      return { status: 201 as const, id, isAdmin };
    }).immediate();
    if (result.status !== 201) return reply.code(result.status).send({ error: result.error });
    const { token } = createSession(db, result.id, body.deviceName ?? 'unknown device');
    return reply.code(201).send({ token, user: { id: result.id, username: body.username, isAdmin: !!result.isAdmin } });
  });

  app.post('/api/v1/auth/login', async (req, reply) => {
    if (!authLimiter.allow(`login:${req.ip}`)) return reply.code(429).send({ error: 'too many attempts' });
    const body = credentials.extend({ password: z.string().min(1).max(256) }).parse(req.body);
    const u = db.prepare('SELECT id, username, passwordHash, isAdmin FROM users WHERE username = ?').get(body.username) as
      | { id: string; username: string; passwordHash: string; isAdmin: number }
      | undefined;
    // Always run a hash to keep timing similar for unknown users.
    const ok = u
      ? await verifyPassword(body.password, u.passwordHash)
      : (await hashPassword(body.password), false);
    if (!u || !ok) return reply.code(401).send({ error: 'invalid username or password' });
    const { token } = createSession(db, u.id, body.deviceName ?? 'unknown device');
    return { token, user: { id: u.id, username: u.username, isAdmin: !!u.isAdmin } };
  });

  // ---- authenticated --------------------------------------------------------
  app.register(async (r) => {
    r.addHook('onRequest', requireUser);

    r.get('/api/v1/me', async (req) => ({
      id: req.user!.id,
      username: req.user!.username,
      isAdmin: !!req.user!.isAdmin,
    }));

    r.post('/api/v1/auth/logout', async (req) => {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(req.user!.sessionId);
      return { ok: true };
    });

    r.post('/api/v1/auth/password', async (req, reply) => {
      const body = z.object({ currentPassword: z.string(), newPassword: z.string().min(8).max(256) }).parse(req.body);
      const u = db.prepare('SELECT passwordHash FROM users WHERE id = ?').get(req.user!.id) as { passwordHash: string };
      if (!(await verifyPassword(body.currentPassword, u.passwordHash)))
        return reply.code(401).send({ error: 'current password is wrong' });
      db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(await hashPassword(body.newPassword), req.user!.id);
      db.prepare('DELETE FROM sessions WHERE userId = ? AND id != ?').run(req.user!.id, req.user!.sessionId);
      return { ok: true };
    });

    r.get('/api/v1/sessions', async (req) =>
      (
        db.prepare('SELECT id, name, createdAt, lastUsedAt FROM sessions WHERE userId = ? ORDER BY lastUsedAt DESC').all(
          req.user!.id,
        ) as { id: string }[]
      ).map((s) => ({ ...s, current: s.id === req.user!.sessionId })),
    );

    r.delete<{ Params: { id: string } }>('/api/v1/sessions/:id', async (req) => {
      db.prepare('DELETE FROM sessions WHERE id = ? AND userId = ?').run(req.params.id, req.user!.id);
      return { ok: true };
    });

    /** Long-lived API token, e.g. for scripts or a home-assistant integration. */
    r.post('/api/v1/tokens', async (req) => {
      const body = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
      return createSession(db, req.user!.id, `token: ${body.name}`);
    });

    r.post('/api/v1/sync', { bodyLimit: LARGE_BODY }, async (req) => {
      const body = syncRequestSchema.parse(req.body);
      const { rejected } = applyChanges(db, req.user!.id, body.changes);
      const pulled = pullChanges(db, req.user!.id, body.since);
      return { ...pulled, rejected };
    });

    r.post<{ Querystring: { weightUnit?: string; distanceUnit?: string; tzOffset?: string } }>(
      '/api/v1/import/strong',
      { bodyLimit: LARGE_BODY },
      async (req, reply) => {
        const text = typeof req.body === 'string' ? req.body : (req.body as { csv?: string })?.csv;
        if (!text) return reply.code(400).send({ error: 'send the CSV as text/csv body or {"csv": "..."}' });
        const existing = allRows(db, req.user!.id, 'exercises') as Exercise[];
        const result = importStrongCsv(text, {
          weightUnit: req.query.weightUnit === 'lb' ? 'lb' : 'kg',
          distanceUnit: req.query.distanceUnit === 'mi' ? 'mi' : 'km',
          timezoneOffsetMinutes: req.query.tzOffset != null ? Number(req.query.tzOffset) : 0,
          existingExercises: existing,
          existingWorkouts: allRows(db, req.user!.id, 'workouts') as Workout[],
        });
        const { applied, rejected } = applyChanges(db, req.user!.id, result.changes);
        return { ...result.summary, applied, rejected: rejected.slice(0, 50) };
      },
    );

    r.get<{ Querystring: { weightUnit?: string; distanceUnit?: string; tzOffset?: string } }>('/api/v1/export/strong.csv', async (req, reply) => {
      const uid = req.user!.id;
      const custom = new Map((allRows(db, uid, 'exercises') as Exercise[]).map((e) => [e.id, e.name]));
      const builtin = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e.name]));
      const csv = exportStrongCsv(
        {
          workouts: allRows(db, uid, 'workouts') as Workout[],
          workoutExercises: allRows(db, uid, 'workoutExercises') as WorkoutExercise[],
          sets: allRows(db, uid, 'sets') as WorkoutSet[],
          exerciseName: (id) => custom.get(id) ?? builtin.get(id) ?? id,
        },
        {
          weightUnit: req.query.weightUnit === 'lb' ? 'lb' : 'kg',
          distanceUnit: req.query.distanceUnit === 'mi' ? 'mi' : 'km',
          // Times are written as the user's wall-clock time, not the server's.
          timezoneOffsetMinutes: Number.isFinite(Number(req.query.tzOffset)) ? Number(req.query.tzOffset) : 0,
        },
      );
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="open-workouts-${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(csv);
    });

    /** Full JSON backup of everything the user owns (re-importable via /sync). */
    r.get('/api/v1/export/json', async (req, reply) => {
      const data: Record<string, unknown[]> = {};
      for (const c of COLLECTION_NAMES) data[c] = allRows(db, req.user!.id, c);
      return reply
        .header('content-disposition', `attachment; filename="open-workouts-${new Date().toISOString().slice(0, 10)}.json"`)
        .send({ format: 'open-workouts-backup', version: 1, exportedAt: Date.now(), data });
    });

    registerInsightsRoutes(r, insights);

    /** Delete the account and all its data. Requires the password, not just a token. */
    r.delete('/api/v1/me', async (req, reply) => {
      const body = z.object({ password: z.string().min(1).max(256) }).parse(req.body ?? {});
      const u = db.prepare('SELECT passwordHash FROM users WHERE id = ?').get(req.user!.id) as { passwordHash: string };
      if (!(await verifyPassword(body.password, u.passwordHash))) return reply.code(401).send({ error: 'password is wrong' });
      db.prepare('DELETE FROM users WHERE id = ?').run(req.user!.id);
      return { ok: true };
    });
  });

  // ---- MCP (for AI assistants) ---------------------------------------------
  registerMcp(app, db, requireUser);

  // ---- web UI ---------------------------------------------------------------
  if (config.webDir && fs.existsSync(path.join(config.webDir, 'index.html'))) {
    app.register(fastifyStatic, { root: path.resolve(config.webDir), wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/mcp')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not found' });
    });
  }

  app.addHook('onClose', async () => db.close());
  return app;
}

function serverId(db: DB): string {
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'serverId'`).get() as { value: string } | undefined;
  if (row) return row.value;
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO meta (key, value) VALUES ('serverId', ?)`).run(id);
  return id;
}
