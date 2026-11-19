import { useMemo, useState } from 'react';
import {
  BODY_PARTS,
  EQUIPMENT,
  LOG_TYPES,
  exerciseHistory,
  exerciseRecords,
  exerciseSeries,
  formatDuration,
  fromKg,
  weightForReps,
  type BodyPart,
  type Equipment,
  type LogType,
} from '@open-workouts/shared';
import { navigate } from '../router';
import { usePrefs, useStore } from '../state';
import { LineChart, Modal, formatDate, label, showWeight } from '../ui';
import { useDialog } from '../dialog';

export function ExercisesPage({ id }: { id?: string }) {
  if (id) return <ExerciseDetail id={id} />;
  return <ExerciseList />;
}

function ExerciseList() {
  const store = useStore();
  const [q, setQ] = useState('');
  const [part, setPart] = useState('');
  const [creating, setCreating] = useState(false);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const we of store.all('workoutExercises')) m.set(we.exerciseId, (m.get(we.exerciseId) ?? 0) + 1);
    return m;
  }, [store.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = store
    .exercises()
    .filter((e) => (!part || e.bodyPart === part) && e.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="page">
      <div className="section-head">
        <h1>Exercises</h1>
        <button className="primary" onClick={() => setCreating(true)}>
          + New
        </button>
      </div>
      <div className="row">
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={part} onChange={(e) => setPart(e.target.value)}>
          <option value="">Any body part</option>
          {BODY_PARTS.map((p) => (
            <option key={p} value={p}>
              {label(p)}
            </option>
          ))}
        </select>
      </div>
      <ul className="list">
        {list.map((e) => (
          <li key={e.id}>
            <button className="list-btn" onClick={() => navigate(`exercises/${e.id}`)}>
              <span>
                <strong>{e.name}</strong>
                {!e.id.startsWith('builtin:') && <span className="badge">custom</span>}
              </span>
              <span className="muted small">
                {label(e.bodyPart)} {counts.get(e.id) ? `· ${counts.get(e.id)}×` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {creating && <ExerciseForm onClose={() => setCreating(false)} />}
    </div>
  );
}

function ExerciseForm({ onClose, id }: { onClose: () => void; id?: string }) {
  const store = useStore();
  const existing = id ? store.get('exercises', id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [logType, setLogType] = useState<LogType>(existing?.logType ?? 'weight_reps');
  const [equipment, setEquipment] = useState<Equipment>(existing?.equipment ?? 'barbell');
  const [bodyPart, setBodyPart] = useState<BodyPart>(existing?.bodyPart ?? 'chest');
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  function save() {
    if (!name.trim()) return;
    const data = { name: name.trim(), logType, equipment, bodyPart, instructions: instructions || null };
    if (existing) store.update('exercises', existing.id, data);
    else navigate(`exercises/${store.insert('exercises', data).id}`);
    onClose();
  }
  return (
    <Modal title={existing ? 'Edit exercise' : 'New exercise'} onClose={onClose}>
      <label>
        Name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Landmine Press (Barbell)" />
      </label>
      <label>
        Type
        <select value={logType} onChange={(e) => setLogType(e.target.value as LogType)}>
          {LOG_TYPES.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Equipment
        <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
          {EQUIPMENT.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Body part
        <select value={bodyPart} onChange={(e) => setBodyPart(e.target.value as BodyPart)}>
          {BODY_PARTS.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Instructions / notes
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </label>
      <button className="primary block" onClick={save}>
        Save
      </button>
    </Modal>
  );
}

function ExerciseDetail({ id }: { id: string }) {
  const store = useStore();
  const dialog = useDialog();
  const prefs = usePrefs();
  const [tab, setTab] = useState<'records' | 'history' | 'charts' | 'about'>('records');
  const [editing, setEditing] = useState(false);
  const ex = store.get('exercises', id);
  const ds = store.dataset;
  const rec = useMemo(() => (ex ? exerciseRecords(ds, ex) : null), [ds, ex]);
  const hist = useMemo(() => exerciseHistory(ds, id), [ds, id]);
  const series = useMemo(() => (ex ? exerciseSeries(ds, ex) : []), [ds, ex]);
  const [metric, setMetric] = useState<'best1RM' | 'maxWeight' | 'volume' | 'maxReps'>('best1RM');
  if (!ex || !rec) return <div className="page">Exercise not found.</div>;
  const custom = !ex.id.startsWith('builtin:');
  const w = (kg?: number) => (kg == null ? '—' : `${showWeight(kg, prefs)} ${prefs.weightUnit}`);
  const isWeighted = ex.logType === 'weight_reps' || ex.logType === 'weighted_bodyweight';

  return (
    <div className="page">
      <button className="ghost" onClick={() => navigate('exercises')}>
        ‹ Exercises
      </button>
      <div className="section-head">
        <h1>{ex.name}</h1>
        {custom && (
          <div className="row">
            <button onClick={() => setEditing(true)}>Edit</button>
            <button
              className="danger"
              onClick={async () => {
                const ok = await dialog.confirm({
                  title: `Delete "${ex.name}"?`,
                  message: 'Past workouts keep their sets, but the exercise shows as "Unknown".',
                  confirmText: 'Delete',
                  destructive: true,
                });
                if (!ok) return;
                navigate('exercises');
                store.remove('exercises', ex.id);
                dialog.toast('Exercise deleted');
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="tabs">
        {(['records', 'history', 'charts', 'about'] as const).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {label(t)}
          </button>
        ))}
      </div>

      {tab === 'records' && (
        <div className="card">
          {isWeighted ? (
            <>
              <dl className="records">
                <dt>Estimated 1RM</dt>
                <dd>{w(rec.estimated1RM?.value)}</dd>
                <dt>Max weight</dt>
                <dd>{w(rec.maxWeight?.value)}</dd>
                <dt>Max volume (set)</dt>
                <dd>{w(rec.maxSetVolume?.value)}</dd>
                <dt>Max volume (session)</dt>
                <dd>{w(rec.maxSessionVolume?.value)}</dd>
              </dl>
              <h3>Rep records</h3>
              <table className="sets readonly">
                <thead>
                  <tr>
                    <th>Reps</th>
                    <th>Best performance</th>
                    <th>Predicted</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((r) => (
                    <tr key={r}>
                      <td>{r}</td>
                      <td>
                        {rec.repMaxes[r] ? (
                          <>
                            {w(rec.repMaxes[r]!.value)} <span className="muted small">{formatDate(rec.repMaxes[r]!.at)}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="muted">{rec.estimated1RM ? w(weightForReps(rec.estimated1RM.value, r)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <dl className="records">
              <dt>Max reps</dt>
              <dd>{rec.maxReps?.value ?? '—'}</dd>
              <dt>Longest duration</dt>
              <dd>{rec.longestDuration ? formatDuration(rec.longestDuration.value) : '—'}</dd>
              <dt>Longest distance</dt>
              <dd>
                {rec.longestDistance
                  ? `${(rec.longestDistance.value / (prefs.distanceUnit === 'mi' ? 1609.344 : 1000)).toFixed(2)} ${prefs.distanceUnit}`
                  : '—'}
              </dd>
            </dl>
          )}
        </div>
      )}

      {tab === 'history' &&
        (hist.length ? (
          hist.map((h) => (
            <button key={h.workoutExercise.id} className="card workout-card" onClick={() => navigate(`history/${h.workout.id}`)}>
              <div className="section-head">
                <strong>{h.workout.name}</strong>
                <span className="muted small">{formatDate(h.workout.startedAt)}</span>
              </div>
              <ol className="plain small">
                {h.sets.map((s) => (
                  <li key={s.id}>
                    {s.kind !== 'normal' && <span className={`kind-${s.kind}`}>{s.kind[0]!.toUpperCase()} </span>}
                    {s.weight != null && `${w(s.weight)} × `}
                    {s.reps ?? ''}
                    {s.duration != null && ` ${formatDuration(s.duration)}`}
                    {s.rpe != null && <span className="muted"> @{s.rpe}</span>}
                  </li>
                ))}
              </ol>
            </button>
          ))
        ) : (
          <p className="muted">No history yet.</p>
        ))}

      {tab === 'charts' && (
        <div className="card">
          <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
            {isWeighted && <option value="best1RM">Best set (est. 1RM)</option>}
            {isWeighted && <option value="maxWeight">Max weight</option>}
            {isWeighted && <option value="volume">Total volume</option>}
            <option value="maxReps">Max reps</option>
          </select>
          <LineChart
            unit={metric === 'maxReps' ? 'reps' : prefs.weightUnit}
            points={series
              .map((p) => ({ x: p.at, y: metric === 'maxReps' ? p[metric] : fromKg(p[metric], prefs.weightUnit) }))
              .filter((p) => p.y > 0)}
          />
        </div>
      )}

      {tab === 'about' && (
        <div className="card">
          <dl className="records">
            <dt>Type</dt>
            <dd>{label(ex.logType)}</dd>
            <dt>Equipment</dt>
            <dd>{label(ex.equipment)}</dd>
            <dt>Body part</dt>
            <dd>{label(ex.bodyPart)}</dd>
          </dl>
          {ex.instructions ? <p className="notes">{ex.instructions}</p> : <p className="muted">No instructions.</p>}
        </div>
      )}
      {editing && <ExerciseForm id={ex.id} onClose={() => setEditing(false)} />}
    </div>
  );
}
