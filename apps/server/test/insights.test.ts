import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorage, WorkoutStore, findBuiltinByName } from '@open-workouts/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { AnthropicProvider, OpenAICompatibleProvider, type CompletionRequest, type LlmProvider } from '../src/llm';
import { runScheduledReports } from '../src/insights';

type App = ReturnType<typeof buildApp>;
let app: App;
afterEach(async () => app?.close());

class FakeLlm implements LlmProvider {
  name = 'fake';
  model = 'fake-1';
  calls: CompletionRequest[] = [];
  async complete(req: CompletionRequest) {
    this.calls.push(req);
    return { text: `## Summary\nReport #${this.calls.length}`, model: this.model };
  }
}

const NOW = Date.UTC(2026, 1, 10, 12); // Tuesday

async function setup(llm: LlmProvider | null, fetchImpl?: typeof fetch) {
  app = buildApp({ ...loadConfig({}), databaseFile: ':memory:', logLevel: 'silent' }, undefined, { llm, now: () => NOW, fetchImpl });
  await app.ready();
  const { token } = (
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: 'alice', password: 'correct horse' } })
  ).json();
  // Log two bench sessions through the real sync path.
  let t = NOW - 8 * 86_400_000;
  const store = new WorkoutStore(new MemoryStorage(), { now: () => t, fetch: injectFetch });
  await store.init();
  store.server = { baseUrl: 'http://test', token };
  const bench = findBuiltinByName('Bench Press (Barbell)')!;
  const ids: string[] = [];
  for (const kg of [100, 105]) {
    const w = store.startWorkout({ name: 'Push' });
    const we = store.addExerciseToWorkout(w.id, bench.id);
    store.update('sets', store.setsOf(we.id)[0]!.id, { weight: kg, reps: 5, completed: true, rpe: 8 });
    t += 3600_000;
    store.finishWorkout(w.id);
    ids.push(w.id);
    t += 4 * 86_400_000;
  }
  store.insert('measurements', { kind: 'body_weight', value: 82, takenAt: t, note: null });
  await store.sync();
  const auth = { authorization: `Bearer ${token}` };
  return { token, auth, ids, store };
}

const injectFetch = (async (url: string, init: RequestInit) => {
  const res = await app.inject({
    method: init.method as 'POST',
    url: new URL(url).pathname,
    headers: init.headers as Record<string, string>,
    payload: init.body as string,
  });
  return { ok: res.statusCode < 300, status: res.statusCode, json: async () => res.json() } as Response;
}) as unknown as typeof fetch;

describe('insights API', () => {
  it('serves the deterministic digest without an LLM and reports 501 for AI calls', async () => {
    const { auth } = await setup(null);
    const status = (await app.inject({ url: '/api/v1/insights/status', headers: auth })).json();
    expect(status.enabled).toBe(false);
    const digest = await app.inject({ url: '/api/v1/insights/digest?days=14', headers: auth });
    expect(digest.headers['content-type']).toContain('text/markdown');
    expect(digest.body).toContain('Bench Press (Barbell)');
    expect(digest.body).toContain('105x5 @8');
    const r = await app.inject({ method: 'POST', url: '/api/v1/insights/report', headers: auth, payload: {} });
    expect(r.statusCode).toBe(501);
  });

  it('generates, stores, lists and deletes reports', async () => {
    const llm = new FakeLlm();
    const { auth, ids } = await setup(llm);
    const rep = (await app.inject({ method: 'POST', url: '/api/v1/insights/report', headers: auth, payload: { days: 14 } })).json();
    expect(rep.content).toContain('Report #1');
    expect(llm.calls[0]!.context).toContain('# Training digest');
    expect(llm.calls[0]!.context).toContain('105x5 @8');
    expect(llm.calls[0]!.system).toContain('single source of truth');

    const cmp = await app.inject({ method: 'POST', url: '/api/v1/insights/compare', headers: auth, payload: { a: ids[1] } });
    expect(cmp.statusCode).toBe(200);
    expect(llm.calls[1]!.context).toMatch(/Bench Press \(Barbell\) \| 100x5 @8 \| 105x5 @8 \| \+5.0%/);

    const ask = await app.inject({ method: 'POST', url: '/api/v1/insights/ask', headers: auth, payload: { question: 'Am I getting stronger on bench?' } });
    expect(ask.json().kind).toBe('answer');
    expect(llm.calls[2]!.prompt).toContain('Am I getting stronger on bench?');

    const list = (await app.inject({ url: '/api/v1/insights/reports', headers: auth })).json();
    expect(list.map((x: { kind: string }) => x.kind).sort()).toEqual(['answer', 'compare', 'report']);
    await app.inject({ method: 'DELETE', url: `/api/v1/insights/reports/${rep.id}`, headers: auth });
    expect((await app.inject({ url: '/api/v1/insights/reports', headers: auth })).json()).toHaveLength(2);
  });

  it('runs weekly reports on schedule and notifies the webhook once', async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response('ok');
    }) as unknown as typeof fetch;
    const llm = new FakeLlm();
    const { store } = await setup(llm, fakeFetch);
    const local = new Date(NOW);
    store.setSetting('insights', {
      weeklyReport: true,
      weekday: local.getDay(),
      hour: Math.max(0, local.getHours() - 1),
      webhook: { url: 'https://ntfy.example.com/my-lifts', format: 'ntfy' },
    });
    await store.sync();
    const created = await runScheduledReports(getDeps(llm, fakeFetch));
    expect(created).toHaveLength(1);
    expect(created[0]!.kind).toBe('weekly');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('https://ntfy.example.com/my-lifts');
    expect((sent[0]!.init.headers as Record<string, string>).Title).toMatch(/Weekly update/);
    // second pass the same day does nothing
    expect(await runScheduledReports(getDeps(llm, fakeFetch))).toHaveLength(0);
  });
});

