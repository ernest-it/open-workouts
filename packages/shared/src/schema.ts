import { z } from 'zod';

/**
 * Data model for Open Workouts.
 *
 * Every user-owned entity is a flat "row" that syncs independently using
 * last-write-wins on `updatedAt`. Deletes are soft (`deletedAt`) so that they
 * propagate to every device. All weights are stored in KILOGRAMS, distances in
 * METRES and durations in SECONDS; conversion happens only at the UI edge.
 */

export const LOG_TYPES = [
  'weight_reps', // barbell / dumbbell / machine / cable ...
  'weighted_bodyweight', // + added weight, reps (weighted pull up, dips)
  'assisted_bodyweight', // - assistance weight, reps (assisted pull up machine)
  'reps', // reps only (push up, sit up)
  'duration', // time only (plank)
  'distance_duration', // cardio (running, rowing)
] as const;
export type LogType = (typeof LOG_TYPES)[number];

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'kettlebell',
  'band',
  'smith_machine',
  'ez_bar',
  'trap_bar',
  'bodyweight',
  'plate',
  'other',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const BODY_PARTS = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
  'full_body',
  'cardio',
  'other',
] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export const SET_KINDS = ['normal', 'warmup', 'drop', 'failure'] as const;
export type SetKind = (typeof SET_KINDS)[number];

export const MEASUREMENT_KINDS = [
  'body_weight', // kg
  'body_fat', // %
  'caloric_intake', // kcal
  'neck', // cm (all circumferences)
  'shoulders',
  'chest',
  'left_bicep',
  'right_bicep',
  'left_forearm',
  'right_forearm',
  'upper_abs',
  'waist',
  'lower_abs',
  'hips',
  'left_thigh',
  'right_thigh',
  'left_calf',
  'right_calf',
] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];

const id = z.string().min(1).max(64);
const ts = z.number().int().nonnegative(); // epoch milliseconds
const nullableNum = z.number().finite().nullable();

/** Fields every syncable row has. */
export const baseRow = z.object({
  id,
  createdAt: ts,
  updatedAt: ts,
  deletedAt: ts.nullable(),
});

export const exerciseSchema = baseRow.extend({
  name: z.string().min(1).max(200),
  logType: z.enum(LOG_TYPES),
  equipment: z.enum(EQUIPMENT),
  bodyPart: z.enum(BODY_PARTS),
  instructions: z.string().max(10_000).nullable(),
});

export const workoutSchema = baseRow.extend({
  name: z.string().max(200),
  startedAt: ts,
  endedAt: ts.nullable(),
  notes: z.string().max(10_000).nullable(),
  templateId: id.nullable(),
});

export const workoutExerciseSchema = baseRow.extend({
  workoutId: id,
  exerciseId: id,
  position: z.number().int(),
  /** Exercises sharing a supersetId are performed as a superset. */
  supersetId: z.string().max(64).nullable(),
  notes: z.string().max(10_000).nullable(),
  restSeconds: z.number().int().nonnegative().nullable(),
});

export const setSchema = baseRow.extend({
  workoutId: id,
  workoutExerciseId: id,
  position: z.number().int(),
  kind: z.enum(SET_KINDS),
  weight: nullableNum, // kg (negative not allowed; assistance is stored positive)
  reps: z.number().int().nonnegative().nullable(),
  distance: nullableNum, // metres
  duration: nullableNum, // seconds
  rpe: z.number().min(1).max(10).nullable(),
  completed: z.boolean(),
});

export const templateFolderSchema = baseRow.extend({
  name: z.string().min(1).max(200),
  position: z.number().int(),
});

export const templateSchema = baseRow.extend({
  name: z.string().min(1).max(200),
  folderId: id.nullable(),
  notes: z.string().max(10_000).nullable(),
  position: z.number().int(),
});

export const templateExerciseSchema = baseRow.extend({
  templateId: id,
  exerciseId: id,
  position: z.number().int(),
  supersetId: z.string().max(64).nullable(),
  notes: z.string().max(10_000).nullable(),
  restSeconds: z.number().int().nonnegative().nullable(),
});

