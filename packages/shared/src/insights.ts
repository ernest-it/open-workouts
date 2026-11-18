// Deterministic, LLM-ready summaries of training data.
//
// Every number here is computed in code; a language model only interprets the
// result. That keeps reports cheap (a compact digest instead of raw rows) and
// stops the model from inventing statistics.

import { estimate1RM, formatDuration, fromKg, type WeightUnit } from './calc';
import type { Exercise, Measurement, Workout, WorkoutSet } from './schema';
import { exerciseHistory, groupBy, isWorkingSet, setVolume, workoutPRs, type Dataset } from './stats';

const DAY = 86_400_000;

export interface DigestOptions {
  now?: number;
  /** Length of the reporting period in days (compared with the period before it). */
  days?: number;
  weightUnit?: WeightUnit;
  measurements?: Measurement[];
  /** Include a per-workout set listing for the period (default true). */
  includeWorkouts?: boolean;
}

const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? '+∞' : '±0') : `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1)}%`);
const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function w(kg: number | null | undefined, unit: WeightUnit) {
  return kg == null ? '-' : `${+fromKg(kg, unit).toFixed(1)}`;
}

/** Compact one-line rendering of a set: "100x5 @8", "W 60x10", "45s", "5.00km in 25:00". */
export function formatSet(s: WorkoutSet, unit: WeightUnit = 'kg'): string {
  const kind = s.kind === 'warmup' ? 'W ' : s.kind === 'drop' ? 'D ' : s.kind === 'failure' ? 'F ' : '';
  let body: string;
  if (s.distance != null) body = `${(s.distance / 1000).toFixed(2)}km${s.duration != null ? ` in ${formatDuration(s.duration)}` : ''}`;
  else if (s.weight != null && s.reps != null) body = `${w(s.weight, unit)}x${s.reps}`;
  else if (s.reps != null) body = `${s.reps} reps`;
  else if (s.duration != null) body = formatDuration(s.duration);
  else body = '?';
  return `${kind}${body}${s.rpe != null ? ` @${s.rpe}` : ''}`;
}

/** Plain-text rendering of one workout (used in digests, comparisons and tool output). */
export function workoutToText(ds: Dataset, workoutId: string, unit: WeightUnit = 'kg'): string {
  const wk = ds.workouts.find((x) => x.id === workoutId);
  if (!wk) return `Workout ${workoutId} not found.`;
  const exById = new Map(ds.exercises.map((e) => [e.id, e]));
  const prs = new Map(workoutPRs(ds, workoutId).map((p) => [p.setId, p.types]));
  const dur = wk.endedAt ? formatDuration((wk.endedAt - wk.startedAt) / 1000) : 'in progress';
  const lines = [`### ${fmtDate(wk.startedAt)} · ${wk.name} (${dur}) [id: ${wk.id}]`];
  if (wk.notes) lines.push(`Notes: ${wk.notes}`);
  const wexs = ds.workoutExercises.filter((x) => x.workoutId === workoutId && !x.deletedAt).sort((a, b) => a.position - b.position);
  for (const we of wexs) {
    const sets = ds.sets.filter((s) => s.workoutExerciseId === we.id && !s.deletedAt && s.completed).sort((a, b) => a.position - b.position);
    const prSets = sets.filter((s) => prs.has(s.id)).map((s) => `${formatSet(s, unit)} (${prs.get(s.id)!.join('/')})`);
    lines.push(
      `- ${exById.get(we.exerciseId)?.name ?? 'Unknown'}: ${sets.map((s) => formatSet(s, unit)).join(', ') || 'no completed sets'}` +
        (prSets.length ? ` · PR: ${prSets.join(', ')}` : '') +
        (we.notes ? ` · note: ${we.notes}` : ''),
    );
  }
  return lines.join('\n');
}

interface PeriodStats {
  workouts: number;
  sets: number;
  volume: number;
  seconds: number;
  setsByBodyPart: Map<string, number>;
}

