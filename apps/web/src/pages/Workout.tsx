import { useEffect, useMemo, useState } from 'react';
import {
  calculatePlates,
  formatDuration,
  fromKg,
  previousSets,
  toKg,
  warmupSets,
  type Exercise,
  type SetKind,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@open-workouts/shared';
import { navigate } from '../router';
import { usePrefs, useStore, type Prefs } from '../state';
import { ExercisePicker, Modal, showWeight, weightLabel } from '../ui';
import { useDialog } from '../dialog';
import { Templates } from './Templates';

export function WorkoutPage() {
  const store = useStore();
  const active = store.activeWorkout();
  if (!active) {
    return (
      <div className="page">
        <h1>Start Workout</h1>
        <button className="primary block" onClick={() => store.startWorkout()}>
          Start an empty workout
        </button>
        <Templates />
      </div>
    );
  }
  return <ActiveWorkout workout={active} />;
}

function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export function ActiveWorkout({ workout, editing = false }: { workout: Workout; editing?: boolean }) {
  const store = useStore();
  const prefs = usePrefs();
  const now = useNow();
  const dialog = useDialog();
  const [picking, setPicking] = useState(false);
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const wexs = store.workoutExercises(workout.id);

  useEffect(() => {
    if (rest && now >= rest.until) {
      setRest(null);
      try {
        navigator.vibrate?.([200, 100, 200]);
        new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=').play().catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }, [now, rest]);

  const startRest = (seconds: number) => {
    if (seconds > 0) setRest({ until: Date.now() + seconds * 1000, total: seconds });
  };

  async function finish() {
    const sets = store.all('sets').filter((s) => s.workoutId === workout.id);
    const done = sets.filter((s) => s.completed).length;
    if (!done) {
      const discard = await dialog.confirm({
        title: 'Nothing logged yet',
        message: 'Tick ✓ next to each set you finish. A workout with no completed sets is not saved.',
        cancelText: 'Keep logging',
        confirmText: 'Discard workout',
        destructive: true,
      });
      if (discard) store.deleteWorkout(workout.id);
      return;
    }
    const incomplete = sets.length - done;
    if (
      incomplete &&
      !(await dialog.confirm({
        title: 'Finish workout?',
        message: `${incomplete} unticked set${incomplete === 1 ? '' : 's'} will be left out.`,
        cancelText: 'Keep logging',
        confirmText: 'Finish',
      }))
    )
      return;
    store.finishWorkout(workout.id);
    navigate(`history/${workout.id}`);
  }

  async function cancel() {
    const ok = await dialog.confirm({
      title: 'Discard workout?',
      message: 'Everything logged in this workout is deleted. This cannot be undone.',
      cancelText: 'Keep',
      confirmText: 'Discard',
      destructive: true,
    });
    if (ok) store.deleteWorkout(workout.id);
  }

  return (
    <div className="page workout">
      <div className="workout-head">
        <input
          className="title-input"
          value={workout.name}
          onChange={(e) => store.update('workouts', workout.id, { name: e.target.value })}
          aria-label="Workout name"
        />
        {!editing && (
          <div className="row">
            <span className="timer">{formatDuration((now - workout.startedAt) / 1000)}</span>
            <button className="success" onClick={finish}>
              Finish
            </button>
          </div>
        )}
      </div>
      <textarea
        placeholder="Workout notes"
        value={workout.notes ?? ''}
        onChange={(e) => store.update('workouts', workout.id, { notes: e.target.value || null })}
      />

      {wexs.map((we) => (
        <ExerciseBlock key={we.id} we={we} workout={workout} prefs={prefs} onSetCompleted={startRest} editing={editing} />
      ))}

      <button className="block" onClick={() => setPicking(true)}>
        + Add exercise
      </button>
      {!editing && (
        <button className="danger ghost block" onClick={cancel}>
          Cancel workout
        </button>
      )}

      {rest && (
        <div className="rest-bar">
          <div className="rest-progress" style={{ width: `${((rest.until - now) / (rest.total * 1000)) * 100}%` }} />
          <span>Rest {formatDuration(Math.max(0, (rest.until - now) / 1000))}</span>
          <button onClick={() => setRest({ ...rest, until: rest.until - 15_000 })}>-15s</button>
          <button onClick={() => setRest({ ...rest, until: rest.until + 15_000, total: rest.total + 15 })}>+15s</button>
          <button onClick={() => setRest(null)}>Skip</button>
        </div>
      )}

      {picking && (
        <ExercisePicker
          exercises={store.exercises()}
          onClose={() => setPicking(false)}
          onPick={(e) => {
            store.addExerciseToWorkout(workout.id, e.id);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

const KIND_LABEL: Record<SetKind, string> = { normal: '', warmup: 'W', drop: 'D', failure: 'F' };
const NEXT_KIND: Record<SetKind, SetKind> = { normal: 'warmup', warmup: 'drop', drop: 'failure', failure: 'normal' };

function ExerciseBlock({
  we,
  workout,
  prefs,
  onSetCompleted,
  editing,
}: {
  we: WorkoutExercise;
  workout: Workout;
  prefs: Prefs;
  onSetCompleted: (seconds: number) => void;
  editing: boolean;
}) {
  const store = useStore();
  const dialog = useDialog();
  const ex = store.get('exercises', we.exerciseId);
  const sets = store.setsOf(we.id);
  const prev = useMemo(
    () => previousSets(store.dataset, we.exerciseId, workout.startedAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.version, we.exerciseId, workout.startedAt],
  );
  const [tool, setTool] = useState<'plates' | 'warmup' | null>(null);
  if (!ex) return null;
  const lt = ex.logType;
  const pinned = store.pinnedNote(ex.id);
  const editPinned = async () => {
    const v = await dialog.prompt({
      title: pinned ? 'Edit pinned note' : 'Pin a note',
      message: `Shows on ${ex.name} every time you do it. Good for seat settings, grip or cues.`,
      defaultValue: pinned ?? '',
      placeholder: 'e.g. Seat on 4, pause at the bottom',
      allowEmpty: !!pinned,
    });
    if (v != null) store.setPinnedNote(ex.id, v || null);
  };
  const showWeightCol = lt === 'weight_reps' || lt === 'weighted_bodyweight' || lt === 'assisted_bodyweight';
  const showReps = lt !== 'duration' && lt !== 'distance_duration';
  const showDistance = lt === 'distance_duration';
  const showDuration = lt === 'duration' || lt === 'distance_duration';
  let normalIndex = 0;

  const prevText = (i: number) => {
    const p = prev.filter((s) => s.kind !== 'warmup')[i];
    if (!p) return '—';
    if (showWeightCol) return `${showWeight(p.weight, prefs)} × ${p.reps ?? 0}`;
    if (showDistance) return `${((p.distance ?? 0) / (prefs.distanceUnit === 'mi' ? 1609.344 : 1000)).toFixed(2)} ${prefs.distanceUnit} · ${formatDuration(p.duration)}`;
    if (showDuration) return formatDuration(p.duration);
    return `${p.reps ?? 0}`;
  };

  return (
    <section className="exercise-block">
      <div className="exercise-head">
        <button className="link" onClick={() => navigate(`exercises/${ex.id}`)}>
          {ex.name}
        </button>
        <div className="row">
          {lt === 'weight_reps' && (ex.equipment === 'barbell' || ex.equipment === 'smith_machine') && (
            <>
              <button className="ghost small" onClick={() => setTool('warmup')} title="Warm-up calculator">
                Warm-up
              </button>
              <button className="ghost small" onClick={() => setTool('plates')} title="Plate calculator">
                Plates
              </button>
            </>
          )}
          {!pinned && (
            <button className="ghost small" onClick={() => void editPinned()} title="Pin a note that shows every time you do this exercise">
              Pin note
            </button>
          )}
          <button
            className="ghost small danger"
            onClick={async () => {
              const logged = store.setsOf(we.id).filter((s) => s.completed).length;
              if (
                logged &&
                !(await dialog.confirm({
                  title: `Remove ${ex.name}?`,
                  message: `${logged} completed set${logged === 1 ? '' : 's'} will be deleted.`,
                  confirmText: 'Remove',
                  destructive: true,
                }))
              )
                return;
              store.removeWorkoutExercise(we.id);
            }}
            title="Remove exercise"
          >
            ✕
          </button>
        </div>
      </div>
      {pinned && (
        <button className="pinned-note" onClick={() => void editPinned()} title="Pinned note: shows every time you do this exercise. Click to edit.">
          <span aria-hidden>📌</span> {pinned}
        </button>
      )}
      <input
        className="note-input"
        placeholder="Note for this workout (shows in History)"
        aria-label={`Note for ${ex.name} in this workout`}
        value={we.notes ?? ''}
        onChange={(e) => store.update('workoutExercises', we.id, { notes: e.target.value || null })}
      />
      <table className="sets">
        <thead>
          <tr>
            <th>Set</th>
            <th>Previous</th>
            {showWeightCol && <th>{weightLabel(lt, prefs)}</th>}
            {showDistance && <th>{prefs.distanceUnit}</th>}
            {showDuration && <th>Time</th>}
            {showReps && <th>Reps</th>}
            <th className="rpe-col">RPE</th>
            <th aria-label="Completed">✓</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s) => {
            const idx = s.kind === 'warmup' ? -1 : normalIndex++;
            return (
              <SetRow
                key={s.id}
                s={s}
                label={KIND_LABEL[s.kind] || String(idx + 1)}
                prev={idx >= 0 ? prevText(idx) : '—'}
                prefs={prefs}
                cols={{ showWeightCol, showReps, showDistance, showDuration }}
                onComplete={() => onSetCompleted(we.restSeconds ?? prefs.restSeconds)}
                editing={editing}
              />
            );
          })}
        </tbody>
      </table>
      <div className="row">
        <button className="ghost block" onClick={() => store.addSet(we.id)}>
          + Add set
        </button>
        <label className="small muted rest-input">
          Rest
          <input
            type="number"
            min={0}
            step={15}
            value={we.restSeconds ?? prefs.restSeconds}
            onChange={(e) => store.update('workoutExercises', we.id, { restSeconds: Number(e.target.value) || 0 })}
          />
          s
        </label>
      </div>
      {tool === 'plates' && <PlateTool prefs={prefs} initialKg={sets.find((s) => !s.completed)?.weight ?? sets[0]?.weight ?? 60} onClose={() => setTool(null)} />}
      {tool === 'warmup' && <WarmupTool prefs={prefs} we={we} ex={ex} sets={sets} onClose={() => setTool(null)} />}
    </section>
  );
}

function SetRow({
  s,
  label,
  prev,
  prefs,
  cols,
  onComplete,
  editing,
}: {
  s: WorkoutSet;
  label: string;
  prev: string;
  prefs: Prefs;
  cols: { showWeightCol: boolean; showReps: boolean; showDistance: boolean; showDuration: boolean };
  onComplete: () => void;
  editing: boolean;
}) {
  const store = useStore();
  const dialog = useDialog();
  const up = (patch: Partial<WorkoutSet>) => store.update('sets', s.id, patch);
  const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));
  const distFactor = prefs.distanceUnit === 'mi' ? 1609.344 : 1000;
  return (
    <tr className={s.completed ? 'done' : ''}>
      <td>
        <button
          className={`kind kind-${s.kind}`}
          onClick={() => up({ kind: NEXT_KIND[s.kind] })}
          onContextMenu={(e) => {
            e.preventDefault();
            // Delete straight away; Undo puts it back.
            const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...copy } = s;
            store.remove('sets', s.id);
            dialog.toast('Set deleted', { text: 'Undo', onClick: () => store.insert('sets', copy) });
          }}
          title="Click: change set type · Right-click: delete"
        >
          {label}
        </button>
      </td>
      <td className="muted prev">{prev}</td>
      {cols.showWeightCol && (
        <td>
          <NumInput
            value={s.weight == null ? null : +fromKg(s.weight, prefs.weightUnit).toFixed(2)}
            onChange={(v) => up({ weight: v == null ? null : toKg(v, prefs.weightUnit) })}
            step={prefs.weightUnit === 'kg' ? 2.5 : 5}
          />
        </td>
      )}
      {cols.showDistance && (
        <td>
          <NumInput
            value={s.distance == null ? null : +(s.distance / distFactor).toFixed(3)}
            onChange={(v) => up({ distance: v == null ? null : v * distFactor })}
            step={0.1}
          />
        </td>
      )}
      {cols.showDuration && (
        <td>
          <input
            className="num"
            placeholder="m:ss"
            defaultValue={s.duration != null ? formatDuration(s.duration) : ''}
            onBlur={(e) => {
              const parts = e.target.value.split(':').map(Number);
              const secs = parts.reduce((a, p) => a * 60 + (p || 0), 0);
              up({ duration: e.target.value.trim() ? secs : null });
            }}
          />
        </td>
      )}
      {cols.showReps && (
        <td>
          <NumInput value={s.reps} onChange={(v) => up({ reps: v == null ? null : Math.round(v) })} step={1} />
        </td>
      )}
      <td>
        <select className="rpe" value={s.rpe ?? ''} onChange={(e) => up({ rpe: numOrNull(e.target.value) })}>
          <option value="">–</option>
          {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button
          className={`check ${s.completed ? 'on' : ''}`}
          aria-pressed={s.completed}
          onClick={() => {
            up({ completed: !s.completed });
            if (!s.completed && !editing) onComplete();
          }}
        >
          ✓
        </button>
      </td>
    </tr>
  );
}

function NumInput({ value, onChange, step }: { value: number | null; onChange: (v: number | null) => void; step: number }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => setText(value == null ? '' : String(value)), [value]);
  return (
    <input
      className="num"
      inputMode="decimal"
      value={text}
      step={step}
      onChange={(e) => {
        setText(e.target.value);
        const v = e.target.value.replace(',', '.');
        if (v.trim() === '') onChange(null);
        else if (!Number.isNaN(Number(v))) onChange(Number(v));
      }}
    />
  );
}

function PlateTool({ prefs, initialKg, onClose }: { prefs: Prefs; initialKg: number; onClose: () => void }) {
  const [target, setTarget] = useState(+fromKg(initialKg, prefs.weightUnit).toFixed(2));
  const bar = +fromKg(prefs.barWeightKg, prefs.weightUnit).toFixed(2);
  const plates = prefs.weightUnit === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
  const r = calculatePlates(target, bar, plates);
  return (
    <Modal title="Plate calculator" onClose={onClose}>
      <label>
        Target ({prefs.weightUnit})
        <input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
      </label>
      <p className="muted">
        Bar: {bar} {prefs.weightUnit}
      </p>
      <div className="plates">
        {r.perSide.length ? r.perSide.map((p, i) => <span key={i} className="plate" style={{ height: 30 + p * 1.6 }}>{p}</span>) : <span className="muted">Just the bar</span>}
      </div>
      <p>Per side: {r.perSide.join(' + ') || '—'}</p>
      {r.remainder > 0 && (
        <p className="error">
          Closest achievable: {r.achieved} {prefs.weightUnit} ({r.remainder} short)
        </p>
      )}
    </Modal>
  );
}

function WarmupTool({ prefs, we, ex, sets, onClose }: { prefs: Prefs; we: WorkoutExercise; ex: Exercise; sets: WorkoutSet[]; onClose: () => void }) {
  const store = useStore();
  const firstWorking = sets.find((s) => s.kind !== 'warmup' && s.weight);
  const [work, setWork] = useState(firstWorking?.weight ?? 60);
  const inc = prefs.weightUnit === 'kg' ? 2.5 : toKg(5, 'lb');
  const steps = warmupSets(work, ex.equipment === 'barbell' ? prefs.barWeightKg : inc, inc * 2);
  function add() {
    // insert warm-ups before existing sets
    const shift = steps.length;
    for (const s of sets) store.update('sets', s.id, { position: s.position + shift });
    steps.forEach((st, i) =>
      store.insert('sets', {
        workoutId: we.workoutId,
        workoutExerciseId: we.id,
        position: i,
        kind: 'warmup',
        weight: st.weight,
        reps: st.reps,
        distance: null,
        duration: null,
        rpe: null,
        completed: false,
      }),
    );
    onClose();
  }
  return (
    <Modal title="Warm-up calculator" onClose={onClose}>
      <label>
        Working weight ({prefs.weightUnit})
        <input type="number" value={+fromKg(work, prefs.weightUnit).toFixed(2)} onChange={(e) => setWork(toKg(Number(e.target.value), prefs.weightUnit))} />
      </label>
      <ul className="list">
        {steps.map((s, i) => (
          <li key={i} className="pad">
            {showWeight(s.weight, prefs)} {prefs.weightUnit} × {s.reps}
          </li>
        ))}
      </ul>
      <button className="primary block" onClick={add} disabled={!steps.length}>
        Add {steps.length} warm-up sets
      </button>
    </Modal>
  );
}
