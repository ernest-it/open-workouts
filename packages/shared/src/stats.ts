// Derived data: history, personal records, "previous" values, summaries.

import { estimate1RM } from './calc';
import type { Exercise, LogType, Workout, WorkoutExercise, WorkoutSet } from './schema';

export interface Dataset {
  exercises: Exercise[]; // built-in + custom
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  sets: WorkoutSet[];
}

const alive = <T extends { deletedAt: number | null }>(x: T) => !x.deletedAt;

/** Sets that count toward records/volume: completed, not warm-ups. */
export const isWorkingSet = (s: WorkoutSet) => s.completed && s.kind !== 'warmup' && !s.deletedAt;

export function setVolume(s: WorkoutSet, logType: LogType = 'weight_reps'): number {
  if (logType === 'assisted_bodyweight' || logType === 'reps' || logType === 'duration' || logType === 'distance_duration')
    return 0;
  return (s.weight ?? 0) * (s.reps ?? 0);
}

export interface ExerciseSession {
  workout: Workout;
  workoutExercise: WorkoutExercise;
  sets: WorkoutSet[];
}

/** Every completed session of an exercise, newest first. */
export function exerciseHistory(ds: Dataset, exerciseId: string): ExerciseSession[] {
  const workouts = new Map(ds.workouts.filter(alive).map((w) => [w.id, w]));
  const setsByWex = groupBy(ds.sets.filter(alive), (s) => s.workoutExerciseId);
  const out: ExerciseSession[] = [];
  for (const we of ds.workoutExercises) {
    if (we.exerciseId !== exerciseId || we.deletedAt) continue;
    const w = workouts.get(we.workoutId);
    if (!w || w.endedAt == null) continue;
    const sets = (setsByWex.get(we.id) ?? []).sort((a, b) => a.position - b.position);
    out.push({ workout: w, workoutExercise: we, sets });
  }
  return out.sort((a, b) => b.workout.startedAt - a.workout.startedAt);
}

/** The most recent finished session's sets, used to pre-fill the "Previous" column. */
export function previousSets(ds: Dataset, exerciseId: string, before = Infinity): WorkoutSet[] {
  const hist = exerciseHistory(ds, exerciseId).filter((h) => h.workout.startedAt < before);
  return hist[0]?.sets.filter((s) => s.completed) ?? [];
}

export interface RecordEntry {
  value: number;
  setId: string;
  workoutId: string;
  at: number;
}

export interface ExerciseRecords {
  estimated1RM?: RecordEntry;
  maxWeight?: RecordEntry;
  maxSetVolume?: RecordEntry;
  maxSessionVolume?: RecordEntry;
  maxReps?: RecordEntry;
  longestDuration?: RecordEntry;
  longestDistance?: RecordEntry;
  /** Best weight lifted for exactly N reps (N = 1..12; estimates are unreliable beyond). */
  repMaxes: Record<number, RecordEntry>;
}

export function exerciseRecords(ds: Dataset, exercise: Pick<Exercise, 'id' | 'logType'>): ExerciseRecords {
  const rec: ExerciseRecords = { repMaxes: {} };
  const better = (cur: RecordEntry | undefined, v: number) => v > 0 && (!cur || v > cur.value);
  for (const sess of exerciseHistory(ds, exercise.id).reverse()) {
    let sessionVolume = 0;
    for (const s of sess.sets) {
      if (!isWorkingSet(s)) continue;
      const entry = (value: number): RecordEntry => ({
        value,
        setId: s.id,
        workoutId: sess.workout.id,
        at: sess.workout.startedAt,
      });
      const w = s.weight ?? 0;
      const r = s.reps ?? 0;
      const vol = setVolume(s, exercise.logType);
      sessionVolume += vol;
      if (exercise.logType === 'weight_reps' || exercise.logType === 'weighted_bodyweight') {
        const e1 = estimate1RM(w, r) ?? 0;
        if (better(rec.estimated1RM, e1)) rec.estimated1RM = entry(e1);
        if (better(rec.maxWeight, w)) rec.maxWeight = entry(w);
        if (better(rec.maxSetVolume, vol)) rec.maxSetVolume = entry(vol);
        if (r > 0 && r <= 12 && w > 0 && better(rec.repMaxes[r], w)) rec.repMaxes[r] = entry(w);
      }
      if (better(rec.maxReps, r)) rec.maxReps = entry(r);
      if (better(rec.longestDuration, s.duration ?? 0)) rec.longestDuration = entry(s.duration ?? 0);
      if (better(rec.longestDistance, s.distance ?? 0)) rec.longestDistance = entry(s.distance ?? 0);
    }
    if (better(rec.maxSessionVolume, sessionVolume)) {
      rec.maxSessionVolume = {
        value: sessionVolume,
        setId: '',
        workoutId: sess.workout.id,
        at: sess.workout.startedAt,
      };
    }
  }
  return rec;
}