export const templateSetSchema = baseRow.extend({
  templateId: id,
  templateExerciseId: id,
  position: z.number().int(),
  kind: z.enum(SET_KINDS),
  weight: nullableNum,
  reps: z.number().int().nonnegative().nullable(),
  distance: nullableNum,
  duration: nullableNum,
});

export const measurementSchema = baseRow.extend({
  kind: z.enum(MEASUREMENT_KINDS),
  value: z.number().finite(),
  takenAt: ts,
  note: z.string().max(2000).nullable(),
});

/** Per-user key/value settings; `id` is the setting key. */
export const settingSchema = baseRow.extend({
  value: z.string().max(100_000), // JSON-encoded
});

export type Exercise = z.infer<typeof exerciseSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type WorkoutSet = z.infer<typeof setSchema>;
export type TemplateFolder = z.infer<typeof templateFolderSchema>;
export type Template = z.infer<typeof templateSchema>;
export type TemplateExercise = z.infer<typeof templateExerciseSchema>;
export type TemplateSet = z.infer<typeof templateSetSchema>;
export type Measurement = z.infer<typeof measurementSchema>;
export type Setting = z.infer<typeof settingSchema>;

/**
 * Registry of syncable collections. Order matters for foreign-key friendly
 * application (parents before children).
 */
export const COLLECTIONS = {
  exercises: exerciseSchema,
  workouts: workoutSchema,
  workoutExercises: workoutExerciseSchema,
  sets: setSchema,
  templateFolders: templateFolderSchema,
  templates: templateSchema,
  templateExercises: templateExerciseSchema,
  templateSets: templateSetSchema,
  measurements: measurementSchema,
  settings: settingSchema,
} as const;

export type CollectionName = keyof typeof COLLECTIONS;
export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as CollectionName[];

export interface RowTypes {
  exercises: Exercise;
  workouts: Workout;
  workoutExercises: WorkoutExercise;
  sets: WorkoutSet;
  templateFolders: TemplateFolder;
  templates: Template;
  templateExercises: TemplateExercise;
  templateSets: TemplateSet;
  measurements: Measurement;
  settings: Setting;
}

export type AnyRow = RowTypes[CollectionName];

/** Column names for a collection (derived from the zod schema). */
export function columnsOf(name: CollectionName): string[] {
  return Object.keys(COLLECTIONS[name].shape);
}

/** Columns whose zod type is boolean (stored as INTEGER 0/1 in SQL). */
export function booleanColumnsOf(name: CollectionName): string[] {
  const shape = COLLECTIONS[name].shape as Record<string, z.ZodType>;
  return Object.entries(shape)
    .filter(([, t]) => unwrap(t) instanceof z.ZodBoolean)
    .map(([k]) => k);
}

/** Columns that are numeric (used for SQL column affinity). */
export function numericColumnsOf(name: CollectionName): string[] {
  const shape = COLLECTIONS[name].shape as Record<string, z.ZodType>;
  return Object.entries(shape)
    .filter(([, t]) => unwrap(t) instanceof z.ZodNumber)
    .map(([k]) => k);
}

function unwrap(t: z.ZodType): z.ZodType {
  let cur: z.ZodType = t;
  // zod v4: nullable/optional wrap the inner type in `.unwrap()`
  while (cur instanceof z.ZodNullable || cur instanceof z.ZodOptional) {
    cur = cur.unwrap() as z.ZodType;
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Sync protocol
// ---------------------------------------------------------------------------

export type ChangeSet = { [K in CollectionName]?: RowTypes[K][] };

export const syncRequestSchema = z.object({
  /** Highest server revision the client has already seen (0 = full pull). */
  since: z.number().int().nonnegative(),
  /** Rows changed locally since the last successful sync. */
  changes: z.record(z.string(), z.array(z.unknown())).default({}),
});
export type SyncRequest = { since: number; changes: ChangeSet };

export interface SyncResponse {
  /** New cursor to send as `since` next time. */
  rev: number;
  /** Rows changed on the server after `since` (including ones just pushed). */
  changes: ChangeSet;
  /** Rows the server refused, with a reason (validation errors etc.). */
  rejected: { collection: string; id: string | null; error: string }[];
}

/** Ids of built-in exercises start with this prefix and are never synced. */
export const BUILTIN_PREFIX = 'builtin:';
