import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorage, WorkoutStore, findBuiltinByName } from '@open-workouts/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

type App = ReturnType<typeof buildApp>;
let app: App;

beforeEach(async () => {
  app = buildApp({ ...loadConfig({}), databaseFile: ':memory:', logLevel: 'silent' });
  await app.ready();
});
afterEach(async () => app.close());

async function register(username = 'alice', password = 'correct horse') {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username, password } });
  return res;
}

/** fetch() shim that routes WorkoutStore requests into fastify.inject. */
const injectFetch = (async (url: string, init: RequestInit) => {
  const res = await app.inject({
    method: init.method as 'POST',
    url: new URL(url).pathname,
    headers: init.headers as Record<string, string>,
    payload: init.body as string,
  });
  return { ok: res.statusCode < 300, status: res.statusCode, json: async () => res.json() } as Response;
}) as unknown as typeof fetch;

describe('auth', () => {
  it('first user becomes admin, then registration closes', async () => {
    const info1 = (await app.inject('/api/v1/server-info')).json();
    expect(info1.registrationOpen).toBe(true);
    const r = await register();
    expect(r.statusCode).toBe(201);
    expect(r.json().user.isAdmin).toBe(true);
    const info2 = (await app.inject('/api/v1/server-info')).json();
    expect(info2.registrationOpen).toBe(false);
    expect((await register('bob')).statusCode).toBe(403);
  });

  it('logs in and rejects bad passwords', async () => {
    await register();
    const bad = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'alice', password: 'nope' } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'ALICE', password: 'correct horse' } });
    expect(ok.statusCode).toBe(200);
    const me = await app.inject({ url: '/api/v1/me', headers: { authorization: `Bearer ${ok.json().token}` } });
    expect(me.json().username).toBe('alice');
    expect((await app.inject('/api/v1/me')).statusCode).toBe(401);
  });
});

describe('sync', () => {
  it('syncs between two devices with last-write-wins', async () => {
    const { token } = (await register()).json();
    const server = { baseUrl: 'http://test', token };
    const phone = new WorkoutStore(new MemoryStorage(), { fetch: injectFetch });
    const laptop = new WorkoutStore(new MemoryStorage(), { fetch: injectFetch });
    await phone.init();
    await laptop.init();
    phone.server = laptop.server = server;

    const bench = findBuiltinByName('Bench Press (Barbell)')!;
    const w = phone.startWorkout({ name: 'Push' });
    const we = phone.addExerciseToWorkout(w.id, bench.id);
    phone.update('sets', phone.setsOf(we.id)[0]!.id, { weight: 100, reps: 5, completed: true });
    phone.finishWorkout(w.id);
    await phone.sync();
    expect(phone.pendingCount()).toBe(0);

    await laptop.sync();
    expect(laptop.get('workouts', w.id)?.name).toBe('Push');
    expect(laptop.setsOf(we.id)[0]!.weight).toBe(100);

    // concurrent edits: the later one wins everywhere
    laptop.update('workouts', w.id, { name: 'Laptop edit' });
    await new Promise((r) => setTimeout(r, 5));
    phone.update('workouts', w.id, { name: 'Phone edit (later)' });
    await laptop.sync();
    await phone.sync();
    await laptop.sync();
    expect(laptop.get('workouts', w.id)?.name).toBe('Phone edit (later)');
    expect(phone.get('workouts', w.id)?.name).toBe('Phone edit (later)');

    // deletes propagate
    phone.deleteWorkout(w.id);
    await phone.sync();
    await laptop.sync();
    expect(laptop.get('workouts', w.id)).toBeUndefined();
    expect(laptop.all('sets')).toHaveLength(0);
  });

  it('isolates users and rejects invalid rows', async () => {
    const a = (await register('alice')).json().token;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/sync',
      headers: { authorization: `Bearer ${a}` },
      payload: {
        since: 0,
        changes: {
          measurements: [
            { id: 'm1', kind: 'body_weight', value: 80, takenAt: 1, note: null, createdAt: 1, updatedAt: 1, deletedAt: null },
            { id: 'm2', kind: 'not_a_kind', value: 1 },
          ],
          exercises: [{ id: 'builtin:x', name: 'x', logType: 'reps', equipment: 'other', bodyPart: 'other', instructions: null, createdAt: 1, updatedAt: 1, deletedAt: null }],
        },
      },
    });
    const body = res.json();
    expect(body.changes.measurements).toHaveLength(1);
    expect(body.rejected.map((r: { id: string }) => r.id).sort()).toEqual(['builtin:x', 'm2']);
  });

  it('paginates large pulls', async () => {
    const { token } = (await register()).json();
    const rows = Array.from({ length: 12_000 }, (_, i) => ({
      id: `m${i}`, kind: 'body_weight', value: 80, takenAt: i, note: null, createdAt: 1, updatedAt: 1, deletedAt: null,
    }));
    await app.inject({ method: 'POST', url: '/api/v1/sync', headers: { authorization: `Bearer ${token}` }, payload: { since: 0, changes: { measurements: rows } } });
    const fresh = new WorkoutStore(new MemoryStorage(), { fetch: injectFetch });
    await fresh.init();
    fresh.server = { baseUrl: 'http://test', token };
    await fresh.sync();
    expect(fresh.all('measurements')).toHaveLength(12_000);
  });
});

describe('strong import/export', () => {
  it('imports a Strong CSV and exports it back', async () => {
    const { token } = (await register()).json();
    const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2024-01-15 08:30:00,"Push Day",1h 5m,Bench Press (Barbell),1,100,5,0,0,"","",8
2024-01-15 08:30:00,"Push Day",1h 5m,Bench Press (Barbell),2,100,5,0,0,"","",
`;
    const imp = await app.inject({
      method: 'POST',
      url: '/api/v1/import/strong?weightUnit=kg',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/csv' },
      payload: csv,
    });
    expect(imp.json()).toMatchObject({ workouts: 1, sets: 2 });
    // idempotent
    await app.inject({ method: 'POST', url: '/api/v1/import/strong', headers: { authorization: `Bearer ${token}`, 'content-type': 'text/csv' }, payload: csv });
    const exp = await app.inject({ url: '/api/v1/export/strong.csv', headers: { authorization: `Bearer ${token}` } });
    expect(exp.body.trim().split('\n')).toHaveLength(3);
    expect(exp.body).toContain('Bench Press (Barbell)');
  });
});
