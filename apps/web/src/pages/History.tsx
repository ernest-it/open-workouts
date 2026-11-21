import { useMemo, useState } from 'react';
import { formatDuration, formatElapsed, workoutPRs, workoutSummary, isWorkingSet } from '@open-workouts/shared';
import { navigate } from '../router';
import { api, usePrefs, useStore } from '../state';
import { Icon } from '../icons';
import { Modal, formatDate, showVolume, showWeight } from '../ui';
import { useDialog } from '../dialog';
import { Markdown } from '../markdown';
import { ActiveWorkout } from './Workout';

export function HistoryPage({ id }: { id?: string }) {
  if (id) return <WorkoutDetail id={id} />;
  return <HistoryList />;
}

function HistoryList() {
  const store = useStore();
  const prefs = usePrefs();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const workouts = store
    .all('workouts')
    .filter((w) => w.endedAt != null)
    .sort((a, b) => b.startedAt - a.startedAt);
  const days = new Set(workouts.map((w) => new Date(w.startedAt).toDateString()));

  const m = new Date(month);
  const firstDow = (m.getDay() + 6) % 7;
  const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="page">
      <h1>History</h1>
      <div className="card calendar">
        <div className="section-head">
          <button className="ghost" onClick={() => setMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1).getTime())}>
            ‹
          </button>
          <strong>{m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
          <button className="ghost" onClick={() => setMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime())}>
            ›
          </button>
        </div>
        <div className="cal-grid">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className="muted small">
              {d}
            </span>
          ))}
          {cells.map((d, i) => (
            <span key={i} className={d && days.has(new Date(m.getFullYear(), m.getMonth(), d).toDateString()) ? 'cal-day on' : 'cal-day'}>
              {d ?? ''}
            </span>
          ))}
        </div>
      </div>
      {workouts.length === 0 && <p className="muted">No workouts yet. Start one, or import your Strong export in Settings.</p>}
      {workouts.map((w) => (
        <WorkoutCard key={w.id} id={w.id} unit={prefs.weightUnit} />
      ))}
    </div>
  );
}

