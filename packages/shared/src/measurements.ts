// Names, units and grouping for body measurements, shared by the phone and web screens.

import type { Measurement, MeasurementKind } from './schema';

const NAMES: Partial<Record<MeasurementKind, string>> = {
  body_weight: 'Body weight',
  body_fat: 'Body fat',
  caloric_intake: 'Calories',
};

/** "left_bicep" → "Left bicep". */
export const measureName = (k: MeasurementKind) => NAMES[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');

/** Display unit. Body weight follows the weight unit; it is stored in kg. */
export const measureUnit = (k: MeasurementKind, weightUnit: 'kg' | 'lb') =>
  k === 'body_weight' ? weightUnit : k === 'body_fat' ? '%' : k === 'caloric_intake' ? 'kcal' : 'cm';

/** One row of a log form: a single measurement or a left/right pair. */
export interface MeasureRow {
  label: string;
  kinds: MeasurementKind[];
}

/** Every measurement kind, grouped by body area for log forms. */
export const MEASURE_GROUPS: { title: string; rows: MeasureRow[] }[] = [
  {
    title: 'General',
    rows: [
      { label: 'Body weight', kinds: ['body_weight'] },
      { label: 'Body fat', kinds: ['body_fat'] },
      { label: 'Calories', kinds: ['caloric_intake'] },
    ],
  },
  {
    title: 'Upper body',
    rows: [
      { label: 'Neck', kinds: ['neck'] },
      { label: 'Shoulders', kinds: ['shoulders'] },
      { label: 'Chest', kinds: ['chest'] },
      { label: 'Biceps', kinds: ['left_bicep', 'right_bicep'] },
      { label: 'Forearms', kinds: ['left_forearm', 'right_forearm'] },
    ],
  },
  {
    title: 'Core',
    rows: [
      { label: 'Upper abs', kinds: ['upper_abs'] },
      { label: 'Waist', kinds: ['waist'] },
      { label: 'Lower abs', kinds: ['lower_abs'] },
      { label: 'Hips', kinds: ['hips'] },
    ],
  },
  {
    title: 'Legs',
    rows: [
      { label: 'Thighs', kinds: ['left_thigh', 'right_thigh'] },
      { label: 'Calves', kinds: ['left_calf', 'right_calf'] },
    ],
  },
];

/** Live (not deleted) entries per kind, newest first. */
export function measurementsByKind(list: Measurement[]): Map<MeasurementKind, Measurement[]> {
  const out = new Map<MeasurementKind, Measurement[]>();
  for (const m of list) {
    if (m.deletedAt) continue;
    const l = out.get(m.kind);
    if (l) l.push(m);
    else out.set(m.kind, [m]);
  }
  for (const l of out.values()) l.sort((a, b) => b.takenAt - a.takenAt);
  return out;
}

/**
 * Change from the newest entry at least four weeks older than the latest one (or from the oldest
 * entry when there is none that old). `list` is newest first. Null with fewer than two entries.
 */
export function measurementChange(list: Measurement[]): { diff: number; since: number } | null {
  if (list.length < 2) return null;
  const latest = list[0]!;
  const ref = list.find((m) => m.takenAt <= latest.takenAt - 28 * 86_400_000) ?? list[list.length - 1]!;
  return { diff: latest.value - ref.value, since: ref.takenAt };
}