function periodStats(ds: Dataset, from: number, to: number): PeriodStats {
  const exById = new Map(ds.exercises.map((e) => [e.id, e]));
  const workouts = ds.workouts.filter((x) => !x.deletedAt && x.endedAt != null && x.startedAt >= from && x.startedAt < to);
  const ids = new Set(workouts.map((x) => x.id));
  const wexById = new Map(ds.workoutExercises.filter((x) => ids.has(x.workoutId)).map((x) => [x.id, x]));
  const out: PeriodStats = { workouts: workouts.length, sets: 0, volume: 0, seconds: 0, setsByBodyPart: new Map() };
  for (const wk of workouts) out.seconds += ((wk.endedAt ?? wk.startedAt) - wk.startedAt) / 1000;
  for (const s of ds.sets) {
    const we = wexById.get(s.workoutExerciseId);
    if (!we || !isWorkingSet(s)) continue;
    const ex = exById.get(we.exerciseId);
    out.sets++;
    out.volume += setVolume(s, ex?.logType);
    const bp = ex?.bodyPart ?? 'other';
    out.setsByBodyPart.set(bp, (out.setsByBodyPart.get(bp) ?? 0) + 1);
  }
  return out;
}

function bestE1rm(sets: WorkoutSet[]) {
  return Math.max(0, ...sets.filter(isWorkingSet).map((s) => estimate1RM(s.weight ?? 0, s.reps ?? 0) ?? 0));
}

/**
 * A compact Markdown digest of recent training, designed as LLM context
 * (and readable on its own). Typically 1–4k tokens for a week.
 */
