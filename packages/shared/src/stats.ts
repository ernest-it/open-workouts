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
