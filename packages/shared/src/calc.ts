// Pure training math: units, one-rep-max estimates, plate & warm-up calculators.

export type WeightUnit = 'kg' | 'lb';
export type DistanceUnit = 'km' | 'mi';

export const KG_PER_LB = 0.45359237;

export const toKg = (v: number, unit: WeightUnit) => (unit === 'kg' ? v : v * KG_PER_LB);
export const fromKg = (kg: number, unit: WeightUnit) => (unit === 'kg' ? kg : kg / KG_PER_LB);

/** Round to a sensible display precision (0.01 kg / lb). */
export const round = (v: number, step = 0.01) => Math.round(v / step) * step;

export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg == null) return '';
  const v = fromKg(kg, unit);
  return `${+v.toFixed(2)}`;
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null) return '';
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export type OneRmFormula = 'brzycki' | 'epley' | 'lombardi' | 'mayhew' | 'oconner' | 'wathan';

/**
 * Estimated one-rep max. Defaults to Brzycki (the conventional choice for
 * strength apps); returns the weight itself for a single and null for reps
 * outside the range where estimates are meaningful.
 */
export function estimate1RM(weight: number, reps: number, formula: OneRmFormula = 'brzycki'): number | null {
  if (!(weight > 0) || !(reps > 0)) return null;
  if (reps === 1) return weight;
  if (reps > 30) return null;
  switch (formula) {
    case 'brzycki':
      return weight * (36 / (37 - reps));
    case 'epley':
      return weight * (1 + reps / 30);
    case 'lombardi':
      return weight * Math.pow(reps, 0.1);
    case 'mayhew':
      return (100 * weight) / (52.2 + 41.9 * Math.exp(-0.055 * reps));
    case 'oconner':
      return weight * (1 + 0.025 * reps);
    case 'wathan':
      return (100 * weight) / (48.8 + 53.8 * Math.exp(-0.075 * reps));
  }
}

/** Inverse Brzycki: weight you should manage for `reps` given a 1RM. */
export function weightForReps(oneRm: number, reps: number): number {
  if (reps <= 1) return oneRm;
  return (oneRm * (37 - reps)) / 36;
}

export interface PlateResult {
  /** Plates for ONE side of the bar, heaviest first. */
  perSide: number[];
  /** Weight actually achievable with available plates. */
  achieved: number;
  /** Target minus achieved (>= 0). */
  remainder: number;
}

export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_PLATES_LB = [45, 35, 25, 10, 5, 2.5];

/**
 * Greedy plate loading (optimal for standard plate denominations).
 * `available` maps plate size -> number of plates in total (pairs needed);
 * pass an array for unlimited supply.
 */
export function calculatePlates(
  target: number,
  barWeight: number,
  available: number[] | Record<number, number> = DEFAULT_PLATES_KG,
): PlateResult {
  const inventory: [number, number][] = Array.isArray(available)
    ? available.map((p) => [p, Infinity])
    : Object.entries(available).map(([p, n]) => [Number(p), n]);
  inventory.sort((a, b) => b[0] - a[0]);

  let perSideRemaining = Math.max(0, (target - barWeight) / 2);
  const perSide: number[] = [];
  const EPS = 1e-9;
  for (const [plate, count] of inventory) {
    let pairs = Math.floor(count / 2);
    while (pairs > 0 && perSideRemaining + EPS >= plate) {
      perSide.push(plate);
      perSideRemaining -= plate;
      pairs--;
    }
  }
  const achieved = barWeight + 2 * perSide.reduce((a, b) => a + b, 0);
  return { perSide, achieved: round(achieved), remainder: round(Math.max(0, target - achieved)) };
}

export interface WarmupStep {
  weight: number;
  reps: number;
}

/**
 * Classic warm-up ramp: empty bar x 10, then 40/60/80 % of the working
 * weight, rounded to the smallest loadable increment.
 */
export function warmupSets(
  workingWeight: number,
  barWeight = 20,
  increment = 2.5,
  scheme: { pct: number; reps: number }[] = [
    { pct: 0, reps: 10 },
    { pct: 0.4, reps: 5 },
    { pct: 0.6, reps: 3 },
    { pct: 0.8, reps: 2 },
  ],
): WarmupStep[] {
  const out: WarmupStep[] = [];
  for (const s of scheme) {
    const raw = s.pct === 0 ? barWeight : workingWeight * s.pct;
    const w = Math.max(barWeight, Math.round(raw / increment) * increment);
    if (w >= workingWeight) continue;
    if (out.length && out[out.length - 1]!.weight === w) continue;
    out.push({ weight: round(w), reps: s.reps });
  }
  return out;
}