export function buildTrainingDigest(ds: Dataset, opts: DigestOptions = {}): string {
  const now = opts.now ?? Date.now();
  const days = opts.days ?? 7;
  const unit = opts.weightUnit ?? 'kg';
  const from = now - days * DAY;
  const prevFrom = from - days * DAY;
  const cur = periodStats(ds, from, now);
  const prev = periodStats(ds, prevFrom, from);
  const L: string[] = [];

  L.push(`# Training digest: ${fmtDate(from)} → ${fmtDate(now)} (${days} days)`);
  L.push(`Units: weight in ${unit}, volume = weight × reps of completed non-warm-up sets.`);
  L.push('');
  L.push(`## Totals (this period vs previous ${days} days)`);
  L.push('| Metric | This period | Previous | Change |');
  L.push('|---|---|---|---|');
  L.push(`| Workouts | ${cur.workouts} | ${prev.workouts} | ${pct(cur.workouts, prev.workouts)} |`);
  L.push(`| Working sets | ${cur.sets} | ${prev.sets} | ${pct(cur.sets, prev.sets)} |`);
  L.push(`| Volume (${unit}) | ${w(cur.volume, unit)} | ${w(prev.volume, unit)} | ${pct(cur.volume, prev.volume)} |`);
  L.push(`| Training time | ${formatDuration(cur.seconds)} | ${formatDuration(prev.seconds)} | ${pct(cur.seconds, prev.seconds)} |`);
  L.push('');

  const parts = [...new Set([...cur.setsByBodyPart.keys(), ...prev.setsByBodyPart.keys()])].sort();
  if (parts.length) {
    L.push('## Working sets per body part');
    L.push(parts.map((p) => `${p}: ${cur.setsByBodyPart.get(p) ?? 0} (prev ${prev.setsByBodyPart.get(p) ?? 0})`).join(' · '));
    L.push('');
  }

  // Per-exercise progress for exercises trained this period.
  const exById = new Map(ds.exercises.map((e) => [e.id, e]));
  const trained = new Set(
    ds.workoutExercises
      .filter((we) => {
        const wk = ds.workouts.find((x) => x.id === we.workoutId);
        return !we.deletedAt && wk && !wk.deletedAt && wk.endedAt != null && wk.startedAt >= from && wk.startedAt < now;
      })
      .map((we) => we.exerciseId),
  );
  if (trained.size) {
    L.push('## Exercises this period');
    L.push(`| Exercise | Sessions | Best set | Best e1RM | Prev period e1RM | All-time e1RM before | Trend |`);
    L.push('|---|---|---|---|---|---|---|');
    for (const exId of trained) {
      const ex = exById.get(exId);
      if (!ex) continue;
      const hist = exerciseHistory(ds, exId);
      const inCur = hist.filter((h) => h.workout.startedAt >= from && h.workout.startedAt < now);
      const inPrev = hist.filter((h) => h.workout.startedAt >= prevFrom && h.workout.startedAt < from);
      const before = hist.filter((h) => h.workout.startedAt < from);
      const curSets = inCur.flatMap((h) => h.sets);
      const weighted = ex.logType === 'weight_reps' || ex.logType === 'weighted_bodyweight';
      const best = curSets.filter(isWorkingSet).sort((a, b) =>
        weighted ? (estimate1RM(b.weight ?? 0, b.reps ?? 0) ?? 0) - (estimate1RM(a.weight ?? 0, a.reps ?? 0) ?? 0) : (b.reps ?? 0) - (a.reps ?? 0),
      )[0];
      const e1 = bestE1rm(curSets);
      const e1Prev = bestE1rm(inPrev.flatMap((h) => h.sets));
      const e1Before = bestE1rm(before.flatMap((h) => h.sets));
      const trend = !weighted ? '' : e1 > e1Before && e1Before > 0 ? 'NEW BEST' : e1Prev ? pct(e1, e1Prev) : 'n/a';
      L.push(
        `| ${ex.name} | ${inCur.length} | ${best ? formatSet(best, unit) : '-'} | ${weighted ? w(e1, unit) : '-'} | ${weighted && e1Prev ? w(e1Prev, unit) : '-'} | ${weighted && e1Before ? w(e1Before, unit) : '-'} | ${trend} |`,
      );
    }
    L.push('');
  }

  // Plateaus: lifts trained ≥3 times in 6 weeks whose best e1RM hasn't beaten the 6 weeks before.
  const plateaus: string[] = [];
  for (const ex of ds.exercises) {
    if (ex.logType !== 'weight_reps' && ex.logType !== 'weighted_bodyweight') continue;
    const hist = exerciseHistory(ds, ex.id);
    const recent = hist.filter((h) => h.workout.startedAt >= now - 42 * DAY && h.workout.startedAt < now);
    const earlier = hist.filter((h) => h.workout.startedAt >= now - 84 * DAY && h.workout.startedAt < now - 42 * DAY);
    if (recent.length < 3 || !earlier.length) continue;
    const r = bestE1rm(recent.flatMap((h) => h.sets));
    const e = bestE1rm(earlier.flatMap((h) => h.sets));
    if (e > 0 && r <= e * 1.005) plateaus.push(`${ex.name} (best e1RM last 6 wk ${w(r, unit)} vs ${w(e, unit)} the 6 wk before, ${recent.length} sessions)`);
  }
  if (plateaus.length) {
    L.push('## Possible plateaus');
    for (const p of plateaus) L.push(`- ${p}`);
    L.push('');
  }

  // Consistency over 8 weeks.
  const weeks: number[] = [];
  for (let i = 7; i >= 0; i--) {
    const a = now - (i + 1) * 7 * DAY;
    const b = now - i * 7 * DAY;
    weeks.push(ds.workouts.filter((x) => !x.deletedAt && x.endedAt != null && x.startedAt >= a && x.startedAt < b).length);
  }
  L.push(`## Consistency`);
  L.push(`Workouts per week, oldest → newest (8 weeks): ${weeks.join(', ')}`);
  const lastWorkout = ds.workouts.filter((x) => !x.deletedAt && x.endedAt != null).sort((a, b) => b.startedAt - a.startedAt)[0];
  if (lastWorkout) L.push(`Last workout: ${fmtDate(lastWorkout.startedAt)} (${Math.floor((now - lastWorkout.startedAt) / DAY)} days ago)`);
  L.push('');

  const bw = (opts.measurements ?? []).filter((m) => m.kind === 'body_weight' && !m.deletedAt).sort((a, b) => a.takenAt - b.takenAt);
  if (bw.length) {
    const recentBw = bw.filter((m) => m.takenAt >= now - 28 * DAY);
    L.push('## Body weight');
    L.push(`Latest ${w(bw[bw.length - 1]!.value, unit)} ${unit} on ${fmtDate(bw[bw.length - 1]!.takenAt)}`);
    if (recentBw.length >= 2)
      L.push(`Last 4 weeks: ${w(recentBw[0]!.value, unit)} → ${w(recentBw[recentBw.length - 1]!.value, unit)} ${unit} (${recentBw.length} entries)`);
    L.push('');
  }

  if (opts.includeWorkouts !== false) {
    const list = ds.workouts
      .filter((x) => !x.deletedAt && x.endedAt != null && x.startedAt >= from && x.startedAt < now)
      .sort((a, b) => a.startedAt - b.startedAt);
    if (list.length) {
      L.push('## Workouts this period');
      for (const wk of list) L.push(workoutToText(ds, wk.id, unit), '');
    } else L.push('No workouts were logged in this period.');
  }
  return L.join('\n').trim() + '\n';
}

