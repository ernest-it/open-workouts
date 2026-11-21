import { describe, expect, it } from 'vitest';
import { MemoryStorage, WorkoutStore, findBuiltinByName, suggestNextTemplate, templateLastDone } from '../src';

const DAY = 86_400_000;

async function setup() {
  const clock = { t: 1000 * DAY };
  const store = new WorkoutStore(new MemoryStorage(), { now: () => (clock.t += 1000) });
  await store.init();
  const bench = findBuiltinByName('Bench Press (Barbell)')!.id;
  const squat = findBuiltinByName('Squat (Barbell)')!.id;
  const tds = () => ({ ...store.dataset, templates: store.all('templates') });
  return { store, clock, bench, squat, tds };
}

describe('template editing', () => {
  it('adds exercises pre-filled from last time, adds sets and reorders', async () => {
    const { store, bench, squat } = await setup();
    const w = store.startWorkout();
    const we = store.addExerciseToWorkout(w.id, bench);
    store.update('sets', store.setsOf(we.id)[0]!.id, { weight: 80, reps: 5, completed: true });
    store.finishWorkout(w.id);

    const tpl = store.createTemplate('Push');
    const a = store.addExerciseToTemplate(tpl.id, bench);
    const b = store.addExerciseToTemplate(tpl.id, squat, 2);
    expect(store.templateSetsOf(a.id).map((s) => s.weight)).toEqual([80, null, null]);
    expect(store.templateSetsOf(b.id)).toHaveLength(2);

    store.update('templateSets', store.templateSetsOf(a.id)[2]!.id, { weight: 85, reps: 3 });
    const added = store.addTemplateSet(a.id);
    expect(added).toMatchObject({ position: 3, weight: 85, reps: 3 });

    store.moveTemplateExercise(b.id, -1);
    expect(store.templateExercises(tpl.id).map((x) => x.id)).toEqual([b.id, a.id]);
    store.removeTemplateExercise(b.id);
    expect(store.templateExercises(tpl.id).map((x) => x.id)).toEqual([a.id]);
    expect(store.all('templateSets').filter((s) => s.templateExerciseId === b.id)).toHaveLength(0);
  });

  it('updates a template from a workout that changed', async () => {
    const { store, bench, squat } = await setup();
    const tpl = store.createTemplate('Legs');
    store.addExerciseToTemplate(tpl.id, squat, 3);
    const w = store.startWorkout({ templateId: tpl.id });
    expect(store.workoutDiffersFromTemplate(w.id)).toBe(false);
    store.addExerciseToWorkout(w.id, bench, 2);
    expect(store.workoutDiffersFromTemplate(w.id)).toBe(true);
    store.updateTemplateFromWorkout(tpl.id, w.id);
    expect(store.workoutDiffersFromTemplate(w.id)).toBe(false);
    expect(store.templateExercises(tpl.id).map((x) => x.exerciseId)).toEqual([squat, bench]);
  });
});

describe('repeat workout', () => {
  it('copies the structure with last values and nothing ticked', async () => {
    const { store, bench } = await setup();
    const w = store.startWorkout({ name: 'Bench day' });
    const we = store.addExerciseToWorkout(w.id, bench, 2);
    const [s1, s2] = store.setsOf(we.id);
    store.update('sets', s1!.id, { weight: 60, reps: 10, completed: true, kind: 'warmup' });
    store.update('sets', s2!.id, { weight: 100, reps: 5, completed: true });
    store.finishWorkout(w.id);

    const r = store.repeatWorkout(w.id);
    expect(r.name).toBe('Bench day');
    expect(r.endedAt).toBeNull();
    const sets = store.setsOf(store.workoutExercises(r.id)[0]!.id);
    expect(sets.map((s) => [s.kind, s.weight, s.reps, s.completed])).toEqual([
      ['warmup', 60, 10, false],
      ['normal', 100, 5, false],
    ]);
  });
});

describe('templateLastDone / suggestNextTemplate', () => {
  it('matches imported workouts by name and rotates through recent templates', async () => {
    const { store, clock, tds } = await setup();
    const a = store.createTemplate('Upper A');
    const b = store.createTemplate('Lower A');
    const c = store.createTemplate('Old one');
    const done = (name: string, daysAgo: number, templateId?: string) => {
      const w = store.insert('workouts', {
        name,
        startedAt: clock.t - daysAgo * DAY,
        endedAt: clock.t - daysAgo * DAY + 3_600_000,
        notes: null,
        templateId: templateId ?? null,
      });
      return w;
    };
    done('upper a ', 5); // imported, no template id, different case/spacing
    done('Lower A', 3, b.id);
    done('Old one', 200);
    const last = templateLastDone(tds());
    expect(last.get(a.id)).toBeGreaterThan(0);
    expect(last.get(b.id)).toBeGreaterThan(last.get(a.id)!);
    expect(suggestNextTemplate(tds(), clock.t)?.id).toBe(a.id);
    done('Upper A', 1, a.id);
    expect(suggestNextTemplate(tds(), clock.t)?.id).toBe(b.id);
    expect(last.get(c.id)).toBeGreaterThan(0);
  });

  it('suggests nothing without a rotation', async () => {
    const { store, tds } = await setup();
    store.createTemplate('Only');
    expect(suggestNextTemplate(tds())).toBeNull();
  });
});
