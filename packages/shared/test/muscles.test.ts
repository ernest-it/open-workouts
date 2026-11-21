import { describe, expect, it } from 'vitest';
import { BUILTIN_EXERCISES, MemoryStorage, WorkoutStore, findBuiltinByName, muscleSets, musclesOf } from '../src';

const of = (name: string) => musclesOf(findBuiltinByName(name)!);

describe('musclesOf', () => {
  it('reads muscles from exercise names', () => {
    expect(of('Bench Press (Barbell)').primary).toEqual(['chest']);
    expect(of('Close Grip Bench Press (Barbell)').primary).toContain('triceps');
    expect(of('Reverse Fly (Dumbbell)').primary).toContain('upper_back');
    expect(of('Chest Fly (Dumbbell)').primary).toEqual(['chest']);
    expect(of('Lying Leg Curl (Machine)').primary).toEqual(['hamstrings']);
    expect(of('Bicep Curl (Barbell)').primary).toEqual(['biceps']);
    expect(of('Romanian Deadlift (Barbell)').primary).toEqual(['hamstrings', 'glutes']);
    expect(of('Calf Press on Leg Press').primary).toEqual(['calves']);
    expect(of('Lat Pulldown (Cable)').primary).toEqual(['lats']);
    expect(of('Upright Row (Barbell)').primary).toEqual(['shoulders', 'traps']);
    expect(of('Running').primary).toEqual([]);
    expect(of('Handstand Push Up').primary).toEqual(['shoulders']);
    expect(of('Thruster (Barbell)').primary).toContain('shoulders');
    expect(of('Hip Thrust (Barbell)').primary).toEqual(['glutes']);
    expect(of('Wrist Curl (Barbell)')).toEqual({ primary: ['forearms'], secondary: [] });
    expect(of('Kettlebell Swing').primary).toEqual(['glutes', 'hamstrings']);
    expect(of('Straight Arm Pulldown (Cable)').secondary).toEqual([]);
    expect(of('Triceps Kickback (Dumbbell)').primary).toEqual(['triceps']);
    expect(of('Glute Kickback (Cable)').primary).toEqual(['glutes']);
    expect(of('Burpee').primary).toEqual([]);
  });

  it('gives every strength exercise at least one muscle', () => {
    const none = BUILTIN_EXERCISES.filter((e) => !['cardio', 'other', 'full_body'].includes(e.bodyPart) && !musclesOf(e).primary.length);
    expect(none.map((e) => e.name)).toEqual([]);
  });
});

describe('muscleSets', () => {
  it('counts primary sets fully and secondary ones by half', async () => {
    const now = 10_000_000_000;
    const store = new WorkoutStore(new MemoryStorage(), { now: () => now });
    await store.init();
    const w = store.startWorkout();
    const we = store.addExerciseToWorkout(w.id, findBuiltinByName('Bench Press (Barbell)')!.id, 2);
    for (const s of store.setsOf(we.id)) store.update('sets', s.id, { weight: 60, reps: 8, completed: true });
    store.finishWorkout(w.id);
    const m = muscleSets(store.dataset, now - 1000, now + 1000);
    expect(m.chest).toBe(2);
    expect(m.triceps).toBe(1);
    expect(m.quads).toBe(0);
    expect(muscleSets(store.dataset, now + 1000, now + 2000).chest).toBe(0);
  });
});