/** Set ids in `workoutId` that set a new record compared to everything before it. */
export function workoutPRs(ds: Dataset, workoutId: string): { setId: string; types: string[] }[] {
  const exById = new Map(ds.exercises.map((e) => [e.id, e]));
  const w = ds.workouts.find((x) => x.id === workoutId);
  if (!w) return [];
  const prior: Dataset = { ...ds, workouts: ds.workouts.filter((x) => x.startedAt < w.startedAt) };
  const result = new Map<string, Set<string>>();
  for (const we of ds.workoutExercises.filter((x) => x.workoutId === workoutId && !x.deletedAt)) {
    const ex = exById.get(we.exerciseId);
    if (!ex) continue;
    const before = exerciseRecords(prior, ex);
    const mark = (setId: string, t: string) => {
      const s = result.get(setId) ?? new Set();
      s.add(t);
      result.set(setId, s);
    };
    let best1 = before.estimated1RM?.value ?? 0;
    let bestW = before.maxWeight?.value ?? 0;
    let bestVol = before.maxSetVolume?.value ?? 0;
    let bestReps = before.maxReps?.value ?? 0;
    const sets = ds.sets
      .filter((x) => x.workoutExerciseId === we.id && isWorkingSet(x))
      .sort((a, b) => a.position - b.position);
    for (const s of sets) {
      const wgt = s.weight ?? 0;
      const reps = s.reps ?? 0;
      if (ex.logType === 'weight_reps' || ex.logType === 'weighted_bodyweight') {
        const e1 = estimate1RM(wgt, reps) ?? 0;
        if (e1 > best1) (best1 = e1), mark(s.id, '1RM');
        if (wgt > bestW) (bestW = wgt), mark(s.id, 'weight');
        if (wgt * reps > bestVol) (bestVol = wgt * reps), mark(s.id, 'volume');
      } else if (reps > bestReps) (bestReps = reps), mark(s.id, 'reps');
    }
  }
  return [...result].map(([setId, t]) => ({ setId, types: [...t] }));
}

export interface WorkoutSummary {
  durationSeconds: number;
  volume: number; // kg
  setCount: number;
  exerciseCount: number;
}

export function workoutSummary(ds: Dataset, workoutId: string): WorkoutSummary {
  const w = ds.workouts.find((x) => x.id === workoutId);
  const exById = new Map(ds.exercises.map((e) => [e.id, e]));
  const wexs = ds.workoutExercises.filter((x) => x.workoutId === workoutId && !x.deletedAt);
  let volume = 0;
  let setCount = 0;
  for (const we of wexs) {
    const lt = exById.get(we.exerciseId)?.logType;
    for (const s of ds.sets) {
      if (s.workoutExerciseId !== we.id || !isWorkingSet(s)) continue;
      setCount++;
      volume += setVolume(s, lt);
    }
  }
  const end = w?.endedAt ?? Date.now();
  return {
    durationSeconds: w ? Math.max(0, Math.round((end - w.startedAt) / 1000)) : 0,
    volume,
    setCount,
    exerciseCount: wexs.length,
  };
}

export interface WorkoutListEntry extends WorkoutSummary {
  /** Exercises in order, with their number of working sets. */
  exercises: { exerciseId: string; workingSets: number }[];
}

/**
 * Summaries for every workout in one pass over the data, for lists. Calling workoutSummary per
 * workout scans every set once per exercise, which gets slow with a long history.
 */
export function workoutSummaries(ds: Dataset): Map<string, WorkoutListEntry> {
  const logType = new Map(ds.exercises.map((e) => [e.id, e.logType]));
  const byWe = new Map<string, { volume: number; sets: number }>();
  for (const s of ds.sets) {
    if (!isWorkingSet(s)) continue;
    const e = byWe.get(s.workoutExerciseId) ?? { volume: 0, sets: 0 };
    e.sets++;
    e.volume += setVolume(s, undefined);
    byWe.set(s.workoutExerciseId, e);
  }
  const wexsByWorkout = groupBy(
    ds.workoutExercises.filter(alive).sort((a, b) => a.position - b.position),
    (x) => x.workoutId,
  );
  const out = new Map<string, WorkoutListEntry>();
  for (const w of ds.workouts) {
    if (w.deletedAt) continue;
    const wexs = wexsByWorkout.get(w.id) ?? [];
    let volume = 0;
    let setCount = 0;
    const exercises: WorkoutListEntry['exercises'] = [];
    for (const we of wexs) {
      const agg = byWe.get(we.id);
      const lt = logType.get(we.exerciseId);
      // setVolume depends on the log type; recompute only when it zeroes the volume.
      const zero = lt === 'assisted_bodyweight' || lt === 'reps' || lt === 'duration' || lt === 'distance_duration';
      volume += zero ? 0 : (agg?.volume ?? 0);
      setCount += agg?.sets ?? 0;
      exercises.push({ exerciseId: we.exerciseId, workingSets: agg?.sets ?? 0 });
    }
    const end = w.endedAt ?? Date.now();
    out.set(w.id, {
      durationSeconds: Math.max(0, Math.round((end - w.startedAt) / 1000)),
      volume,
      setCount,
      exerciseCount: wexs.length,
      exercises,
    });
  }
  return out;
}

