// Import / export of the Strong app's CSV data export format.
//
// Known variants handled:
//  * comma-delimited (current) and semicolon-delimited (older) files
//  * optional "Weight Unit" / "Distance Unit" columns (older exports)
//  * "Set Order" as a number, or W / D / F for warm-up / drop / failure sets
//  * non-set rows such as "Rest Timer" are skipped
//  * Duration as "1h 5m", "45m", "30s" or "1:05:00"

import { parseCsv, toCsv } from './csv';
import { fromKg, toKg, type DistanceUnit, type WeightUnit } from './calc';
import { exerciseNameKey, findBuiltinByName, guessExerciseShape } from './exercises';
import type {
  ChangeSet,
  Exercise,
  SetKind,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from './schema';

export interface StrongImportOptions {
  /** Unit of the Weight column when the file has no "Weight Unit" column. */
  weightUnit: WeightUnit;
  /** Unit of the Distance column when the file has no "Distance Unit" column. */
  distanceUnit: DistanceUnit;
  /** User's existing custom exercises (to match by name before creating new ones). */
  existingExercises?: Exercise[];
  /** Offset to apply to the naive timestamps in the file, in minutes (UTC = local + offset). Defaults to the runtime's local zone. */
  timezoneOffsetMinutes?: number;
  now?: number;
}

export interface StrongImportResult {
  changes: Required<Pick<ChangeSet, 'exercises' | 'workouts' | 'workoutExercises' | 'sets'>>;
  summary: { workouts: number; sets: number; newExercises: string[]; skippedRows: number };
}

const HEADER_ALIASES: Record<string, string> = {
  'workout #': 'workoutNumber',
  date: 'date',
  'workout duration': 'duration',
  'workout name': 'workoutName',
  duration: 'duration',
  'exercise name': 'exerciseName',
  'set order': 'setOrder',
  weight: 'weight',
  'weight unit': 'weightUnit',
  reps: 'reps',
  distance: 'distance',
  'distance unit': 'distanceUnit',
  seconds: 'seconds',
  notes: 'notes',
  'workout notes': 'workoutNotes',
  rpe: 'rpe',
};

/** Small deterministic hash so re-importing the same file is idempotent. */
export function fnv1a(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function parseStrongDuration(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const colon = t.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) {
    const [a, b, c] = [Number(colon[1]), Number(colon[2]), colon[3] ? Number(colon[3]) : null];
    return c == null ? a * 60 + b : a * 3600 + b * 60 + c;
  }
  let total = 0;
  let matched = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(h|m|s)/gi)) {
    matched = true;
    const v = Number(m[1]);
    const unit = m[2]!.toLowerCase();
    total += unit === 'h' ? v * 3600 : unit === 'm' ? v * 60 : v;
  }
  if (matched) return Math.round(total);
  return /^\d+$/.test(t) ? Number(t) : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseNaiveDate(s: string, offsetMinutes?: number): number | null {
  let parts: number[] | null = null;
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (iso) parts = iso.slice(1).map((x) => (x ? Number(x) : 0));
  // Localised English form used by newer exports: "22 Dec 2025, 08:00"
  const loc = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!parts && loc) {
    const mo = MONTHS.indexOf(loc[2]!.toLowerCase());
    if (mo >= 0)
      parts = [Number(loc[3]), mo + 1, Number(loc[1]), Number(loc[4]), Number(loc[5]), loc[6] ? Number(loc[6]) : 0];
  }
  if (!parts) {
    const d = Date.parse(s);
    return Number.isNaN(d) ? null : d;
  }
  const [y, mo, d, h, mi, sec] = parts;
  if (offsetMinutes == null) return new Date(y!, mo! - 1, d!, h!, mi!, sec!).getTime();
  return Date.UTC(y!, mo! - 1, d!, h!, mi!, sec!) + offsetMinutes * 60_000;
}

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function setKindFromOrder(order: string): SetKind | null {
  const o = order.trim().toUpperCase();
  if (/^\d+$/.test(o)) return 'normal';
  if (o === 'W') return 'warmup';
  if (o === 'D') return 'drop';
  if (o === 'F') return 'failure';
  return null; // e.g. "Rest Timer"
}

