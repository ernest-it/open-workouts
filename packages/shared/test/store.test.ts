import { describe, expect, it } from 'vitest';
import { MemoryStorage, WorkoutStore, exerciseRecords, findBuiltinByName, workoutPRs } from '../src';

describe('WorkoutStore', () => {
  it('logs a workout, prefills previous values and computes PRs', async () => {
    let t = 1_000_000;
    const store = new WorkoutStore(new MemoryStorage(), { now: () => (t += 1000) });
    await store.init();
    const bench = findBuiltinByName('Bench Press (Barbell)')!;

    const w1 = store.startWorkout({ name: 'Day 1' });
    const we1 = store.addExerciseToWorkout(w1.id, bench.id);
    const [s1] = store.setsOf(we1.id);
    store.update('sets', s1!.id, { weight: 100, reps: 5, completed: true });
    store.addSet(we1.id); // not completed -> dropped on finish
    store.finishWorkout(w1.id);
    expect(store.setsOf(we1.id)).toHaveLength(1);
    expect(store.activeWorkout()).toBeUndefined();

    const w2 = store.startWorkout();
    const we2 = store.addExerciseToWorkout(w2.id, bench.id);
    const prefilled = store.setsOf(we2.id);
    expect(prefilled[0]!.weight).toBe(100);
    expect(prefilled[0]!.reps).toBe(5);
    store.update('sets', prefilled[0]!.id, { weight: 105, completed: true });
    store.finishWorkout(w2.id);

    const rec = exerciseRecords(store.dataset, bench);
    expect(rec.maxWeight?.value).toBe(105);
    expect(rec.repMaxes[5]?.value).toBe(105);
    const prs = workoutPRs(store.dataset, w2.id);
    expect(prs[0]?.types).toContain('weight');
    // a repeated identical set in the same workout is not a second PR
    expect(workoutPRs(store.dataset, w1.id)).toHaveLength(1);

    // templates
    const tpl = store.saveWorkoutAsTemplate(w2.id, 'Bench day');
    const w3 = store.startWorkout({ templateId: tpl.id });
    expect(store.workoutExercises(w3.id)).toHaveLength(1);
    expect(store.pendingCount()).toBeGreaterThan(0);
  });

  it('persists and reloads', async () => {
    const storage = new MemoryStorage();
    const a = new WorkoutStore(storage);
    await a.init();
    a.insert('measurements', { kind: 'body_weight', value: 80, takenAt: 1, note: null });
    await a.persist();
    const b = new WorkoutStore(storage);
    await b.init();
    expect(b.all('measurements')).toHaveLength(1);
    expect(b.pendingCount()).toBe(1);
  });
});