/** Side-by-side comparison of two workouts, computed exercise by exercise. */
export function compareWorkouts(ds: Dataset, aId: string, bId: string, unit: WeightUnit = 'kg'): string {
  const a = ds.workouts.find((x) => x.id === aId);
  const b = ds.workouts.find((x) => x.id === bId);
  if (!a || !b) return 'One or both workouts were not found.';
  const [older, newer] = a.startedAt <= b.startedAt ? [a, b] : [b, a];
  const exById = new Map(ds.exercises.map((e) => [e.id, e]));
  const perEx = (wk: Workout) => {
    const m = new Map<string, WorkoutSet[]>();
    for (const we of ds.workoutExercises.filter((x) => x.workoutId === wk.id && !x.deletedAt)) {
      const sets = ds.sets.filter((s) => s.workoutExerciseId === we.id && isWorkingSet(s));
      m.set(we.exerciseId, [...(m.get(we.exerciseId) ?? []), ...sets]);
    }
    return m;
  };
  const A = perEx(older);
  const B = perEx(newer);
  const L = [`# Comparison: ${fmtDate(older.startedAt)} "${older.name}" → ${fmtDate(newer.startedAt)} "${newer.name}"`, ''];
  L.push('| Exercise | Earlier | Later | Volume change | Best e1RM change |');
  L.push('|---|---|---|---|---|');
  for (const exId of new Set([...A.keys(), ...B.keys()])) {
    const ex = exById.get(exId) as Exercise | undefined;
    const sa = A.get(exId) ?? [];
    const sb = B.get(exId) ?? [];
    const va = sa.reduce((t, s) => t + setVolume(s, ex?.logType), 0);
    const vb = sb.reduce((t, s) => t + setVolume(s, ex?.logType), 0);
    L.push(
      `| ${ex?.name ?? 'Unknown'} | ${sa.map((s) => formatSet(s, unit)).join(', ') || 'not done'} | ${sb.map((s) => formatSet(s, unit)).join(', ') || 'not done'} | ${
        sa.length && sb.length ? pct(vb, va) : '-'
      } | ${sa.length && sb.length && bestE1rm(sa) ? pct(bestE1rm(sb), bestE1rm(sa)) : '-'} |`,
    );
  }
  const ta = periodStats(ds, older.startedAt, older.startedAt + 1);
  const tb = periodStats(ds, newer.startedAt, newer.startedAt + 1);
  L.push('');
  L.push(`Totals: ${ta.sets} → ${tb.sets} working sets, ${w(ta.volume, unit)} → ${w(tb.volume, unit)} ${unit} volume (${pct(tb.volume, ta.volume)}).`);
  L.push('', workoutToText(ds, older.id, unit), '', workoutToText(ds, newer.id, unit));
  return L.join('\n') + '\n';
}

/** Find the most recent earlier workout with the same template or the most exercises in common. */
export function findComparableWorkout(ds: Dataset, workoutId: string): Workout | undefined {
  const wk = ds.workouts.find((x) => x.id === workoutId);
  if (!wk) return undefined;
  const exOf = groupBy(
    ds.workoutExercises.filter((x) => !x.deletedAt),
    (x) => x.workoutId,
  );
  const mine = new Set((exOf.get(workoutId) ?? []).map((x) => x.exerciseId));
  let best: { w: Workout; score: number } | undefined;
  for (const other of ds.workouts) {
    if (other.id === workoutId || other.deletedAt || other.endedAt == null || other.startedAt >= wk.startedAt) continue;
    const common = (exOf.get(other.id) ?? []).filter((x) => mine.has(x.exerciseId)).length;
    const score = common + (wk.templateId && other.templateId === wk.templateId ? 100 : 0) + (other.name === wk.name ? 10 : 0);
    if (score > 0 && (!best || score > best.score || (score === best.score && other.startedAt > best.w.startedAt))) best = { w: other, score };
  }
  return best?.w;
}
