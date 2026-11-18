import { BUILTIN_PREFIX, type BodyPart, type Equipment, type Exercise, type LogType } from './schema';

/**
 * Built-in exercise library. Names follow the common "Movement (Equipment)"
 * convention used by most trackers so that CSV imports from other apps match
 * automatically. This list is original to this project; a larger
 * CC-licensed dataset can be merged later (see docs/ALTERNATIVES.md).
 *
 * Tuple: [name, logType, equipment, bodyPart]
 */
type Def = [string, LogType, Equipment, BodyPart];

const W = 'weight_reps' as const;

const DEFS: Def[] = [
  // Chest
  ['Bench Press (Barbell)', W, 'barbell', 'chest'],
  ['Bench Press (Dumbbell)', W, 'dumbbell', 'chest'],
  ['Bench Press (Smith Machine)', W, 'smith_machine', 'chest'],
  ['Bench Press (Cable)', W, 'cable', 'chest'],
  ['Incline Bench Press (Barbell)', W, 'barbell', 'chest'],
  ['Incline Bench Press (Dumbbell)', W, 'dumbbell', 'chest'],
  ['Incline Bench Press (Smith Machine)', W, 'smith_machine', 'chest'],
  ['Decline Bench Press (Barbell)', W, 'barbell', 'chest'],
  ['Decline Bench Press (Dumbbell)', W, 'dumbbell', 'chest'],
  ['Close Grip Bench Press (Barbell)', W, 'barbell', 'arms'],
  ['Floor Press (Barbell)', W, 'barbell', 'chest'],
  ['Chest Press (Machine)', W, 'machine', 'chest'],
  ['Incline Chest Press (Machine)', W, 'machine', 'chest'],
  ['Chest Fly (Dumbbell)', W, 'dumbbell', 'chest'],
  ['Incline Chest Fly (Dumbbell)', W, 'dumbbell', 'chest'],
  ['Chest Fly (Machine)', W, 'machine', 'chest'],
  ['Cable Crossover', W, 'cable', 'chest'],
  ['Pullover (Dumbbell)', W, 'dumbbell', 'chest'],
  ['Push Up', 'reps', 'bodyweight', 'chest'],
  ['Push Up (Weighted)', 'weighted_bodyweight', 'bodyweight', 'chest'],
  ['Incline Push Up', 'reps', 'bodyweight', 'chest'],
  ['Decline Push Up', 'reps', 'bodyweight', 'chest'],
  ['Chest Dip', 'reps', 'bodyweight', 'chest'],
  ['Chest Dip (Weighted)', 'weighted_bodyweight', 'bodyweight', 'chest'],
  ['Chest Dip (Assisted)', 'assisted_bodyweight', 'machine', 'chest'],

  // Back
  ['Deadlift (Barbell)', W, 'barbell', 'back'],
  ['Deadlift (Dumbbell)', W, 'dumbbell', 'back'],
  ['Deadlift (Trap Bar)', W, 'trap_bar', 'back'],
  ['Sumo Deadlift (Barbell)', W, 'barbell', 'back'],
  ['Rack Pull (Barbell)', W, 'barbell', 'back'],
  ['Bent Over Row (Barbell)', W, 'barbell', 'back'],
  ['Bent Over Row (Dumbbell)', W, 'dumbbell', 'back'],
  ['Pendlay Row (Barbell)', W, 'barbell', 'back'],
  ['T Bar Row', W, 'barbell', 'back'],
  ['Seated Row (Cable)', W, 'cable', 'back'],
  ['Seated Row (Machine)', W, 'machine', 'back'],
  ['Chest Supported Row (Dumbbell)', W, 'dumbbell', 'back'],
  ['Single Arm Row (Dumbbell)', W, 'dumbbell', 'back'],
  ['Lat Pulldown (Cable)', W, 'cable', 'back'],
  ['Lat Pulldown (Machine)', W, 'machine', 'back'],
  ['Lat Pulldown - Close Grip (Cable)', W, 'cable', 'back'],
  ['Straight Arm Pulldown (Cable)', W, 'cable', 'back'],
  ['Pull Up', 'reps', 'bodyweight', 'back'],
  ['Pull Up (Weighted)', 'weighted_bodyweight', 'bodyweight', 'back'],
  ['Pull Up (Assisted)', 'assisted_bodyweight', 'machine', 'back'],
  ['Pull Up (Band)', 'assisted_bodyweight', 'band', 'back'],
  ['Chin Up', 'reps', 'bodyweight', 'back'],
  ['Chin Up (Weighted)', 'weighted_bodyweight', 'bodyweight', 'back'],
  ['Chin Up (Assisted)', 'assisted_bodyweight', 'machine', 'back'],
  ['Inverted Row', 'reps', 'bodyweight', 'back'],
  ['Back Extension', 'reps', 'bodyweight', 'back'],
  ['Back Extension (Weighted)', 'weighted_bodyweight', 'machine', 'back'],
  ['Good Morning (Barbell)', W, 'barbell', 'back'],
  ['Shrug (Barbell)', W, 'barbell', 'back'],
  ['Shrug (Dumbbell)', W, 'dumbbell', 'back'],
  ['Face Pull (Cable)', W, 'cable', 'shoulders'],

  // Shoulders
  ['Overhead Press (Barbell)', W, 'barbell', 'shoulders'],
  ['Overhead Press (Dumbbell)', W, 'dumbbell', 'shoulders'],
  ['Overhead Press (Smith Machine)', W, 'smith_machine', 'shoulders'],
  ['Seated Overhead Press (Barbell)', W, 'barbell', 'shoulders'],
  ['Seated Overhead Press (Dumbbell)', W, 'dumbbell', 'shoulders'],
  ['Shoulder Press (Machine)', W, 'machine', 'shoulders'],
  ['Arnold Press (Dumbbell)', W, 'dumbbell', 'shoulders'],
  ['Push Press (Barbell)', W, 'barbell', 'shoulders'],
  ['Lateral Raise (Dumbbell)', W, 'dumbbell', 'shoulders'],
  ['Lateral Raise (Cable)', W, 'cable', 'shoulders'],
  ['Lateral Raise (Machine)', W, 'machine', 'shoulders'],
  ['Front Raise (Dumbbell)', W, 'dumbbell', 'shoulders'],
  ['Front Raise (Plate)', W, 'plate', 'shoulders'],
  ['Reverse Fly (Dumbbell)', W, 'dumbbell', 'shoulders'],
  ['Reverse Fly (Machine)', W, 'machine', 'shoulders'],
  ['Reverse Fly (Cable)', W, 'cable', 'shoulders'],
  ['Upright Row (Barbell)', W, 'barbell', 'shoulders'],
  ['Upright Row (Cable)', W, 'cable', 'shoulders'],
  ['Handstand Push Up', 'reps', 'bodyweight', 'shoulders'],

  // Arms
  ['Bicep Curl (Barbell)', W, 'barbell', 'arms'],
  ['Bicep Curl (Dumbbell)', W, 'dumbbell', 'arms'],
  ['Bicep Curl (Cable)', W, 'cable', 'arms'],
  ['Bicep Curl (Machine)', W, 'machine', 'arms'],
  ['EZ Bar Curl', W, 'ez_bar', 'arms'],
  ['Hammer Curl (Dumbbell)', W, 'dumbbell', 'arms'],
  ['Hammer Curl (Cable)', W, 'cable', 'arms'],
  ['Preacher Curl (Barbell)', W, 'barbell', 'arms'],
  ['Preacher Curl (Dumbbell)', W, 'dumbbell', 'arms'],
  ['Preacher Curl (Machine)', W, 'machine', 'arms'],
  ['Incline Curl (Dumbbell)', W, 'dumbbell', 'arms'],
  ['Concentration Curl (Dumbbell)', W, 'dumbbell', 'arms'],
  ['Reverse Curl (Barbell)', W, 'barbell', 'arms'],
  ['Wrist Curl (Barbell)', W, 'barbell', 'arms'],
  ['Triceps Pushdown (Cable)', W, 'cable', 'arms'],
  ['Triceps Rope Pushdown (Cable)', W, 'cable', 'arms'],
  ['Triceps Extension (Dumbbell)', W, 'dumbbell', 'arms'],
  ['Triceps Extension (Cable)', W, 'cable', 'arms'],
  ['Overhead Triceps Extension (Cable)', W, 'cable', 'arms'],
  ['Skullcrusher (Barbell)', W, 'barbell', 'arms'],
  ['Skullcrusher (Dumbbell)', W, 'dumbbell', 'arms'],
  ['Skullcrusher (EZ Bar)', W, 'ez_bar', 'arms'],
  ['Triceps Kickback (Dumbbell)', W, 'dumbbell', 'arms'],
  ['Triceps Dip', 'reps', 'bodyweight', 'arms'],
  ['Triceps Dip (Weighted)', 'weighted_bodyweight', 'bodyweight', 'arms'],
  ['Triceps Dip (Assisted)', 'assisted_bodyweight', 'machine', 'arms'],
  ['Bench Dip', 'reps', 'bodyweight', 'arms'],
  ['Diamond Push Up', 'reps', 'bodyweight', 'arms'],

  // Legs
  ['Squat (Barbell)', W, 'barbell', 'legs'],
  ['Squat (Dumbbell)', W, 'dumbbell', 'legs'],
  ['Squat (Smith Machine)', W, 'smith_machine', 'legs'],
  ['Front Squat (Barbell)', W, 'barbell', 'legs'],
  ['Box Squat (Barbell)', W, 'barbell', 'legs'],
  ['Pause Squat (Barbell)', W, 'barbell', 'legs'],
  ['Goblet Squat (Dumbbell)', W, 'dumbbell', 'legs'],
  ['Goblet Squat (Kettlebell)', W, 'kettlebell', 'legs'],
  ['Hack Squat (Machine)', W, 'machine', 'legs'],
  ['Belt Squat (Machine)', W, 'machine', 'legs'],
  ['Air Squat', 'reps', 'bodyweight', 'legs'],
  ['Leg Press', W, 'machine', 'legs'],
  ['Romanian Deadlift (Barbell)', W, 'barbell', 'legs'],
  ['Romanian Deadlift (Dumbbell)', W, 'dumbbell', 'legs'],
  ['Stiff Leg Deadlift (Barbell)', W, 'barbell', 'legs'],
  ['Bulgarian Split Squat (Dumbbell)', W, 'dumbbell', 'legs'],
  ['Bulgarian Split Squat (Barbell)', W, 'barbell', 'legs'],
  ['Lunge (Barbell)', W, 'barbell', 'legs'],
  ['Lunge (Dumbbell)', W, 'dumbbell', 'legs'],
  ['Walking Lunge (Dumbbell)', W, 'dumbbell', 'legs'],
  ['Lunge', 'reps', 'bodyweight', 'legs'],
  ['Step Up (Dumbbell)', W, 'dumbbell', 'legs'],
  ['Leg Extension (Machine)', W, 'machine', 'legs'],
  ['Lying Leg Curl (Machine)', W, 'machine', 'legs'],
  ['Seated Leg Curl (Machine)', W, 'machine', 'legs'],
  ['Nordic Hamstring Curl', 'reps', 'bodyweight', 'legs'],
  ['Hip Thrust (Barbell)', W, 'barbell', 'legs'],
  ['Hip Thrust (Machine)', W, 'machine', 'legs'],
  ['Glute Bridge', 'reps', 'bodyweight', 'legs'],
  ['Glute Kickback (Cable)', W, 'cable', 'legs'],
  ['Hip Abductor (Machine)', W, 'machine', 'legs'],
  ['Hip Adductor (Machine)', W, 'machine', 'legs'],
  ['Standing Calf Raise (Machine)', W, 'machine', 'legs'],
  ['Standing Calf Raise (Dumbbell)', W, 'dumbbell', 'legs'],
  ['Seated Calf Raise (Machine)', W, 'machine', 'legs'],
  ['Calf Press on Leg Press', W, 'machine', 'legs'],
  ['Pistol Squat', 'reps', 'bodyweight', 'legs'],
  ['Box Jump', 'reps', 'bodyweight', 'legs'],

  // Core
  ['Crunch', 'reps', 'bodyweight', 'core'],
  ['Crunch (Machine)', W, 'machine', 'core'],
  ['Cable Crunch', W, 'cable', 'core'],
  ['Sit Up', 'reps', 'bodyweight', 'core'],
  ['Decline Crunch', 'reps', 'bodyweight', 'core'],
  ['Hanging Leg Raise', 'reps', 'bodyweight', 'core'],
  ['Hanging Knee Raise', 'reps', 'bodyweight', 'core'],
  ['Lying Leg Raise', 'reps', 'bodyweight', 'core'],
  ['Russian Twist', 'reps', 'bodyweight', 'core'],
  ['Ab Wheel', 'reps', 'other', 'core'],
  ['Plank', 'duration', 'bodyweight', 'core'],
  ['Side Plank', 'duration', 'bodyweight', 'core'],
  ['Hollow Hold', 'duration', 'bodyweight', 'core'],
  ['Pallof Press (Cable)', W, 'cable', 'core'],
  ['Wood Chop (Cable)', W, 'cable', 'core'],
  ['Mountain Climber', 'reps', 'bodyweight', 'core'],
  ['Dead Bug', 'reps', 'bodyweight', 'core'],

  // Olympic / full body
  ['Clean (Barbell)', W, 'barbell', 'full_body'],
  ['Power Clean (Barbell)', W, 'barbell', 'full_body'],
  ['Hang Clean (Barbell)', W, 'barbell', 'full_body'],
  ['Clean and Jerk (Barbell)', W, 'barbell', 'full_body'],
  ['Snatch (Barbell)', W, 'barbell', 'full_body'],
  ['Power Snatch (Barbell)', W, 'barbell', 'full_body'],
  ['Thruster (Barbell)', W, 'barbell', 'full_body'],
  ['Kettlebell Swing', W, 'kettlebell', 'full_body'],
  ['Turkish Get Up (Kettlebell)', W, 'kettlebell', 'full_body'],
  ['Farmers Walk (Dumbbell)', W, 'dumbbell', 'full_body'],
  ['Burpee', 'reps', 'bodyweight', 'full_body'],
  ['Battle Ropes', 'duration', 'other', 'full_body'],
  ['Sled Push', W, 'other', 'full_body'],
  ['Dead Hang', 'duration', 'bodyweight', 'back'],

  // Cardio
  ['Running', 'distance_duration', 'other', 'cardio'],
  ['Running (Treadmill)', 'distance_duration', 'machine', 'cardio'],
  ['Walking', 'distance_duration', 'other', 'cardio'],
  ['Cycling', 'distance_duration', 'other', 'cardio'],
  ['Cycling (Indoor)', 'distance_duration', 'machine', 'cardio'],
  ['Rowing (Machine)', 'distance_duration', 'machine', 'cardio'],
  ['Elliptical Trainer', 'distance_duration', 'machine', 'cardio'],
  ['Stair Climber', 'duration', 'machine', 'cardio'],
  ['Swimming', 'distance_duration', 'other', 'cardio'],
  ['Hiking', 'distance_duration', 'other', 'cardio'],
  ['Jump Rope', 'duration', 'other', 'cardio'],
  ['Ski Erg', 'distance_duration', 'machine', 'cardio'],
  ['Assault Bike', 'distance_duration', 'machine', 'cardio'],
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const BUILTIN_EXERCISES: Exercise[] = DEFS.map(([name, logType, equipment, bodyPart]) => ({
  id: BUILTIN_PREFIX + slugify(name),
  name,
  logType,
  equipment,
  bodyPart,
  instructions: null,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
}));

const BY_ID = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));
export const getBuiltinExercise = (id: string) => BY_ID.get(id);