// Access the app's database through the test-only decorator.
function getDeps(llm: LlmProvider, fetchImpl: typeof fetch) {
  return {
    db: (app as unknown as { owDb: import('../src/db').DB }).owDb,
    llm,
    now: () => NOW,
    fetchImpl,
    allowWebhooks: true,
    lookup: async () => ['93.184.215.14'], // pretend ntfy.example.com resolves to a public IP
  };
}

describe('MCP endpoint', () => {
  const rpc = (auth: Record<string, string>, body: unknown) =>
    app.inject({ method: 'POST', url: '/mcp', headers: { ...auth, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, payload: body as object });

  it('requires a token', async () => {
    await setup(null);
    expect((await rpc({}, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).statusCode).toBe(401);
  });

  it('initializes, lists tools and answers tool calls', async () => {
    const { auth, ids } = await setup(null);
    const init = (await rpc(auth, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json();
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(init.result.capabilities.tools).toBeTruthy();
    expect((await rpc(auth, { jsonrpc: '2.0', method: 'notifications/initialized' })).statusCode).toBe(202);

    const tools = (await rpc(auth, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json().result.tools;
    expect(tools.map((t: { name: string }) => t.name)).toContain('compare_workouts');

    const call = async (name: string, args: object) =>
      (await rpc(auth, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } })).json().result;
    expect((await call('list_workouts', {})).content[0].text).toContain(ids[1]);
    expect((await call('get_exercise_history', { exercise: 'bench press (barbell)' })).content[0].text).toMatch(/5RM 105 kg/);
    expect((await call('compare_workouts', { a: ids[1] })).content[0].text).toContain('+5.0%');
    expect((await call('get_measurements', { kind: 'body_weight' })).content[0].text).toContain('82 kg');
    expect((await call('get_training_digest', { days: 14 })).content[0].text).toContain('# Training digest');
    const bad = await call('list_workouts', { limit: 'lots' });
    expect(bad.isError).toBe(true);
    const unknown = (await rpc(auth, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'drop_tables' } })).json();
    expect(unknown.error.code).toBe(-32602);
  });
});

describe('LLM providers', () => {
  it('sends Claude requests with cached context, effort and refusal fallbacks', async () => {
    let captured: { url: string; body: Record<string, unknown>; headers: Headers } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init.body)), headers: new Headers(init.headers) };
      return new Response(
        JSON.stringify({
          id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
          content: [{ type: 'text', text: 'Great week.' }],
          usage: { input_tokens: 10, output_tokens: 3 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    const p = new AnthropicProvider('claude-opus-5-5', 'medium', 'sk-test', { fetch: fakeFetch, maxRetries: 0 });
    const res = await p.complete({ system: 'SYS', context: 'DIGEST', prompt: 'Q' });
    expect(res).toEqual({ text: 'Great week.', model: 'claude-opus-5-5' });
    expect(captured!.url).toContain('/v1/messages');
    expect(captured!.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(captured!.body).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: 'SYS' }, { type: 'text', text: 'DIGEST', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'Q' }],
    });
    expect(captured!.body.thinking).toBeUndefined();
  });

  it('reports refusals', async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'refusal', stop_sequence: null, content: [], usage: { input_tokens: 1, output_tokens: 0 } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;
    const p = new AnthropicProvider('claude-opus-5-5', null, 'sk-test', { fetch: fakeFetch, maxRetries: 0 });
    await expect(p.complete({ system: 's', context: 'c', prompt: 'p' })).rejects.toThrow(/declined/);
  });

  it('talks to OpenAI-compatible endpoints (Ollama) and strips <think> blocks', async () => {
    let body: Record<string, unknown> = {};
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ model: 'qwen3:8b', choices: [{ message: { content: '<think>hmm</think>\nAll good.' } }] }));
    }) as unknown as typeof fetch;
    const p = new OpenAICompatibleProvider('qwen3:8b', 'http://ollama:11434/v1', undefined, fakeFetch);
    expect(await p.complete({ system: 'S', context: 'C', prompt: 'P' })).toEqual({ text: 'All good.', model: 'qwen3:8b' });
    expect(body.messages).toEqual([{ role: 'system', content: 'S\n\nC' }, { role: 'user', content: 'P' }]);
  });
});
