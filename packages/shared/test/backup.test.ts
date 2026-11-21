import { describe, expect, it } from 'vitest';
import {
  BUILTIN_EXERCISES,
  MemoryStorage,
  WorkoutStore,
  exportStrongCsv,
  findBuiltinByName,
  importStrongCsv,
  looksLikeBackup,
  parseBackup,
} from '../src';

async function storeWithWorkout() {
  let t = 1_700_000_000_000;
  const store = new WorkoutStore(new MemoryStorage(), { now: () => (t += 1000) });
  await store.init();
  const bench = findBuiltinByName('Bench Press (Barbell)')!;
  const w = store.startWorkout({ name: 'Push Day' });
  const we = store.addExerciseToWorkout(w.id, bench.id);
  store.update('sets', store.setsOf(we.id)[0]!.id, { weight: 100, reps: 5, completed: true });
  store.finishWorkout(w.id);
  store.saveWorkoutAsTemplate(w.id, 'Push');
  store.insert('measurements', { kind: 'body_weight', value: 80, takenAt: t, note: null });
  return { store, workout: store.get('workouts', w.id)!, tick: () => (t += 1000) };
}

describe('JSON backup', () => {
  it('restores everything into an empty store and is idempotent', async () => {
    const { store } = await storeWithWorkout();
    const text = JSON.stringify(store.backup());
    expect(looksLikeBackup(text)).toBe(true);

    const fresh = new WorkoutStore(new MemoryStorage());
    await fresh.init();
    const s = fresh.restoreBackup(parseBackup(text));
    expect(s.workouts).toBe(1);
    expect(s.templates).toBe(1);
    expect(fresh.all('sets')).toHaveLength(1);
    expect(fresh.all('templateSets')).toHaveLength(1);
    expect(fresh.all('measurements')).toHaveLength(1);
    expect(fresh.pendingCount()).toBeGreaterThan(0); // pushed on the next sync

    const again = fresh.restoreBackup(parseBackup(text));
    expect(again.added + again.restored + again.updated).toBe(0);
    expect(fresh.all('workouts')).toHaveLength(1);
  });

  it('brings back deleted rows but keeps newer local edits', async () => {
    const { store, workout } = await storeWithWorkout();
    const backup = parseBackup(JSON.stringify(store.backup()));
    store.deleteWorkout(workout.id);
    store.update('measurements', store.all('measurements')[0]!.id, { value: 79 });

    const s = store.restoreBackup(backup);
    expect(s.restored).toBeGreaterThan(0);
    expect(store.get('workouts', workout.id)).toBeDefined();
    expect(store.all('sets').filter((x) => x.workoutId === workout.id)).toHaveLength(1);
    expect(store.all('measurements')[0]!.value).toBe(79);
  });

  it('rejects other files', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(/Not an Open Workouts backup/);
    expect(() => parseBackup('nope')).toThrow(/not valid JSON/);
    expect(() => parseBackup('{"format":"open-workouts-backup","version":99,"data":{}}')).toThrow(/newer version/);
    const bad = parseBackup('{"format":"open-workouts-backup","version":1,"data":{"workouts":[{"id":1}]}}');
    expect(bad.invalid).toBe(1);
  });
});

describe('CSV round trip', () => {
  it('re-imports its own export without duplicating, in any unit', async () => {
    const { store } = await storeWithWorkout();
    const names = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e.name]));
    const csv = exportStrongCsv(
      { workouts: store.all('workouts'), workoutExercises: store.all('workoutExercises'), sets: store.all('sets'), exerciseName: (id) => names.get(id)! },
      { weightUnit: 'lb', distanceUnit: 'mi' },
    );
    expect(csv.split('\n')[0]).toContain('Weight (lbs)');

    // Into the same account: nothing new.
    const same = importStrongCsv(csv, { weightUnit: 'kg', distanceUnit: 'km', existingWorkouts: store.all('workouts') });
    expect(same.summary.workouts).toBe(0);
    expect(same.summary.alreadyLogged).toBe(1);

    // Into an empty account: the header units win over the selected unit.
    const fresh = importStrongCsv(csv, { weightUnit: 'kg', distanceUnit: 'km' });
    expect(fresh.summary.workouts).toBe(1);
    expect(fresh.changes.sets[0]!.weight).toBeCloseTo(100, 2);
    const w = fresh.changes.workouts[0]!;
    const orig = store.all('workouts')[0]!;
    expect(Math.abs(w.startedAt - orig.startedAt)).toBeLessThan(1000);
    expect(w.endedAt! - w.startedAt).toBe(Math.round((orig.endedAt! - orig.startedAt) / 1000) * 1000);
  });

  it('writes times in the requested zone', () => {
    const w = { id: 'w', name: 'A', startedAt: Date.UTC(2025, 0, 1, 12, 0), endedAt: Date.UTC(2025, 0, 1, 13, 0), notes: null, templateId: null, createdAt: 0, updatedAt: 0, deletedAt: null };
    const we = { id: 'we', workoutId: 'w', exerciseId: 'x', position: 0, supersetId: null, notes: null, restSeconds: null, createdAt: 0, updatedAt: 0, deletedAt: null };
    const s = { id: 's', workoutId: 'w', workoutExerciseId: 'we', position: 0, kind: 'normal' as const, weight: 50, reps: 5, distance: null, duration: null, rpe: null, completed: true, createdAt: 0, updatedAt: 0, deletedAt: null };
    // UTC-5 (getTimezoneOffset() = 300): noon UTC is 07:00 local.
    const csv = exportStrongCsv({ workouts: [w], workoutExercises: [we], sets: [s], exerciseName: () => 'Thing' }, { weightUnit: 'kg', distanceUnit: 'km', timezoneOffsetMinutes: 300 });
    expect(csv).toContain('2025-01-01 07:00:00');
    const back = importStrongCsv(csv, { weightUnit: 'kg', distanceUnit: 'km', timezoneOffsetMinutes: 300 });
    expect(back.changes.workouts[0]!.startedAt).toBe(w.startedAt);
  });
});

describe('exercise notes', () => {
  it('pins a note to the exercise across workouts, separate from the per-workout note', async () => {
    const { store, workout } = await storeWithWorkout();
    const bench = findBuiltinByName('Bench Press (Barbell)')!;
    const we = store.workoutExercises(workout.id)[0]!;
    store.update('workoutExercises', we.id, { notes: 'felt heavy' });
    store.setPinnedNote(bench.id, '  Grip on the rings ');
    expect(store.pinnedNote(bench.id)).toBe('Grip on the rings');

    // The per-workout note stays with that workout; a template made from it doesn't copy it.
    const tpl = store.saveWorkoutAsTemplate(workout.id, 'Again');
    expect(store.all('templateExercises').find((x) => x.templateId === tpl.id)!.notes).toBeNull();
    const w2 = store.startWorkout({ templateId: tpl.id });
    expect(store.workoutExercises(w2.id)[0]!.notes).toBeNull();
    expect(store.pinnedNote(bench.id)).toBe('Grip on the rings');

    // Clearing and re-pinning.
    store.setPinnedNote(bench.id, '');
    expect(store.pinnedNote(bench.id)).toBeNull();
    store.setPinnedNote(bench.id, 'Seat 4');
    expect(store.pinnedNote(bench.id)).toBe('Seat 4');
    expect(store.all('settings').filter((s) => s.id.startsWith('pin:'))).toHaveLength(1);
  });
});
