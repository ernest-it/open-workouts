import { useMemo, useState } from 'react';
import { fromKg, workoutsPerWeek } from '@open-workouts/shared';
import { usePrefs, useStore } from '../state';
import { BarChart, LineChart } from '../ui';

export function ProfilePage({ username }: { username: string }) {
  const store = useStore();
  const prefs = usePrefs();
  const weeks = useMemo(() => workoutsPerWeek(store.dataset, 12), [store.dataset]);
  const total = store.all('workouts').filter((w) => w.endedAt != null).length;
  const bw = store
    .all('measurements')
    .filter((m) => m.kind === 'body_weight')
    .sort((a, b) => a.takenAt - b.takenAt);
  return (
    <div className="page">
      <h1>{username}</h1>
      <p className="muted">{total} workouts logged</p>
      <div className="card">
        <h3>Workouts per week</h3>
        <BarChart
          bars={weeks.map((w) => ({
            label: new Date(w.weekStart).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
            value: w.count,
          }))}
        />
      </div>
      <div className="card">
        <h3>Body weight</h3>
        <LineChart unit={prefs.weightUnit} points={bw.map((m) => ({ x: m.takenAt, y: fromKg(m.value, prefs.weightUnit) }))} />
      </div>
    </div>
  );
}
