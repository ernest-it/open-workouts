import { describe, expect, it } from 'vitest';
import { MemoryStorage, WorkoutStore, findBuiltinByName, setsPerBodyPart, startOfWeek, streakReminder, weeklyGoal } from '../src';

const DAY = 86_400_000;
// A Wednesday at noon, local time.
const NOW = new Date(2026, 10, 18, 12).getTime();

async function withWorkouts(daysAgo: number[]) {
  const store = new WorkoutStore(new MemoryStorage(), { now: () => NOW });
  await store.init();
  const bench = findBuiltinByName('Bench Press (Barbell)')!.id;
  const squat = findBuiltinByName('Squat (Barbell)')!.id;
  for (const d of daysAgo) {
    const w = store.insert('workouts', { name: 'W', startedAt: NOW - d * DAY, endedAt: NOW - d * DAY + 3_600_000, notes: null, templateId: null });
    for (const [ex, n] of [[bench, 3], [squat, 2]] as const) {
      const we = store.insert('workoutExercises', { workoutId: w.id, exerciseId: ex, position: 0, supersetId: null, notes: null, restSeconds: null });
      for (let i = 0; i < n; i++)
        store.insert('sets', {
          workoutId: w.id,
          workoutExerciseId: we.id,
          position: i,
          kind: i === 0 && ex === squat ? 'warmup' : 'normal',
          weight: 50,
          reps: 5,
          distance: null,
          duration: null,
          rpe: null,
          completed: true,
        });
    }
  }
  return store;
}

describe('startOfWeek', () => {
  it('is the Monday at midnight', () => {
    const d = new Date(startOfWeek(NOW));
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(0);
  });
});

describe('weeklyGoal', () => {
  it('counts this week and the streak of weeks that hit the goal', async () => {
    // This week: Mon (2 days ago). Last week: 2 workouts. Week before: 2. Before that: 1.
    const store = await withWorkouts([2, 4, 8, 11, 12, 18]);
    expect(weeklyGoal(store.dataset, 2, NOW)).toEqual({ thisWeek: 1, streak: 2, goal: 2 });
    expect(weeklyGoal(store.dataset, 1, NOW)).toEqual({ thisWeek: 1, streak: 4, goal: 1 });
  });

  it('includes this week once the goal is reached', async () => {
    const store = await withWorkouts([0, 1, 8, 9]);
    expect(weeklyGoal(store.dataset, 2, NOW).streak).toBe(2);
  });
});

describe('setsPerBodyPart', () => {
  it('counts working sets per body part per week', async () => {
    const store = await withWorkouts([1, 2, 9]);
    const weeks = setsPerBodyPart(store.dataset, 2, NOW);
    expect(weeks).toHaveLength(2);
    expect(weeks[1]!.weekStart).toBe(startOfWeek(NOW));
    const bench = findBuiltinByName('Bench Press (Barbell)')!;
    const squat = findBuiltinByName('Squat (Barbell)')!;
    expect(weeks[1]!.sets[bench.bodyPart]).toBe(6);
    expect(weeks[1]!.sets[squat.bodyPart]).toBe(2); // warm-ups don't count
    expect(weeks[0]!.sets[bench.bodyPart]).toBe(3);
  });
});

describe('streakReminder', () => {
  it('warns on the last day the goal can still be reached', async () => {
    // Streak of 2 weeks at goal 2; one workout so far this week (Monday). NOW is Wednesday.
    const store = await withWorkouts([2, 4, 8, 11, 12]);
    const r = streakReminder(store.dataset, 2, NOW)!;
    const at = new Date(r.at);
    expect(at.getDay()).toBe(0); // Sunday
    expect(at.getHours()).toBe(9);
    expect(r.body).toContain('2-week streak');
    // Needing two more moves it to Saturday.
    const none = await withWorkouts([4, 8, 11, 12]); // nothing yet this week
    expect(new Date(streakReminder(none.dataset, 2, NOW)!.at).getDay()).toBe(6);
  });

  it('stays quiet when there is nothing to lose or the goal is met', async () => {
    expect(streakReminder((await withWorkouts([2])).dataset, 2, NOW)).toBeNull(); // no streak
    expect(streakReminder((await withWorkouts([0, 1, 8, 9])).dataset, 2, NOW)).toBeNull(); // met
    // Needs 6 more by Sunday: too late, no reminder.
    expect(streakReminder((await withWorkouts([8, 9, 10, 11, 12, 13])).dataset, 6, NOW)).toBeNull();
  });
});
