import { useEffect, useState, type ReactNode } from 'react';
import { formatNumber, fromKg, type Exercise, type LogType } from '@open-workouts/shared';
import type { Prefs } from './state';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ExercisePicker({
  exercises,
  onPick,
  onClose,
}: {
  exercises: Exercise[];
  onPick: (e: Exercise) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [part, setPart] = useState('');
  const parts = [...new Set(exercises.map((e) => e.bodyPart))].sort();
  const list = exercises.filter(
    (e) => (!part || e.bodyPart === part) && e.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <Modal title="Add exercise" onClose={onClose}>
      <div className="row">
        <input autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={part} onChange={(e) => setPart(e.target.value)}>
          <option value="">Any body part</option>
          {parts.map((p) => (
            <option key={p} value={p}>
              {label(p)}
            </option>
          ))}
        </select>
      </div>
      <ul className="list scroll">
        {list.map((e) => (
          <li key={e.id}>
            <button className="list-btn" onClick={() => onPick(e)}>
              <strong>{e.name}</strong>
              <span className="muted">{label(e.bodyPart)}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="muted pad">No matches. Create a custom exercise on the Exercises tab.</li>}
      </ul>
    </Modal>
  );
}

export const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function weightLabel(logType: LogType, prefs: Prefs) {
  if (logType === 'assisted_bodyweight') return `-${prefs.weightUnit}`;
  if (logType === 'weighted_bodyweight') return `+${prefs.weightUnit}`;
  return prefs.weightUnit;
}

export const showWeight = (kg: number | null | undefined, prefs: Prefs) =>
  kg == null ? '' : String(+fromKg(kg, prefs.weightUnit).toFixed(2));
/** A total (volume) with thousands separators: "8,087.5". */
export const showVolume = (kg: number, prefs: Prefs) => formatNumber(fromKg(kg, prefs.weightUnit), 1);

export function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

/** Tiny dependency-free SVG line chart. */
export function LineChart({ points, unit = '' }: { points: { x: number; y: number }[]; unit?: string }) {
  if (points.length < 2) return <p className="muted">Not enough data for a chart yet.</p>;
  const W = 600;
  const H = 180;
  const P = 28;
  const L = 64; // left gutter for the value labels
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  // Fit the scale to the data (not to zero) so small changes, like body weight, stay visible.
  const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
  const pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 0.01, 0.5);
  const [y0, y1] = [lo - pad, hi + pad];
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - P);
  const sy = (y: number) => H - P - ((y - y0) / (y1 - y0 || 1)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      <line x1={L} y1={H - P} x2={W - P} y2={H - P} className="axis" />
      <text x={L - 8} y={sy(hi) + 4} className="tick" textAnchor="end">
        {+hi.toFixed(1)} {unit}
      </text>
      <text x={L - 8} y={sy(lo) + 4} className="tick" textAnchor="end">
        {+lo.toFixed(1)} {unit}
      </text>
      <text x={L} y={H - 8} className="tick">
        {new Date(x0).toLocaleDateString()}
      </text>
      <text x={W - P} y={H - 8} className="tick" textAnchor="end">
        {new Date(x1).toLocaleDateString()}
      </text>
      <path d={d} className="line" />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} className="dot">
          <title>
            {new Date(p.x).toLocaleDateString()}: {+p.y.toFixed(2)} {unit}
          </title>
        </circle>
      ))}
    </svg>
  );
}

export function BarChart({ bars }: { bars: { label: string; value: number }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="bars">
      {bars.map((b, i) => (
        <div key={i} className="bar-col" title={`${b.label}: ${b.value}`}>
          <div className="bar" style={{ height: `${(b.value / max) * 100}%` }} />
          <span className="bar-label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
