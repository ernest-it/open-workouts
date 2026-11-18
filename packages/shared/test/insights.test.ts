import { describe, expect, it } from 'vitest';
import { MemoryStorage, WorkoutStore, buildTrainingDigest, compareWorkouts, findBuiltinByName, findComparableWorkout } from '../src';

const DAY = 86_400_000;

async function seed(weeks = 6) {
  let t = Date.UTC(2026, 0, 1, 9);
  const store = new WorkoutStore(new MemoryStorage(), { now: () => t });
  await store.init();
  const bench = findBuiltinByName('Bench Press (Barbell)')!;
  const squat = findBuiltinByName('Squat (Barbell)')!;
  const ids: string[] = [];
  // 6 weekly sessions, bench +2.5 kg each week; squat stuck at 140x5
  for (let i = 0; i < weeks; i++) {
    t = Date.UTC(2026, 0, 1 + i * 7, 9);
    const w = store.startWorkout({ name: 'Full Body' });
    for (const [ex, kg] of [[bench, 80 + i * 2.5], [squat, 140]] as const) {
      const we = store.addExerciseToWorkout(w.id, ex.id);
      for (const s of store.setsOf(we.id)) store.remove('sets', s.id);
      for (let k = 0; k < 3; k++) {
        const s = store.addSet(we.id);
        store.update('sets', s.id, { weight: kg, reps: 5, completed: true, rpe: 8 });
      }
    }
    t += 3600_000;
    store.finishWorkout(w.id);
    ids.push(w.id);
  }
  store.insert('measurements', { kind: 'body_weight', value: 80, takenAt: t - 10 * DAY, note: null });
  store.insert('measurements', { kind: 'body_weight', value: 81, takenAt: t - DAY, note: null });
  return { store, ids, now: t + DAY, bench, squat };
}

describe('insights', () => {
  it('builds a digest with totals, trends and workouts', async () => {
    const { store, now } = await seed();
    const d = buildTrainingDigest(store.dataset, { now, days: 7, measurements: store.all('measurements') });
    expect(d).toContain('| Workouts | 1 | 1 | ±0 |'.replace('±0', '+0.0%'));
    expect(d).toContain('Bench Press (Barbell) | 1 | 92.5x5 @8');
    expect(d).toContain('NEW BEST');
    expect(d).toContain('Workouts per week');
    expect(d).toContain('81 kg');
    expect(d).toMatch(/### 2026-02-05 · Full Body/);
  });

  it('flags plateaus but not progressing lifts', async () => {
    const { store, now } = await seed(12);
    const d = buildTrainingDigest(store.dataset, { now, days: 7 });
    expect(d).toMatch(/## Possible plateaus\n- Squat \(Barbell\)/);
    const section = d.split('## Possible plateaus')[1]!.split('\n## ')[0]!;
    expect(section).not.toContain('Bench Press');
  });

  it('reports an empty period', async () => {
    const { store, now } = await seed();
    const d = buildTrainingDigest(store.dataset, { now: now + 30 * DAY, days: 7 });
    expect(d).toContain('No workouts were logged in this period.');
  });

  it('converts to pounds', async () => {
    const { store, now } = await seed();
    const d = buildTrainingDigest(store.dataset, { now, days: 7, weightUnit: 'lb' });
    expect(d).toContain('203.9x5'); // 92.5 kg
  });

  it('compares workouts and finds a comparable one', async () => {
    const { store, ids } = await seed();
    const prev = findComparableWorkout(store.dataset, ids[5]!);
    expect(prev?.id).toBe(ids[4]);
    const c = compareWorkouts(store.dataset, ids[5]!, ids[4]!);
    expect(c).toMatch(/Bench Press \(Barbell\) \| 90x5 @8, 90x5 @8, 90x5 @8 \| 92.5x5 @8.*\| \+2.8% \| \+2.8% \|/);
    expect(c).toMatch(/Squat \(Barbell\).*\| \+0.0% \| \+0.0% \|/);
  });
});
