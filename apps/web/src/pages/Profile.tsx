import { useMemo, useState } from 'react';
import { MEASUREMENT_KINDS, fromKg, toKg, workoutsPerWeek, type MeasurementKind } from '@open-workouts/shared';
import { usePrefs, useStore } from '../state';
import { BarChart, LineChart, formatDate, label } from '../ui';

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

const UNIT: Partial<Record<MeasurementKind, string>> = { body_fat: '%', caloric_intake: 'kcal' };

export function MeasurementsPage() {
  const store = useStore();
  const prefs = usePrefs();
  const [kind, setKind] = useState<MeasurementKind>('body_weight');
  const [value, setValue] = useState('');
  const unit = kind === 'body_weight' ? prefs.weightUnit : (UNIT[kind] ?? 'cm');
  const list = store
    .all('measurements')
    .filter((m) => m.kind === kind)
    .sort((a, b) => b.takenAt - a.takenAt);
  const display = (v: number) => (kind === 'body_weight' ? +fromKg(v, prefs.weightUnit).toFixed(2) : v);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(value.replace(',', '.'));
    if (!Number.isFinite(v) || !value) return;
    store.insert('measurements', {
      kind,
      value: kind === 'body_weight' ? toKg(v, prefs.weightUnit) : v,
      takenAt: Date.now(),
      note: null,
    });
    setValue('');
  }

  return (
    <div className="page">
      <h1>Measurements</h1>
      <select value={kind} onChange={(e) => setKind(e.target.value as MeasurementKind)}>
        {MEASUREMENT_KINDS.map((k) => (
          <option key={k} value={k}>
            {label(k)}
          </option>
        ))}
      </select>
      <form className="row" onSubmit={add}>
        <input inputMode="decimal" placeholder={`Value (${unit})`} value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="primary" type="submit">
          Add
        </button>
      </form>
      <div className="card">
        <LineChart unit={unit} points={[...list].reverse().map((m) => ({ x: m.takenAt, y: display(m.value) }))} />
      </div>
      <ul className="list">
        {list.map((m) => (
          <li key={m.id} className="pad row between">
            <span>
              {display(m.value)} {unit}
            </span>
            <span className="row">
              <span className="muted small">{formatDate(m.takenAt)}</span>
              <button className="ghost small danger" onClick={() => store.remove('measurements', m.id)}>
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