export function importStrongCsv(text: string, opts: StrongImportOptions): StrongImportResult {
  const rows = parseCsv(text);
  const now = opts.now ?? Date.now();
  const result: StrongImportResult = {
    changes: { exercises: [], workouts: [], workoutExercises: [], sets: [] },
    summary: { workouts: 0, sets: 0, newExercises: [], skippedRows: 0 },
  };
  if (rows.length < 2) return result;

  // Map columns by name. Newer exports put units in the header, e.g.
  // "Weight (kg)", "Weight (lbs)", "Distance (meters)", "Duration (sec)".
  let headerWeightUnit: WeightUnit | null = null;
  let headerDistanceUnit: string | null = null;
  let durationInSeconds = false;
  const header = rows[0]!.map((raw) => {
    const h = raw.trim().toLowerCase();
    const m = h.match(/^(.*?)\s*\(([^)]+)\)$/);
    const base = m ? m[1]! : h;
    const unit = m ? m[2]!.trim() : null;
    if (unit && base === 'weight') headerWeightUnit = unit.startsWith('lb') ? 'lb' : 'kg';
    if (unit && base === 'distance')
      headerDistanceUnit = unit.startsWith('met') || unit === 'm' ? 'm' : unit.startsWith('mi') ? 'mi' : unit.startsWith('f') ? 'ft' : 'km';
    if (unit && (base === 'duration' || base === 'workout duration') && unit.startsWith('s')) durationInSeconds = true;
    return HEADER_ALIASES[base] ?? HEADER_ALIASES[h] ?? raw.trim();
  });
  const col = (r: string[], key: string) => {
    const i = header.indexOf(key);
    return i >= 0 ? r[i] ?? '' : '';
  };
  if (!header.includes('date') || !header.includes('exerciseName')) {
    throw new Error('Not a Strong CSV export: missing "Date" or "Exercise Name" column');
  }

  const customByKey = new Map<string, Exercise>();
  for (const e of opts.existingExercises ?? []) {
    if (!e.deletedAt) customByKey.set(exerciseNameKey(e.name), e);
  }

  const workouts = new Map<string, Workout>();
  const wexByKey = new Map<string, WorkoutExercise>();
  const setCounters = new Map<string, number>();

  for (const r of rows.slice(1)) {
    const dateStr = col(r, 'date');
    const exName = col(r, 'exerciseName').trim();
    const order = col(r, 'setOrder').trim();
    const isNoteRow = order.toLowerCase() === 'note';
    const kind = isNoteRow ? 'normal' : setKindFromOrder(order || '1');
    const startedAt = parseNaiveDate(dateStr, opts.timezoneOffsetMinutes);
    if (!exName || startedAt == null || kind == null) {
      result.summary.skippedRows++;
      continue;
    }
    const workoutName = col(r, 'workoutName').trim() || 'Workout';
    const wKey = `${col(r, 'workoutNumber').trim()}|${dateStr.trim()}|${workoutName}`;
    const workoutId = `strong-${fnv1a(wKey)}`;
    let w = workouts.get(workoutId);
    if (!w) {
      const durRaw = col(r, 'duration');
      const dur = durationInSeconds ? num(durRaw) : parseStrongDuration(durRaw);
      w = {
        id: workoutId,
        name: workoutName,
        startedAt,
        endedAt: dur != null ? startedAt + dur * 1000 : startedAt,
        notes: col(r, 'workoutNotes').trim() || null,
        templateId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      workouts.set(workoutId, w);
    }

    // Resolve exercise.
    const key = exerciseNameKey(exName);
    let exerciseId = findBuiltinByName(exName)?.id ?? customByKey.get(key)?.id;
    const weightRaw = num(col(r, 'weight'));
    const distanceRaw = num(col(r, 'distance'));
    const seconds = num(col(r, 'seconds'));
    if (!exerciseId) {
      const shape = guessExerciseShape(exName, {
        hasWeight: weightRaw != null && weightRaw !== 0,
        hasDistance: distanceRaw != null && distanceRaw !== 0,
        hasDuration: seconds != null && seconds !== 0,
      });
      const ex: Exercise = {
        id: `strong-ex-${fnv1a(key)}`,
        name: exName,
        ...shape,
        instructions: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      customByKey.set(key, ex);
      result.changes.exercises.push(ex);
      result.summary.newExercises.push(exName);
      exerciseId = ex.id;
    }

    // Exercises are grouped per workout in file order.
    const wexKey = `${workoutId}|${exerciseId}`;
    let wex = wexByKey.get(wexKey);
    if (!wex) {
      const position = [...wexByKey.values()].filter((x) => x.workoutId === workoutId).length;
      wex = {
        id: `${workoutId}-e${position}`,
        workoutId,
        exerciseId,
        position,
        supersetId: null,
        notes: col(r, 'notes').trim() || null,
        restSeconds: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      wexByKey.set(wexKey, wex);
    } else if (!wex.notes && col(r, 'notes').trim()) {
      wex.notes = col(r, 'notes').trim();
    }

    if (isNoteRow) continue; // note text already attached to the exercise above

    const wUnitCol = col(r, 'weightUnit').trim().toLowerCase();
    const wUnit: WeightUnit = wUnitCol ? (wUnitCol.startsWith('lb') ? 'lb' : 'kg') : (headerWeightUnit ?? opts.weightUnit);
    const dUnitCol = col(r, 'distanceUnit').trim().toLowerCase();
    const dUnit = dUnitCol || headerDistanceUnit || opts.distanceUnit;
    const metres =
      distanceRaw == null
        ? null
        : dUnit === 'mi'
          ? distanceRaw * 1609.344
          : dUnit === 'm'
            ? distanceRaw
            : dUnit === 'ft'
              ? distanceRaw * 0.3048
              : distanceRaw * 1000;

    const position = setCounters.get(wex.id) ?? 0;
    setCounters.set(wex.id, position + 1);
    const reps = num(col(r, 'reps'));
    const rpe = num(col(r, 'rpe'));
    if (!weightRaw && !reps && !distanceRaw && !seconds) {
      // Empty placeholder rows carry no data.
      setCounters.set(wex.id, position);
      result.summary.skippedRows++;
      continue;
    }
    const set: WorkoutSet = {
      id: `${wex.id}-s${position}`,
      workoutId,
      workoutExerciseId: wex.id,
      position,
      kind,
      weight: weightRaw ? +toKg(weightRaw, wUnit).toFixed(4) : null,
      reps: reps != null ? Math.round(reps) : null,
      distance: metres ? +metres.toFixed(2) : null,
      duration: seconds || null,
      rpe: rpe != null && rpe >= 1 && rpe <= 10 ? rpe : null,
      completed: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    result.changes.sets.push(set);
  }

  result.changes.workouts = [...workouts.values()];
  result.changes.workoutExercises = [...wexByKey.values()];
  result.summary.workouts = workouts.size;
  result.summary.sets = result.changes.sets.length;
  return result;
}

const STRONG_HEADER = [
  'Date',
  'Workout Name',
  'Duration',
  'Exercise Name',
  'Set Order',
  'Weight',
  'Reps',
  'Distance',
  'Seconds',
  'Notes',
  'Workout Notes',
  'RPE',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatNaive(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatStrongDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Export workouts to a Strong-compatible CSV (importable by Strong-compatible apps). */
export function exportStrongCsv(
  data: {
    workouts: Workout[];
    workoutExercises: WorkoutExercise[];
    sets: WorkoutSet[];
    exerciseName: (id: string) => string;
  },
  units: { weightUnit: WeightUnit; distanceUnit: DistanceUnit },
): string {
  const alive = <T extends { deletedAt: number | null }>(x: T) => !x.deletedAt;
  const wexByWorkout = new Map<string, WorkoutExercise[]>();
  for (const we of data.workoutExercises.filter(alive)) {
    const arr = wexByWorkout.get(we.workoutId) ?? [];
    arr.push(we);
    wexByWorkout.set(we.workoutId, arr);
  }
  const setsByWex = new Map<string, WorkoutSet[]>();
  for (const s of data.sets.filter(alive)) {
    const arr = setsByWex.get(s.workoutExerciseId) ?? [];
    arr.push(s);
    setsByWex.set(s.workoutExerciseId, arr);
  }
  const out: (string | number | null)[][] = [STRONG_HEADER];
  const workouts = data.workouts.filter(alive).sort((a, b) => a.startedAt - b.startedAt);
  for (const w of workouts) {
    const dur = w.endedAt ? Math.max(0, Math.round((w.endedAt - w.startedAt) / 1000)) : 0;
    const wexs = (wexByWorkout.get(w.id) ?? []).sort((a, b) => a.position - b.position);
    for (const we of wexs) {
      const sets = (setsByWex.get(we.id) ?? []).sort((a, b) => a.position - b.position);
      let n = 0;
      for (const s of sets) {
        const order =
          s.kind === 'warmup' ? 'W' : s.kind === 'drop' ? 'D' : s.kind === 'failure' ? 'F' : String(++n);
        out.push([
          formatNaive(w.startedAt),
          w.name,
          formatStrongDuration(dur),
          data.exerciseName(we.exerciseId),
          order,
          s.weight != null ? +fromKg(s.weight, units.weightUnit).toFixed(2) : 0,
          s.reps ?? 0,
          s.distance != null ? +(s.distance / (units.distanceUnit === 'mi' ? 1609.344 : 1000)).toFixed(3) : 0,
          s.duration ?? 0,
          we.notes ?? '',
          w.notes ?? '',
          s.rpe ?? '',
        ]);
      }
    }
  }
  return toCsv(out);
}
