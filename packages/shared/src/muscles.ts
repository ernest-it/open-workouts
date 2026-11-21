// Which muscles an exercise works, for the body heatmap. Exercises only carry a coarse body part
// ("arms", "legs"), so the muscles are read from the name, with the body part as a fallback.

import { isWorkingSet, type Dataset } from './stats';
import type { Exercise } from './schema';

export const MUSCLES = [
  'chest',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'traps',
  'upper_back',
  'lats',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  traps: 'Traps',
  upper_back: 'Upper back',
  lats: 'Lats',
  lower_back: 'Lower back',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

export interface MuscleWork {
  primary: Muscle[];
  secondary: Muscle[];
}

// First match wins, so the more specific patterns come first.
const RULES: [RegExp, Muscle[], Muscle[]][] = [
  [/leg curl|hamstring curl|nordic/, ['hamstrings'], ['calves']],
  [/wrist curl/, ['forearms'], []],
  [/farmers/, ['forearms', 'traps'], ['abs']],
  [/dead hang/, ['forearms'], ['lats']],
  [/hammer curl|reverse curl/, ['biceps', 'forearms'], []],
  [/curl/, ['biceps'], ['forearms']],
  [/tricep|skullcrusher|pushdown|bench dip|diamond push/, ['triceps'], []],
  [/close grip bench/, ['triceps', 'chest'], ['shoulders']],
  [/chest dip/, ['chest', 'triceps'], ['shoulders']],
  [/reverse fly|face pull|rear delt/, ['shoulders', 'upper_back'], ['traps']],
  [/fly|crossover|pec deck/, ['chest'], ['shoulders']],
  [/handstand/, ['shoulders'], ['triceps', 'traps']],
  [/bench press|chest press|floor press|push up/, ['chest'], ['triceps', 'shoulders']],
  [/pullover/, ['chest', 'lats'], []],
  [/front raise/, ['shoulders'], []],
  [/lateral raise/, ['shoulders'], ['traps']],
  [/upright row/, ['shoulders', 'traps'], []],
  [/thruster/, ['quads', 'glutes', 'shoulders'], ['triceps']],
  [/overhead press|shoulder press|military|arnold|push press/, ['shoulders'], ['triceps', 'traps']],
  [/shrug/, ['traps'], ['forearms']],
  [/straight arm/, ['lats'], []],
  [/pull up|chin up|pulldown|lat /, ['lats'], ['biceps', 'upper_back']],
  [/row/, ['upper_back', 'lats'], ['biceps', 'shoulders']],
  [/romanian|stiff leg|good morning/, ['hamstrings', 'glutes'], ['lower_back']],
  [/back extension|hyperextension/, ['lower_back'], ['glutes', 'hamstrings']],
  [/rack pull/, ['lower_back', 'traps'], ['glutes', 'hamstrings', 'forearms']],
  [/deadlift/, ['hamstrings', 'glutes', 'lower_back'], ['quads', 'traps', 'forearms']],
  [/abductor/, ['glutes'], []],
  [/adductor/, ['quads'], []],
  [/hip thrust|glute|bridge/, ['glutes'], ['hamstrings']],
  [/calf/, ['calves'], []],
  [/leg extension/, ['quads'], []],
  [/squat|leg press|lunge|step up/, ['quads', 'glutes'], ['hamstrings']],
  [/box jump|sled push/, ['quads', 'glutes'], ['calves']],
  [/swing/, ['glutes', 'hamstrings'], ['lower_back', 'shoulders']],
  [/clean|snatch/, ['glutes', 'hamstrings', 'traps'], ['quads', 'shoulders']],
  [/turkish get up/, ['shoulders', 'abs'], ['glutes']],
  // Conditioning: counted as cardio, not towards muscles.
  [/burpee|battle rope/, [], []],
  [/twist|wood chop|pallof|side plank/, ['abs'], []],
  [/crunch|sit up|leg raise|knee raise|ab wheel|plank|hollow|dead bug|mountain climber/, ['abs'], []],
];

const FALLBACK: Partial<Record<Exercise['bodyPart'], MuscleWork>> = {
  chest: { primary: ['chest'], secondary: ['triceps'] },
  back: { primary: ['upper_back', 'lats'], secondary: ['biceps'] },
  shoulders: { primary: ['shoulders'], secondary: [] },
  arms: { primary: ['biceps', 'triceps'], secondary: [] },
  legs: { primary: ['quads', 'hamstrings', 'glutes'], secondary: [] },
  core: { primary: ['abs'], secondary: [] },
};

/** Muscles an exercise works. Cardio and "other" exercises work none. */
export function musclesOf(ex: Pick<Exercise, 'name' | 'bodyPart'>): MuscleWork {
  if (ex.bodyPart === 'cardio') return { primary: [], secondary: [] };
  const name = ex.name.toLowerCase();
  for (const [re, primary, secondary] of RULES) if (re.test(name)) return { primary, secondary };
  return FALLBACK[ex.bodyPart] ?? { primary: [], secondary: [] };
}

/**
 * Working sets per muscle for finished workouts started in [from, to). A set counts fully for each
 * primary muscle and half for each secondary one.
 */
export function muscleSets(ds: Dataset, from: number, to: number): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  const work = new Map(ds.exercises.map((e) => [e.id, musclesOf(e)]));
  const inRange = new Set(ds.workouts.filter((w) => !w.deletedAt && w.endedAt != null && w.startedAt >= from && w.startedAt < to).map((w) => w.id));
  const workOfWe = new Map<string, MuscleWork | undefined>();
  for (const we of ds.workoutExercises) if (!we.deletedAt && inRange.has(we.workoutId)) workOfWe.set(we.id, work.get(we.exerciseId));
  for (const s of ds.sets) {
    if (!inRange.has(s.workoutId) || !isWorkingSet(s)) continue;
    const w = workOfWe.get(s.workoutExerciseId);
    if (!w) continue;
    for (const m of w.primary) out[m] += 1;
    for (const m of w.secondary) out[m] += 0.5;
  }
  return out;
}
