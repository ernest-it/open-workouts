import { describe, expect, it } from 'vitest';
import { MemoryStorage, WorkoutStore, findBuiltinByName } from '../src';

async function setup() {
  let t = 1_000_000;
  const store = new WorkoutStore(new MemoryStorage(), { now: () => (t += 1000) });
  await store.init();
  const ids = ['Bench Press (Barbell)', 'Bent Over Row (Barbell)', 'Squat (Barbell)', 'Pull Up'].map((n) => findBuiltinByName(n)!.id);
  const w = store.startWorkout({ name: 'Test' });
  const wes = ids.map((id) => store.addExerciseToWorkout(w.id, id));
  const order = () => store.workoutExercises(w.id).map((x) => wes.findIndex((y) => y.id === x.id));
  return { store, w, wes, ids, order };
}

describe('reordering', () => {
  it('moves an exercise up and down and stops at the ends', async () => {
    const { store, wes, order } = await setup();
    store.moveWorkoutExercise(wes[2]!.id, -1);
    expect(order()).toEqual([0, 2, 1, 3]);
    store.moveWorkoutExercise(wes[0]!.id, -1); // already first
    expect(order()).toEqual([0, 2, 1, 3]);
    store.moveWorkoutExercise(wes[3]!.id, 1); // already last
    expect(order()).toEqual([0, 2, 1, 3]);
    store.moveWorkoutExercise(wes[0]!.id, 1);
    expect(order()).toEqual([2, 0, 1, 3]);
    expect(store.workoutExercises(wes[0]!.workoutId).map((x) => x.position)).toEqual([0, 1, 2, 3]);
  });

  it('moves a superset as one block', async () => {
    const { store, wes, order } = await setup();
    store.makeSuperset([wes[1]!.id, wes[2]!.id]);
    store.moveWorkoutExercise(wes[0]!.id, 1); // jumps over the whole superset
    expect(order()).toEqual([1, 2, 0, 3]);
    store.moveWorkoutExercise(wes[2]!.id, -1); // inside the superset: swaps with its partner
    expect(order()).toEqual([2, 1, 0, 3]);
  });
});

describe('supersets', () => {
  it('groups exercises next to each other and rests only after the last', async () => {
    const { store, wes, order } = await setup();
    store.makeSuperset([wes[0]!.id, wes[3]!.id]);
    expect(order()).toEqual([0, 3, 1, 2]);
    const a = store.get('workoutExercises', wes[0]!.id)!;
    expect(a.supersetId).toBeTruthy();
    expect(store.get('workoutExercises', wes[3]!.id)!.supersetId).toBe(a.supersetId);
    expect(store.restsAfter(wes[0]!.id)).toBe(false);
    expect(store.restsAfter(wes[3]!.id)).toBe(true);
    expect(store.restsAfter(wes[1]!.id)).toBe(true);
  });

  it('adds a third exercise to an existing superset', async () => {
    const { store, wes } = await setup();
    store.makeSuperset([wes[0]!.id, wes[1]!.id]);
    store.makeSuperset([wes[1]!.id, wes[3]!.id]);
    const ids = new Set([0, 1, 3].map((i) => store.get('workoutExercises', wes[i]!.id)!.supersetId));
    expect(ids.size).toBe(1);
    expect(store.get('workoutExercises', wes[2]!.id)!.supersetId).toBeNull();
  });

  it('dissolves a superset left with one exercise', async () => {
    const { store, wes } = await setup();
    store.makeSuperset([wes[0]!.id, wes[1]!.id]);
    store.leaveSuperset(wes[0]!.id);
    expect(store.get('workoutExercises', wes[0]!.id)!.supersetId).toBeNull();
    expect(store.get('workoutExercises', wes[1]!.id)!.supersetId).toBeNull();
  });

  it('survives a round trip through a template', async () => {
    const { store, w, wes } = await setup();
    store.makeSuperset([wes[0]!.id, wes[1]!.id]);
    for (const we of wes) store.update('sets', store.setsOf(we.id)[0]!.id, { weight: 50, reps: 5, completed: true });
    store.finishWorkout(w.id);
    const tpl = store.saveWorkoutAsTemplate(w.id, 'SS');
    const w2 = store.startWorkout({ templateId: tpl.id });
    const list = store.workoutExercises(w2.id);
    expect(list[0]!.supersetId).toBeTruthy();
    expect(list[0]!.supersetId).toBe(list[1]!.supersetId);
    expect(list[0]!.supersetId).not.toBe(store.get('workoutExercises', wes[0]!.id)!.supersetId);
    expect(list[2]!.supersetId).toBeNull();
  });
});

describe('replacing an exercise', () => {
  it('keeps completed sets and refills the rest from the new exercise', async () => {
    let t = 1_000_000;
    const store = new WorkoutStore(new MemoryStorage(), { now: () => (t += 1000) });
    await store.init();
    const bench = findBuiltinByName('Bench Press (Barbell)')!.id;
    const incline = findBuiltinByName('Incline Bench Press (Barbell)')!.id;
    const w0 = store.startWorkout();
    const old = store.addExerciseToWorkout(w0.id, incline);
    store.update('sets', store.setsOf(old.id)[0]!.id, { weight: 70, reps: 8, completed: true });
    store.addSet(old.id);
    store.update('sets', store.setsOf(old.id)[1]!.id, { weight: 72.5, reps: 6, completed: true });
    store.finishWorkout(w0.id);

    const w = store.startWorkout();
    const we = store.addExerciseToWorkout(w.id, bench, 3);
    const sets = store.setsOf(we.id);
    store.update('sets', sets[0]!.id, { weight: 100, reps: 5, completed: true });
    store.update('sets', sets[1]!.id, { weight: 100, reps: 5 });
    store.replaceWorkoutExercise(we.id, incline);
    const after = store.setsOf(we.id);
    expect(store.get('workoutExercises', we.id)!.exerciseId).toBe(incline);
    expect(after[0]).toMatchObject({ weight: 100, reps: 5, completed: true });
    expect(after[1]).toMatchObject({ weight: 72.5, reps: 6 });
    expect(after[2]).toMatchObject({ weight: null, reps: null });
  });
});

describe('workoutSummaries', () => {
  it('matches workoutSummary for every workout', async () => {
    const { workoutSummaries, workoutSummary } = await import('../src');
    const { store, w, wes } = await setup();
    store.update('sets', store.setsOf(wes[0]!.id)[0]!.id, { weight: 100, reps: 5, completed: true });
    store.addSet(wes[0]!.id);
    store.update('sets', store.setsOf(wes[0]!.id)[1]!.id, { weight: 100, reps: 3, completed: true, kind: 'warmup' });
    store.update('sets', store.setsOf(wes[3]!.id)[0]!.id, { reps: 10, completed: true }); // pull ups: no volume
    store.finishWorkout(w.id);
    const w2 = store.startWorkout();
    store.addExerciseToWorkout(w2.id, wes[2]!.exerciseId);
    const all = workoutSummaries(store.dataset);
    for (const id of [w.id, w2.id]) {
      const { exercises, ...rest } = all.get(id)!;
      expect({ ...rest, durationSeconds: 0 }).toEqual({ ...workoutSummary(store.dataset, id), durationSeconds: 0 });
      expect(exercises.length).toBe(rest.exerciseCount);
    }
    expect(all.get(w.id)!.volume).toBe(500);
    expect(all.get(w.id)!.exercises.map((e) => e.workingSets)).toEqual([1, 1]);
  });
});
