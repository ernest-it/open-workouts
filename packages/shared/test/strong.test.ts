import { describe, expect, it } from 'vitest';
import { exportStrongCsv, findBuiltinByName, importStrongCsv, parseCsv } from '../src';

const CSV = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2024-01-15 08:30:00,"Push Day",1h 5m,Bench Press (Barbell),W,60,10,0,0,"",felt good,
2024-01-15 08:30:00,"Push Day",1h 5m,Bench Press (Barbell),1,100,5,0,0,"Pause, then press",felt good,8
2024-01-15 08:30:00,"Push Day",1h 5m,Bench Press (Barbell),2,100,5,0,0,"",felt good,8.5
2024-01-15 08:30:00,"Push Day",1h 5m,Bench Press (Barbell),D,80,8,0,0,"",felt good,
2024-01-15 08:30:00,"Push Day",1h 5m,My Weird Machine,1,50,12,0,0,"",felt good,
2024-01-15 08:30:00,"Push Day",1h 5m,Plank,1,0,0,0,60,"",felt good,
2024-01-15 08:30:00,"Push Day",1h 5m,Bench Press (Barbell),Rest Timer,0,0,0,90,"",felt good,
2024-01-17 18:00:00,"Run",30m,Running,1,0,0,5,1800,"","",
`;

describe('strong csv', () => {
  it('parses quoted fields', () => {
    const rows = parseCsv('a,b\n"x, y","he said ""hi"""\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]);
  });

  it('imports workouts, sets and exercises', () => {
    const r = importStrongCsv(CSV, { weightUnit: 'kg', distanceUnit: 'km', timezoneOffsetMinutes: 0, now: 1 });
    expect(r.summary.workouts).toBe(2);
    expect(r.summary.sets).toBe(7);
    expect(r.summary.skippedRows).toBe(1);
    expect(r.summary.newExercises).toEqual(['My Weird Machine']);
    const push = r.changes.workouts.find((w) => w.name === 'Push Day')!;
    expect(push.startedAt).toBe(Date.UTC(2024, 0, 15, 8, 30));
    expect(push.endedAt! - push.startedAt).toBe(3900_000);
    expect(push.notes).toBe('felt good');
    const bench = findBuiltinByName('Bench Press (Barbell)')!;
    const benchWex = r.changes.workoutExercises.find((x) => x.exerciseId === bench.id)!;
    expect(benchWex.notes).toBe('Pause, then press');
    const benchSets = r.changes.sets.filter((s) => s.workoutExerciseId === benchWex.id);
    expect(benchSets.map((s) => s.kind)).toEqual(['warmup', 'normal', 'normal', 'drop']);
    expect(benchSets[2]!.rpe).toBe(8.5);
    const run = r.changes.sets.find((s) => s.distance)!;
    expect(run.distance).toBe(5000);
    expect(run.duration).toBe(1800);
  });

  it('is idempotent (deterministic ids)', () => {
    const a = importStrongCsv(CSV, { weightUnit: 'kg', distanceUnit: 'km', now: 1 });
    const b = importStrongCsv(CSV, { weightUnit: 'kg', distanceUnit: 'km', now: 2 });
    expect(a.changes.sets.map((s) => s.id)).toEqual(b.changes.sets.map((s) => s.id));
  });

  it('converts pounds', () => {
    const lb = CSV.replace(',100,5,', ',225,5,');
    const r = importStrongCsv(lb, { weightUnit: 'lb', distanceUnit: 'mi', now: 1 });
    expect(r.changes.sets[1]!.weight).toBeCloseTo(102.058, 2);
  });

  it('handles legacy semicolon format with unit columns', () => {
    const legacy = `Date;Workout Name;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes;Duration
2019-03-01 10:00:00;Legs;Squat (Barbell);1;225;lbs;5;;;;0;;;45m
`;
    const r = importStrongCsv(legacy, { weightUnit: 'kg', distanceUnit: 'km', now: 1 });
    expect(r.summary.sets).toBe(1);
    expect(r.changes.sets[0]!.weight).toBeCloseTo(102.06, 1);
    expect(r.changes.exercises).toHaveLength(0);
  });

  it('handles the newer semicolon export with units in headers and Note rows', () => {
    const csv = `Workout #;Date;Workout Name;Duration (sec);Exercise Name;Set Order;Weight (lbs);Reps;RPE;Distance (meters);Seconds;Notes;Workout Notes
1;2025-12-22 08:00:00;"Upper";3600;"Bench Press (Barbell)";Note;0;0;;0;0;"Elbows tucked";""
1;2025-12-22 08:00:00;"Upper";3600;"Bench Press (Barbell)";W;135;10;;0;0;"";""
1;2025-12-22 08:00:00;"Upper";3600;"Bench Press (Barbell)";1;225;5;9;0;0;"";""
1;2025-12-22 08:00:00;"Upper";3600;"Bench Press (Barbell)";F;225;3;10;0;0;"";""
2;22 Dec 2025, 18:00;"Cardio";1800;"Running";1;0;0;;5000;1800;"";""
`;
    const r = importStrongCsv(csv, { weightUnit: 'kg', distanceUnit: 'km', timezoneOffsetMinutes: 0, now: 1 });
    expect(r.summary.workouts).toBe(2);
    expect(r.summary.sets).toBe(4);
    expect(r.changes.workoutExercises[0]!.notes).toBe('Elbows tucked');
    expect(r.changes.sets.map((s) => s.kind)).toEqual(['warmup', 'normal', 'failure', 'normal']);
    expect(r.changes.sets[1]!.weight).toBeCloseTo(102.06, 1);
    expect(r.changes.sets[3]!.distance).toBe(5000);
    const upper = r.changes.workouts.find((w) => w.name === 'Upper')!;
    expect(upper.endedAt! - upper.startedAt).toBe(3600_000);
    const cardio = r.changes.workouts.find((w) => w.name === 'Cardio')!;
    expect(cardio.startedAt).toBe(Date.UTC(2025, 11, 22, 18, 0));
  });

  it('round-trips through export', () => {
    const r = importStrongCsv(CSV, { weightUnit: 'kg', distanceUnit: 'km', now: 1 });
    const names = new Map(r.changes.exercises.map((e) => [e.id, e.name]));
    const out = exportStrongCsv(
      { ...r.changes, exerciseName: (id) => names.get(id) ?? findBuiltinByName(id)?.name ?? id.replace('builtin:', '') },
      { weightUnit: 'kg', distanceUnit: 'km' },
    );
    const again = importStrongCsv(out, { weightUnit: 'kg', distanceUnit: 'km', now: 1 });
    expect(again.summary.sets).toBe(7);
    expect(again.summary.workouts).toBe(2);
  });
});
