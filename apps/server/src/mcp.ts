// Read-only Model Context Protocol (MCP) server over Streamable HTTP at /mcp.
//
// Lets any MCP-capable assistant (Claude Desktop, Claude Code, other clients)
// explore your training data with tools, authenticated by an API token
// created in Settings. Stateless JSON responses, no server-sent events.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  buildTrainingDigest,
  compareWorkouts,
  estimate1RM,
  exerciseHistory,
  exerciseRecords,
  findComparableWorkout,
  formatDuration,
  formatSet,
  fromKg,
  isWorkingSet,
  MEASUREMENT_KINDS,
  workoutSummary,
  workoutToText,
} from '@open-workouts/shared';
import type { DB } from './db';
import { loadUserData, type UserData } from './insights';
import { VERSION } from './version';

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  args: z.ZodType;
  run: (u: UserData, args: never) => string;
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const day = (s: string) => Date.parse(`${s}T00:00:00`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function resolveExercise(u: UserData, ref: string) {
  const q = ref.trim().toLowerCase();
  return (
    u.ds.exercises.find((e) => e.id === ref) ??
    u.ds.exercises.find((e) => e.name.toLowerCase() === q) ??
    u.ds.exercises.find((e) => e.name.toLowerCase().includes(q))
  );
}

const TOOLS: Tool[] = [
  {
    name: 'get_training_digest',
    description:
      'Summary of recent training: totals versus the previous period, sets per body part, per-exercise best sets and estimated 1RM trends, possible plateaus, weekly consistency, body weight, and every workout in the period. Start here for progress questions.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 365, description: 'Period length in days (default 7).' } },
      additionalProperties: false,
    },
    args: z.object({ days: z.number().int().min(1).max(365).default(7) }),
    run: (u, a: { days: number }) => buildTrainingDigest(u.ds, { days: a.days, weightUnit: u.weightUnit, measurements: u.measurements }),
  },
  {
    name: 'list_workouts',
    description: 'List finished workouts, newest first, with id, date, name, duration, exercise count and volume. Use the ids with get_workout or compare_workouts.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date, YYYY-MM-DD (inclusive).' },
        to: { type: 'string', description: 'End date, YYYY-MM-DD (inclusive).' },
        name_contains: { type: 'string', description: 'Filter by workout name.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Default 20.' },
      },
      additionalProperties: false,
    },
    args: z.object({ from: dateStr.optional(), to: dateStr.optional(), name_contains: z.string().optional(), limit: z.number().int().min(1).max(200).default(20) }),
    run: (u, a: { from?: string; to?: string; name_contains?: string; limit: number }) => {
      const from = a.from ? day(a.from) : -Infinity;
      const to = a.to ? day(a.to) + 86_400_000 : Infinity;
      const list = u.ds.workouts
        .filter((w) => w.endedAt != null && w.startedAt >= from && w.startedAt < to)
        .filter((w) => !a.name_contains || w.name.toLowerCase().includes(a.name_contains.toLowerCase()))
        .sort((x, y) => y.startedAt - x.startedAt);
      if (!list.length) return 'No workouts match.';
      return [
        `${list.length} workout(s)${list.length > a.limit ? `, showing ${a.limit}` : ''}:`,
        ...list.slice(0, a.limit).map((w) => {
          const s = workoutSummary(u.ds, w.id);
          return `- ${w.id} · ${iso(w.startedAt)} · ${w.name} · ${formatDuration(s.durationSeconds)} · ${s.exerciseCount} exercises · ${s.setCount} sets · ${+fromKg(s.volume, u.weightUnit).toFixed(0)} ${u.weightUnit}`;
        }),
      ].join('\n');
    },
  },
  {
    name: 'get_workout',
    description: 'Full detail of one workout: every exercise and set (weight x reps @RPE, warm-up/drop/failure markers), notes and PRs.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    args: z.object({ id: z.string() }),
    run: (u, a: { id: string }) => workoutToText(u.ds, a.id, u.weightUnit),
  },
  {
    name: 'compare_workouts',
    description: 'Exercise-by-exercise comparison of two workouts (sets, volume change, e1RM change). Omit b to compare with the most similar earlier workout.',
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'string', description: 'Workout id.' }, b: { type: 'string', description: 'Other workout id (optional).' } },
      required: ['a'],
      additionalProperties: false,
    },
    args: z.object({ a: z.string(), b: z.string().optional() }),
    run: (u, a: { a: string; b?: string }) => {
      const b = a.b ?? findComparableWorkout(u.ds, a.a)?.id;
      return b ? compareWorkouts(u.ds, a.a, b, u.weightUnit) : 'No earlier comparable workout found.';
    },
  },
  {
    name: 'get_exercise_history',
    description: 'Personal records and recent sessions for one exercise (by name or id), including best e1RM per session.',
    inputSchema: {
      type: 'object',
      properties: {
        exercise: { type: 'string', description: 'Exercise name (e.g. "Bench Press (Barbell)", partial match ok) or id.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Sessions to show (default 15).' },
      },
      required: ['exercise'],
      additionalProperties: false,
    },
    args: z.object({ exercise: z.string(), limit: z.number().int().min(1).max(200).default(15) }),
    run: (u, a: { exercise: string; limit: number }) => {
      const ex = resolveExercise(u, a.exercise);
      if (!ex) return `No exercise matches "${a.exercise}". Use list_exercises to search.`;
      const unit = u.weightUnit;
      const kg = (v?: number) => (v == null ? '-' : `${+fromKg(v, unit).toFixed(1)} ${unit}`);
      const rec = exerciseRecords(u.ds, ex);
      const hist = exerciseHistory(u.ds, ex.id);
      const lines = [
        `# ${ex.name} (${ex.logType}, ${ex.equipment}, ${ex.bodyPart}) [id: ${ex.id}]`,
        `Sessions logged: ${hist.length}`,
        `Records: e1RM ${kg(rec.estimated1RM?.value)}, max weight ${kg(rec.maxWeight?.value)}, best set volume ${kg(rec.maxSetVolume?.value)}, best session volume ${kg(rec.maxSessionVolume?.value)}, max reps ${rec.maxReps?.value ?? '-'}`,
        `Rep maxes: ${Object.entries(rec.repMaxes).map(([r, e]) => `${r}RM ${kg(e.value)} (${iso(e.at)})`).join(', ') || '-'}`,
        '',
        '## Recent sessions',
      ];
      for (const h of hist.slice(0, a.limit)) {
        const best = Math.max(0, ...h.sets.filter(isWorkingSet).map((s) => estimate1RM(s.weight ?? 0, s.reps ?? 0) ?? 0));
        lines.push(`- ${iso(h.workout.startedAt)} (${h.workout.id}): ${h.sets.filter((s) => s.completed).map((s) => formatSet(s, unit)).join(', ')}${best ? ` · e1RM ${kg(best)}` : ''}`);
      }
      return lines.join('\n');
    },
  },
  {
    name: 'list_exercises',
    description: 'Search the exercise library (built-in and custom). By default only exercises that have been logged, with session counts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        include_unused: { type: 'boolean', description: 'Also list exercises never logged (default false).' },
      },
      additionalProperties: false,
    },
    args: z.object({ query: z.string().optional(), include_unused: z.boolean().default(false) }),
    run: (u, a: { query?: string; include_unused: boolean }) => {
      const counts = new Map<string, number>();
      for (const we of u.ds.workoutExercises) counts.set(we.exerciseId, (counts.get(we.exerciseId) ?? 0) + 1);
      const list = u.ds.exercises
        .filter((e) => a.include_unused || counts.has(e.id))
        .filter((e) => !a.query || e.name.toLowerCase().includes(a.query.toLowerCase()))
        .sort((x, y) => (counts.get(y.id) ?? 0) - (counts.get(x.id) ?? 0) || x.name.localeCompare(y.name));
      return list.length ? list.slice(0, 300).map((e) => `- ${e.name} · ${e.bodyPart} · ${counts.get(e.id) ?? 0} sessions [id: ${e.id}]`).join('\n') : 'No exercises match.';
    },
  },
  {
    name: 'get_measurements',
    description: `Body measurements over time. Kinds: ${MEASUREMENT_KINDS.join(', ')}.`,
    inputSchema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: [...MEASUREMENT_KINDS] }, limit: { type: 'integer', minimum: 1, maximum: 500 } },
      additionalProperties: false,
    },
    args: z.object({ kind: z.enum(MEASUREMENT_KINDS).optional(), limit: z.number().int().min(1).max(500).default(60) }),
    run: (u, a: { kind?: string; limit: number }) => {
      const list = u.measurements.filter((m) => !a.kind || m.kind === a.kind).sort((x, y) => y.takenAt - x.takenAt);
      if (!list.length) return 'No measurements recorded.';
      return list
        .slice(0, a.limit)
        .map((m) => {
          const v = m.kind === 'body_weight' ? `${+fromKg(m.value, u.weightUnit).toFixed(1)} ${u.weightUnit}` : m.kind === 'body_fat' ? `${m.value}%` : m.kind === 'caloric_intake' ? `${m.value} kcal` : `${m.value} cm`;
          return `- ${iso(m.takenAt)} · ${m.kind} · ${v}${m.note ? ` · ${m.note}` : ''}`;
        })
        .join('\n');
    },
  },
];

type JsonRpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };

function rpcResult(id: JsonRpc['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}
function rpcError(id: JsonRpc['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

export function handleRpc(db: DB, userId: string, msg: JsonRpc) {
  switch (msg.method) {
    case 'initialize': {
      const requested = String(msg.params?.protocolVersion ?? '');
      return rpcResult(msg.id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'open-workouts', title: 'Open Workouts', version: VERSION },
        instructions:
          "Read-only access to the user's strength-training log. Start with get_training_digest for an overview, then drill into workouts and exercises. Weights are in the user's preferred unit.",
      });
    }
    case 'ping':
      return rpcResult(msg.id, {});
    case 'tools/list':
      return rpcResult(msg.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: true, openWorldHint: false },
        })),
      });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      const args = tool.args.safeParse(msg.params?.arguments ?? {});
      if (!args.success) {
        return rpcResult(msg.id, { content: [{ type: 'text', text: `Invalid arguments: ${args.error.message}` }], isError: true });
      }
      const text = tool.run(loadUserData(db, userId), args.data as never);
      return rpcResult(msg.id, { content: [{ type: 'text', text }], isError: false });
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export function registerMcp(app: FastifyInstance, db: DB, authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) {
  app.post('/mcp', { preHandler: authenticate }, async (req, reply) => {
    const body = req.body as JsonRpc | JsonRpc[];
    const msgs = Array.isArray(body) ? body : [body];
    if (!msgs.length || msgs.some((m) => !m || m.jsonrpc !== '2.0' || typeof m.method !== 'string')) {
      return reply.code(400).send(rpcError(null, -32600, 'Invalid JSON-RPC request'));
    }
    // Notifications (no id) are acknowledged without a body.
    const responses = msgs.filter((m) => m.id !== undefined).map((m) => handleRpc(db, req.user!.id, m));
    if (!responses.length) return reply.code(202).send();
    return reply.header('content-type', 'application/json').send(Array.isArray(body) ? responses : responses[0]);
  });
  // Stateless server: no server-initiated SSE stream and no sessions to delete.
  app.get('/mcp', async (_req, reply) => reply.code(405).header('allow', 'POST').send());
  app.delete('/mcp', async (_req, reply) => reply.code(405).header('allow', 'POST').send());
}