/** Workouts per ISO week (Monday start), for the dashboard chart. */
export function workoutsPerWeek(ds: Dataset, weeks = 12, now = Date.now()): { weekStart: number; count: number }[] {
  const startOfWeek = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d.getTime();
  };
  const current = startOfWeek(now);
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    weekStart: startOfWeek(current - (weeks - 1 - i) * 7 * 86_400_000 + 3_600_000 * 12),
    count: 0,
  }));
  for (const w of ds.workouts) {
    if (w.deletedAt || w.endedAt == null) continue;
    const ws = startOfWeek(w.startedAt);
    const b = buckets.find((x) => x.weekStart === ws);
    if (b) b.count++;
  }
  return buckets;
}

/** Local midnight of the Monday starting the week that contains `t`. */
export function startOfWeek(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/**
 * Weekly goal progress: workouts this week, and how many weeks in a row (up to last week, plus
 * this week once it's reached) hit the goal. This week doesn't break the streak until it's over.
 */
export function weeklyGoal(ds: Dataset, goal: number, now = Date.now()): { thisWeek: number; streak: number; goal: number } {
  const counts = new Map<number, number>();
  for (const w of ds.workouts) {
    if (w.deletedAt || w.endedAt == null) continue;
    const k = startOfWeek(w.startedAt);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const current = startOfWeek(now);
  const thisWeek = counts.get(current) ?? 0;
  const target = Math.max(1, goal);
  let streak = thisWeek >= target ? 1 : 0;
  // Step back a week at a time; noon avoids landing on the wrong side of a DST change.
  for (let k = startOfWeek(current - 4 * 86_400_000); (counts.get(k) ?? 0) >= target; k = startOfWeek(k - 4 * 86_400_000)) streak++;
  return { thisWeek, streak, goal: target };
}

/**
 * When to warn that the weekly-goal streak is about to break: 9:00 on the last day you can still
 * reach the goal doing one workout a day (Sunday if one is missing, Saturday if two, ...). Null
 * when there's no streak to lose, the goal is already met, it can no longer be met, or that
 * moment has passed.
 */
export function streakReminder(
  ds: Dataset,
  goal: number,
  now = Date.now(),
): { at: number; title: string; body: string } | null {
  const g = weeklyGoal(ds, goal, now);
  const needed = g.goal - g.thisWeek;
  if (needed <= 0 || g.streak === 0) return null;
  const day = new Date(startOfWeek(now));
  day.setDate(day.getDate() + 7 - needed);
  day.setHours(9, 0, 0, 0);
  if (day.getTime() <= now) return null;
  const weeks = `${g.streak}-week streak`;
  return {
    at: day.getTime(),
    title: 'Keep your streak going',
    body:
      needed === 1
        ? `One more workout this week keeps your ${weeks}. Today is the last day.`
        : `${needed} more workouts this week keep your ${weeks}: one a day from today.`,
  };
}

/**
 * Working sets per body part per week, oldest week first, for "am I training everything?".
 * Only finished workouts count.
 */
export function setsPerBodyPart(ds: Dataset, weeks = 4, now = Date.now()): { weekStart: number; sets: Record<string, number> }[] {
  const bodyPart = new Map(ds.exercises.map((e) => [e.id, e.bodyPart]));
  const current = startOfWeek(now);
  const starts: number[] = [current];
  while (starts.length < weeks) starts.unshift(startOfWeek(starts[0]! - 4 * 86_400_000));
  const buckets = new Map(starts.map((s) => [s, {} as Record<string, number>]));
  const wkOf = new Map<string, number>();
  for (const w of ds.workouts) if (!w.deletedAt && w.endedAt != null) wkOf.set(w.id, startOfWeek(w.startedAt));
  const partOfWe = new Map<string, string | undefined>();
  for (const we of ds.workoutExercises) if (!we.deletedAt) partOfWe.set(we.id, bodyPart.get(we.exerciseId));
  for (const s of ds.sets) {
    if (!isWorkingSet(s)) continue;
    const b = buckets.get(wkOf.get(s.workoutId) ?? -1);
    const part = partOfWe.get(s.workoutExerciseId);
    if (!b || !part) continue;
    b[part] = (b[part] ?? 0) + 1;
  }
  return starts.map((weekStart) => ({ weekStart, sets: buckets.get(weekStart)! }));
}

/** Per-session best e1RM / max weight / volume series for charts. */
export function exerciseSeries(ds: Dataset, exercise: Pick<Exercise, 'id' | 'logType'>) {
  return exerciseHistory(ds, exercise.id)
    .reverse()
    .map((sess) => {
      const working = sess.sets.filter(isWorkingSet);
      return {
        at: sess.workout.startedAt,
        best1RM: Math.max(0, ...working.map((s) => estimate1RM(s.weight ?? 0, s.reps ?? 0) ?? 0)),
        maxWeight: Math.max(0, ...working.map((s) => s.weight ?? 0)),
        volume: working.reduce((a, s) => a + setVolume(s, exercise.logType), 0),
        maxReps: Math.max(0, ...working.map((s) => s.reps ?? 0)),
      };
    });
}

export function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}