/** Normalised key for loose name matching ("Bench Press (Barbell)" == "bench press barbell"). */
export function exerciseNameKey(name: string): string {
  return slugify(name.replace(/\s+-\s+/g, ' '));
}

const BY_KEY = new Map(BUILTIN_EXERCISES.map((e) => [exerciseNameKey(e.name), e]));
export const findBuiltinByName = (name: string) => BY_KEY.get(exerciseNameKey(name));

/** Guess a log type / equipment for an unknown exercise name (e.g. from an import). */
export function guessExerciseShape(
  name: string,
  hints: { hasWeight?: boolean; hasDistance?: boolean; hasDuration?: boolean } = {},
): Pick<Exercise, 'logType' | 'equipment' | 'bodyPart'> {
  const n = name.toLowerCase();
  const equipment: Equipment = n.includes('(barbell)')
    ? 'barbell'
    : n.includes('(dumbbell)')
      ? 'dumbbell'
      : n.includes('(cable)')
        ? 'cable'
        : n.includes('(machine)')
          ? 'machine'
          : n.includes('(kettlebell)')
            ? 'kettlebell'
            : n.includes('(band)')
              ? 'band'
              : n.includes('(smith machine)')
                ? 'smith_machine'
                : 'other';
  let logType: LogType = 'weight_reps';
  if (n.includes('(assisted)')) logType = 'assisted_bodyweight';
  else if (n.includes('(weighted)')) logType = 'weighted_bodyweight';
  else if (hints.hasDistance) logType = 'distance_duration';
  else if (hints.hasDuration && !hints.hasWeight) logType = 'duration';
  else if (hints.hasWeight === false) logType = 'reps';
  return { logType, equipment, bodyPart: logType === 'distance_duration' ? 'cardio' : 'other' };
}
