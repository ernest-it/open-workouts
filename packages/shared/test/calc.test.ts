import { describe, expect, it } from 'vitest';
import { calculatePlates, estimate1RM, parseStrongDuration, toKg, warmupSets, formatDuration, formatElapsed, formatNumber } from '../src';

describe('calc', () => {
  it('estimates 1RM', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 5)).toBeCloseTo(112.5, 5); // Brzycki
    expect(estimate1RM(100, 5, 'epley')).toBeCloseTo(116.67, 1);
    expect(estimate1RM(0, 5)).toBeNull();
  });
  it('loads plates', () => {
    const r = calculatePlates(140, 20);
    expect(r.perSide).toEqual([25, 25, 10]);
    expect(r.remainder).toBe(0);
    const limited = calculatePlates(100, 20, { 20: 2, 10: 2, 5: 2 });
    expect(limited.perSide).toEqual([20, 10, 5]);
    expect(limited.achieved).toBe(90);
    expect(limited.remainder).toBe(10);
  });
  it('builds warm-up ramps', () => {
    expect(warmupSets(100)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 5 },
      { weight: 60, reps: 3 },
      { weight: 80, reps: 2 },
    ]);
  });
  it('converts and formats', () => {
    expect(toKg(225, 'lb')).toBeCloseTo(102.06, 2);
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(65)).toBe('1:05');
    expect(parseStrongDuration('1h 5m')).toBe(3900);
    expect(parseStrongDuration('45m')).toBe(2700);
    expect(parseStrongDuration('1:05:00')).toBe(3900);
  });
});

import { BUILTIN_EXERCISES } from '../src';
describe('built-in exercises', () => {
  it('have unique ids', () => {
    expect(new Set(BUILTIN_EXERCISES.map((e) => e.id)).size).toBe(BUILTIN_EXERCISES.length);
  });
});

describe('formatElapsed / formatNumber', () => {
  it('reads like a length of time', () => {
    expect(formatElapsed(40)).toBe('40s');
    expect(formatElapsed(45 * 60 + 10)).toBe('45m');
    expect(formatElapsed(78 * 60)).toBe('1h 18m');
    expect(formatElapsed(2 * 3600 + 10)).toBe('2h');
    expect(formatElapsed(3600 + 59 * 60 + 50)).toBe('2h');
  });
  it('adds thousands separators', () => {
    expect(formatNumber(8087.5, 1, 'en-US')).toBe('8,087.5');
    expect(formatNumber(12.345, 1, 'en-US')).toBe('12.3');
    expect(formatNumber(100, 1, 'en-US')).toBe('100');
  });
});
