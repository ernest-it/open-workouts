import { useState } from 'react';
import {
  MEASUREMENT_KINDS,
  MEASURE_GROUPS,
  formatNumber,
  fromKg,
  measureName,
  measureUnit,
  measurementChange,
  measurementsByKind,
  toKg,
  type MeasurementKind,
} from '@open-workouts/shared';
import { usePrefs, useStore, type Prefs } from '../state';
import { navigate } from '../router';
import { useDialog } from '../dialog';
import { LineChart, formatDate } from '../ui';

const DAY = 86_400_000;
const RANGES = [
  { value: 30, label: '1M' },
  { value: 91, label: '3M' },
  { value: 365, label: '1Y' },
  { value: 0, label: 'All' },
];

/** Stored value → shown value (body weight is stored in kg). */
const shown = (k: MeasurementKind, v: number, p: Prefs) => (k === 'body_weight' ? +fromKg(v, p.weightUnit).toFixed(2) : v);
const stored = (k: MeasurementKind, v: number, p: Prefs) => (k === 'body_weight' ? toKg(v, p.weightUnit) : v);
const fmt = (k: MeasurementKind, v: number, p: Prefs) => `${formatNumber(shown(k, v, p), 1)} ${measureUnit(k, p.weightUnit)}`;
const signed = (k: MeasurementKind, diff: number, p: Prefs) => {
  const r = +(k === 'body_weight' ? fromKg(diff, p.weightUnit) : diff).toFixed(1);
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${formatNumber(Math.abs(r), 1)} ${measureUnit(k, p.weightUnit)}`;
};
const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(new Date(ms).getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) });
const parse = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(v) ? v : null;
};
const isKind = (s: string | undefined): s is MeasurementKind => !!s && (MEASUREMENT_KINDS as readonly string[]).includes(s);

/** #/measure (overview), #/measure/log (log several) and #/measure/<kind> (one measurement). */
export function MeasurementsPage({ id }: { id?: string }) {
  if (id === 'log') return <LogMeasurements />;
  if (isKind(id)) return <MeasurementDetail kind={id} />;
  return <Overview />;
}

function Overview() {
  const store = useStore();
  const prefs = usePrefs();
  const groups = measurementsByKind(store.all('measurements'));
  const tracked = MEASUREMENT_KINDS.filter((k) => k === 'body_weight' || groups.has(k));
  return (
    <div className="page">
      <div className="section-head">
        <h1>Measurements</h1>
        <button className="primary" onClick={() => navigate('measure/log')}>
          Log measurements
        </button>
      </div>
      <div className="grid measure-grid">
        {tracked.map((k) => {
          const list = groups.get(k) ?? [];
          const latest = list[0];
          const c = measurementChange(list);
          return (
            <button key={k} className="card measure-tile" onClick={() => navigate(`measure/${k}`)}>
              <span className="eyebrow">{measureName(k)}</span>
              <span className="measure-value">{latest ? fmt(k, latest.value, prefs) : '—'}</span>
              <span className="muted small">
                {!latest ? 'Not logged yet' : c ? `${signed(k, c.diff, prefs)} since ${shortDate(c.since)}` : shortDate(latest.takenAt)}
              </span>
            </button>
          );
        })}
      </div>
      {tracked.length < 3 && <p className="muted small">Log a measurement and it gets its own tile here.</p>}
    </div>
  );
}

function LogMeasurements() {
  const store = useStore();
  const prefs = usePrefs();
  const dialog = useDialog();
  const [values, setValues] = useState<Partial<Record<MeasurementKind, string>>>({});
  const groups = measurementsByKind(store.all('measurements'));
  const filled = MEASUREMENT_KINDS.filter((k) => parse(values[k] ?? '') != null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!filled.length) return;
    const at = Date.now();
    for (const k of filled) store.insert('measurements', { kind: k, value: stored(k, parse(values[k]!)!, prefs), takenAt: at, note: null });
    dialog.toast(filled.length === 1 ? `Saved ${measureName(filled[0]!).toLowerCase()}` : `Saved ${filled.length} measurements`);
    navigate('measure');
  }

  const input = (k: MeasurementKind, side?: string) => {
    const last = groups.get(k)?.[0];
    return (
      <label key={k} className="measure-input">
        {side && <span className="muted small">{side}</span>}
        <input
          inputMode="decimal"
          value={values[k] ?? ''}
          placeholder={last ? String(shown(k, last.value, prefs)) : '–'}
          aria-label={`${measureName(k)} in ${measureUnit(k, prefs.weightUnit)}`}
          title={last ? `Last: ${fmt(k, last.value, prefs)} on ${shortDate(last.takenAt)}` : undefined}
          onChange={(e) => setValues((s) => ({ ...s, [k]: e.target.value }))}
        />
      </label>
    );
  };

  return (
    <form className="page" onSubmit={save}>
      <button type="button" className="ghost" onClick={() => navigate('measure')}>
        ‹ Measurements
      </button>
      <div className="section-head">
        <h1>Log measurements</h1>
        <button className="primary" type="submit" disabled={!filled.length}>
          {filled.length > 1 ? `Save ${filled.length} measurements` : 'Save'}
        </button>
      </div>
      <p className="muted">Fill in what you measured. Grey numbers are your last values.</p>
      <div className="measure-groups">
        {MEASURE_GROUPS.map((g) => (
          <section key={g.title} className="card">
            <h3>{g.title}</h3>
            {g.rows.map((r) => (
              <div key={r.label} className="measure-row">
                <span>
                  {r.label} <span className="muted small">{measureUnit(r.kinds[0]!, prefs.weightUnit)}</span>
                </span>
                <div className="measure-inputs">{r.kinds.length === 2 ? [input(r.kinds[0]!, 'L'), input(r.kinds[1]!, 'R')] : input(r.kinds[0]!)}</div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </form>
  );
}

function MeasurementDetail({ kind }: { kind: MeasurementKind }) {
  const store = useStore();
  const prefs = usePrefs();
  const dialog = useDialog();
  const [value, setValue] = useState('');
  const [range, setRange] = useState(91);
  const [all, setAll] = useState(false);
  const unit = measureUnit(kind, prefs.weightUnit);
  const list = measurementsByKind(store.all('measurements')).get(kind) ?? [];
  const from = range && list[0] ? Date.now() - range * DAY : 0;
  const points = list
    .filter((m) => m.takenAt >= from)
    .map((m) => ({ x: m.takenAt, y: shown(kind, m.value, prefs) }))
    .reverse();
  const visible = all ? list : list.slice(0, 20);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const v = parse(value);
    if (v == null) return;
    store.insert('measurements', { kind, value: stored(kind, v, prefs), takenAt: Date.now(), note: null });
    setValue('');
  }

  return (
    <div className="page">
      <button className="ghost" onClick={() => navigate('measure')}>
        ‹ Measurements
      </button>
      <h1>{measureName(kind)}</h1>
      <p className="muted">{list[0] ? `Latest ${fmt(kind, list[0].value, prefs)} · ${formatDate(list[0].takenAt)}` : 'Not logged yet'}</p>
      <form className="row" onSubmit={add}>
        <input
          inputMode="decimal"
          placeholder={list[0] ? String(shown(kind, list[0].value, prefs)) : `New value (${unit})`}
          aria-label={`New ${measureName(kind)} in ${unit}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <span className="muted">{unit}</span>
        <button className="primary" type="submit" disabled={parse(value) == null}>
          Add
        </button>
      </form>
      {list.length >= 2 && (
        <div className="card">
          <div className="segmented" role="radiogroup" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r.label} role="radio" aria-checked={range === r.value} className={range === r.value ? 'on' : ''} onClick={() => setRange(r.value)}>
                {r.label}
              </button>
            ))}
          </div>
          <LineChart unit={unit} points={points} />
        </div>
      )}
      {list.length > 0 && (
        <>
          <h3>History</h3>
          <ul className="list">
            {visible.map((m, i) => {
              const prev = list[i + 1];
              return (
                <li key={m.id} className="pad row between">
                  <span>
                    <strong>{fmt(kind, m.value, prefs)}</strong>
                    {prev && <span className="muted small"> &nbsp;{signed(kind, m.value - prev.value, prefs)}</span>}
                  </span>
                  <span className="row">
                    <span className="muted small">{formatDate(m.takenAt)}</span>
                    <button
                      className="ghost small danger"
                      aria-label={`Delete ${fmt(kind, m.value, prefs)}`}
                      onClick={() => {
                        // Delete straight away, with Undo, rather than asking first.
                        store.remove('measurements', m.id);
                        dialog.toast(`Deleted ${fmt(kind, m.value, prefs)}`, {
                          text: 'Undo',
                          onClick: () => store.insert('measurements', { kind: m.kind, value: m.value, takenAt: m.takenAt, note: m.note }),
                        });
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {list.length > visible.length && (
            <button className="ghost" onClick={() => setAll(true)}>
              Show all {list.length}
            </button>
          )}
        </>
      )}
    </div>
  );
}
