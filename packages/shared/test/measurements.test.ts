import { describe, expect, it } from 'vitest';
import { MEASUREMENT_KINDS, MEASURE_GROUPS, measureName, measureUnit, measurementChange, measurementsByKind, type Measurement } from '../src';

const DAY = 86_400_000;
const m = (kind: Measurement['kind'], value: number, day: number, deletedAt: number | null = null): Measurement => ({
  id: `${kind}-${day}`,
  kind,
  value,
  takenAt: day * DAY,
  note: null,
  createdAt: 0,
  updatedAt: 0,
  deletedAt,
});

describe('measurements', () => {
  it('names and units', () => {
    expect(measureName('left_bicep')).toBe('Left bicep');
    expect(measureName('caloric_intake')).toBe('Calories');
    expect(measureUnit('body_weight', 'lb')).toBe('lb');
    expect(measureUnit('body_fat', 'kg')).toBe('%');
    expect(measureUnit('waist', 'kg')).toBe('cm');
  });

  it('groups every kind exactly once', () => {
    const kinds = MEASURE_GROUPS.flatMap((g) => g.rows.flatMap((r) => r.kinds));
    expect([...kinds].sort()).toEqual([...MEASUREMENT_KINDS].sort());
  });

  it('groups entries newest first and skips deleted ones', () => {
    const g = measurementsByKind([m('waist', 80, 1), m('waist', 79, 5), m('waist', 70, 9, 1), m('neck', 38, 2)]);
    expect(g.get('waist')!.map((x) => x.value)).toEqual([79, 80]);
    expect(g.get('neck')).toHaveLength(1);
  });

  it('change over about four weeks', () => {
    const list = measurementsByKind([m('body_weight', 78, 0), m('body_weight', 79, 10), m('body_weight', 80, 40), m('body_weight', 81, 45)]).get('body_weight')!;
    // 45 - 28 = day 17: the newest entry on or before it is day 10.
    expect(measurementChange(list)).toEqual({ diff: 2, since: 10 * DAY });
    const short = measurementsByKind([m('waist', 80, 1), m('waist', 79, 5)]).get('waist')!;
    expect(measurementChange(short)).toEqual({ diff: -1, since: DAY });
    expect(measurementChange(short.slice(0, 1))).toBeNull();
  });
});