function WorkoutCard({ id, unit }: { id: string; unit: string }) {
  const store = useStore();
  const prefs = usePrefs();
  const w = store.get('workouts', id)!;
  const sum = useMemo(() => workoutSummary(store.dataset, id), [store.version, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const prs = useMemo(() => workoutPRs(store.dataset, id).length, [store.version, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const wexs = store.workoutExercises(id);
  return (
    <button className="card workout-card" onClick={() => navigate(`history/${id}`)}>
      <div className="section-head">
        <strong>{w.name}</strong>
        <span className="muted small">{formatDate(w.startedAt)}</span>
      </div>
      <div className="row muted small">
        <span>
          <Icon name="clock" size={14} /> {formatElapsed(sum.durationSeconds)}
        </span>
        <span>
          <Icon name="barbell" size={14} /> {showVolume(sum.volume, prefs)} {unit}
        </span>
        {prs > 0 && <span className="pr">
            <Icon name="trophy" size={14} /> {prs} PR{prs > 1 ? 's' : ''}</span>}
      </div>
      <ul className="plain small">
        {wexs.map((we) => {
          const sets = store.setsOf(we.id).filter(isWorkingSet);
          const best = sets.reduce<(typeof sets)[number] | undefined>((b, s) => ((s.weight ?? 0) * (s.reps ?? 0) > (b ? (b.weight ?? 0) * (b.reps ?? 0) : -1) ? s : b), undefined);
          return (
            <li key={we.id} className="row between">
              <span>
                {sets.length} × {store.get('exercises', we.exerciseId)?.name ?? 'Unknown'}
              </span>
              <span className="muted">{best?.weight ? `${showWeight(best.weight, prefs)} ${unit} × ${best.reps}` : best?.reps ? `${best.reps} reps` : ''}</span>
            </li>
          );
        })}
      </ul>
    </button>
  );
}

function WorkoutDetail({ id }: { id: string }) {
  const store = useStore();
  const dialog = useDialog();
  const prefs = usePrefs();
  const [editing, setEditing] = useState(false);
  const [comparison, setComparison] = useState<{ title: string; content: string } | null>(null);
  const [comparing, setComparing] = useState(false);
  const w = store.get('workouts', id);
  if (!w) return <div className="page"><p>Workout not found.</p></div>;
  const prs = new Map(workoutPRs(store.dataset, id).map((p) => [p.setId, p.types]));
  const sum = workoutSummary(store.dataset, id);

  if (editing) {
    return (
      <div>
        <div className="page row between">
          <span className="muted">Editing a past workout</span>
          <button className="primary" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
        <ActiveWorkout workout={w} editing />
      </div>
    );
  }

  return (
    <div className="page">
      <button className="ghost" onClick={() => navigate('history')}>
        ‹ History
      </button>
      <div className="section-head">
        <h1>{w.name}</h1>
        <div className="row">
          <button onClick={() => setEditing(true)}>Edit</button>
          <button
            disabled={comparing}
            title="AI comparison with the most similar earlier workout"
            onClick={async () => {
              setComparing(true);
              try {
                await store.sync().catch(() => {});
                setComparison(await api('/api/v1/insights/compare', { method: 'POST', body: JSON.stringify({ a: id }) }));
              } catch (e) {
                setComparison({ title: 'Comparison unavailable', content: (e as Error).message });
              } finally {
                setComparing(false);
              }
            }}
          >
            {comparing ? 'Comparing…' : 'Compare with previous'}
          </button>
          <button
            onClick={async () => {
              const name = await dialog.prompt({
                title: 'Save as template',
                message: "Reuse this workout's exercises and sets from the Workout page.",
                defaultValue: w.name,
                placeholder: 'Template name',
              });
              if (!name) return;
              store.saveWorkoutAsTemplate(id, name);
              dialog.toast(`Saved template "${name}"`, { text: 'View', onClick: () => navigate('workout') });
            }}
          >
            Save as template
          </button>
          <button
            className="danger"
            onClick={async () => {
              const ok = await dialog.confirm({
                title: 'Delete workout?',
                message: `"${w.name}" and its sets are removed from your history and records.`,
                confirmText: 'Delete',
                destructive: true,
              });
              if (!ok) return;
              navigate('history');
              store.deleteWorkout(id);
              dialog.toast('Workout deleted');
            }}
          >
            Delete
          </button>
        </div>
      </div>
      <p className="muted">
        {formatDate(w.startedAt)} · {formatElapsed(sum.durationSeconds)} · {showVolume(sum.volume, prefs)} {prefs.weightUnit} · {sum.setCount} sets
      </p>
      {w.notes && <p className="notes">{w.notes}</p>}
      {comparison && (
        <Modal title={comparison.title} onClose={() => setComparison(null)}>
          <Markdown text={comparison.content} />
        </Modal>
      )}
      {store.workoutExercises(id).map((we) => {
        const ex = store.get('exercises', we.exerciseId);
        let n = 0;
        return (
          <section key={we.id} className="card">
            <button className="link" onClick={() => navigate(`exercises/${we.exerciseId}`)}>
              <strong>{ex?.name ?? 'Unknown exercise'}</strong>
            </button>
            {we.notes && <p className="muted small">{we.notes}</p>}
            <table className="sets readonly">
              <tbody>
                {store.setsOf(we.id).map((s) => (
                  <tr key={s.id}>
                    <td className={`kind-${s.kind}`}>{s.kind === 'warmup' ? 'W' : s.kind === 'drop' ? 'D' : s.kind === 'failure' ? 'F' : ++n}</td>
                    <td>
                      {s.weight != null && `${showWeight(s.weight, prefs)} ${prefs.weightUnit}`}
                      {s.weight != null && s.reps != null && ' × '}
                      {s.reps != null && `${s.reps}`}
                      {s.distance != null && ` ${(s.distance / (prefs.distanceUnit === 'mi' ? 1609.344 : 1000)).toFixed(2)} ${prefs.distanceUnit}`}
                      {s.duration != null && ` ${formatDuration(s.duration)}`}
                      {s.rpe != null && <span className="muted"> @ RPE {s.rpe}</span>}
                    </td>
                    <td>{prs.get(s.id)?.map((t) => <span key={t} className="pr small">
                          <Icon name="trophy" size={12} /> {t}
                        </span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
