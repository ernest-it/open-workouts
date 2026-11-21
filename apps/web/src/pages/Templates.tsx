import { useState } from 'react';
import { formatDuration, templateLastDone, type Template, type TemplateSet } from '@open-workouts/shared';
import { navigate } from '../router';
import { usePrefs, useStore } from '../state';
import { ExercisePicker, Modal, formatDate, showWeight } from '../ui';
import { useDialog } from '../dialog';

export function Templates() {
  const store = useStore();
  const dialog = useDialog();
  const [editing, setEditing] = useState<Template | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const folders = store.all('templateFolders').sort((a, b) => a.position - b.position);
  const templates = store.all('templates').sort((a, b) => a.position - b.position);
  const groups: { id: string | null; name: string }[] = [{ id: null, name: 'My Templates' }, ...folders];

  async function newTemplate(folderId: string | null) {
    const name = await dialog.prompt({ title: 'New template', placeholder: 'Template name, e.g. Push Day', confirmText: 'Create' });
    if (!name) return;
    setEditing(store.insert('templates', { name, folderId, notes: null, position: templates.length }));
  }

  return (
    <div>
      <div className="section-head">
        <h2>Templates</h2>
        <div className="row">
          <button
            className="ghost small"
            onClick={async () => {
              const name = await dialog.prompt({ title: 'New folder', placeholder: 'Folder name', confirmText: 'Create' });
              if (name) store.insert('templateFolders', { name, position: folders.length });
            }}
          >
            + Folder
          </button>
          <button className="ghost small" onClick={() => newTemplate(null)}>
            + Template
          </button>
        </div>
      </div>
      {groups.map((g) => {
        const list = templates.filter((t) => t.folderId === g.id);
        return (
          <div key={g.id ?? 'root'}>
            <div className="section-head">
              <h3>
                {g.name} <span className="muted">({list.length})</span>
              </h3>
              {g.id && (
                <div className="row">
                  <button className="ghost small" onClick={() => newTemplate(g.id)}>
                    + Template
                  </button>
                  <button
                    className="ghost small danger"
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        title: `Delete folder "${g.name}"?`,
                        message: 'Its templates move to My Templates.',
                        confirmText: 'Delete folder',
                        destructive: true,
                      });
                      if (!ok) return;
                      for (const t of list) store.update('templates', t.id, { folderId: null });
                      store.remove('templateFolders', g.id!);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
            <div className="grid">
              {list.map((t) => {
                const tes = store.all('templateExercises').filter((x) => x.templateId === t.id).sort((a, b) => a.position - b.position);
                return (
                  <div
                    key={t.id}
                    className="card template-card"
                    role="button"
                    tabIndex={0}
                    aria-label={`${t.name}: show template`}
                    onClick={() => setPreviewing(t.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                      e.preventDefault();
                      setPreviewing(t.id);
                    }}
                  >
                    <div className="section-head">
                      <strong>{t.name}</strong>
                      <button
                        className="ghost small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(t);
                        }}
                      >
                        Edit
                      </button>
                    </div>
                    <ul className="muted small plain">
                      {tes.slice(0, 6).map((te) => {
                        const n = store.all('templateSets').filter((s) => s.templateExerciseId === te.id).length;
                        return (
                          <li key={te.id}>
                            {n} × {store.get('exercises', te.exerciseId)?.name ?? 'Unknown'}
                          </li>
                        );
                      })}
                      {tes.length > 6 && <li>+{tes.length - 6} more</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {previewing && (
        <TemplatePreview
          id={previewing}
          onClose={() => setPreviewing(null)}
          onEdit={() => {
            const t = store.get('templates', previewing);
            setPreviewing(null);
            if (t) setEditing(t);
          }}
        />
      )}
      {editing && <TemplateEditor template={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const KIND_LABEL = { normal: '', warmup: 'W', drop: 'D', failure: 'F' } as const;

/** The whole template at a glance; the workout is started from here, not straight from the card. */
function TemplatePreview({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: () => void }) {
  const store = useStore();
  const prefs = usePrefs();
  const t = store.get('templates', id);
  if (!t) return null;
  const tes = store
    .all('templateExercises')
    .filter((x) => x.templateId === id)
    .sort((a, b) => a.position - b.position);
  const setsOf = (teId: string) =>
    store
      .all('templateSets')
      .filter((s) => s.templateExerciseId === teId)
      .sort((a, b) => a.position - b.position);
  const total = tes.reduce((n, te) => n + setsOf(te.id).length, 0);
  const lastAt = templateLastDone({ ...store.dataset, templates: store.all('templates') }).get(id) ?? 0;
  const last = lastAt ? { startedAt: lastAt } : undefined;
  const active = store.activeWorkout();
  const dist = prefs.distanceUnit === 'mi' ? 1609.344 : 1000;
  const describe = (s: TemplateSet) => {
    const parts: string[] = [];
    if (s.weight != null) parts.push(`${showWeight(s.weight, prefs)} ${prefs.weightUnit}`);
    if (s.reps != null) parts.push(s.weight != null ? String(s.reps) : `${s.reps} reps`);
    let out = parts.join(' × ');
    if (s.distance != null) out += `${out ? ' · ' : ''}${+(s.distance / dist).toFixed(2)} ${prefs.distanceUnit}`;
    if (s.duration != null) out += `${out ? ' · ' : ''}${formatDuration(s.duration)}`;
    return out || '—';
  };
  return (
    <Modal title={t.name} onClose={onClose}>
      <p className="muted">
        {[
          `${tes.length} exercise${tes.length === 1 ? '' : 's'}`,
          `${total} set${total === 1 ? '' : 's'}`,
          last ? `last done ${formatDate(last.startedAt)}` : 'not done yet',
        ].join(' · ')}
      </p>
      {t.notes && <p className="notes">{t.notes}</p>}
      {tes.length === 0 && <p className="muted">No exercises yet. Use Edit to add some.</p>}
      {tes.map((te) => {
        let n = 0;
        return (
          <div key={te.id} className="tpl-ex">
            <div className="section-head">
              <strong>{store.get('exercises', te.exerciseId)?.name ?? 'Unknown'}</strong>
              {te.restSeconds ? <span className="muted small">Rest {formatDuration(te.restSeconds)}</span> : null}
            </div>
            {te.notes && <div className="muted small">{te.notes}</div>}
            <ul className="tpl-sets">
              {setsOf(te.id).map((s) => (
                <li key={s.id}>
                  <span className={`kind-label kind-${s.kind}`}>{KIND_LABEL[s.kind] || ++n}</span>
                  <span>{describe(s)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {active && <p className="muted small">Finish or cancel your current workout before starting another.</p>}
      <div className="dialog-actions">
        <button onClick={onEdit}>Edit</button>
        <button
          className="primary"
          disabled={!!active}
          autoFocus
          onClick={() => {
            store.startWorkout({ templateId: id });
            onClose();
            navigate('workout');
          }}
        >
          Start workout
        </button>
      </div>
    </Modal>
  );
}

function TemplateEditor({ template, onClose }: { template: Template; onClose: () => void }) {
  const store = useStore();
  const dialog = useDialog();
  const t = store.get('templates', template.id);
  const [picking, setPicking] = useState(false);
  if (!t) return null;
  const tes = store.all('templateExercises').filter((x) => x.templateId === t.id).sort((a, b) => a.position - b.position);
  const folders = store.all('templateFolders');
  return (
    <Modal title="Edit template" onClose={onClose}>
      <label>
        Name
        <input value={t.name} onChange={(e) => store.update('templates', t.id, { name: e.target.value })} />
      </label>
      <label>
        Folder
        <select value={t.folderId ?? ''} onChange={(e) => store.update('templates', t.id, { folderId: e.target.value || null })}>
          <option value="">My Templates</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <ul className="list">
        {tes.map((te, i) => {
          const sets = store.all('templateSets').filter((s) => s.templateExerciseId === te.id).sort((a, b) => a.position - b.position);
          return (
            <li key={te.id} className="pad row between">
              <span>{store.get('exercises', te.exerciseId)?.name}</span>
              <span className="row">
                <button
                  className="ghost small"
                  onClick={() => {
                    const last = sets[sets.length - 1];
                    store.insert('templateSets', {
                      templateId: t.id,
                      templateExerciseId: te.id,
                      position: (last?.position ?? -1) + 1,
                      kind: 'normal',
                      weight: last?.weight ?? null,
                      reps: last?.reps ?? null,
                      distance: null,
                      duration: null,
                    });
                  }}
                >
                  {sets.length} sets +
                </button>
                <button
                  className="ghost small"
                  disabled={!sets.length}
                  onClick={() => store.remove('templateSets', sets[sets.length - 1]!.id)}
                >
                  −
                </button>
                <button className="ghost small" disabled={i === 0} onClick={() => swap(i, i - 1)}>
                  ↑
                </button>
                <button
                  className="ghost small danger"
                  onClick={() => {
                    sets.forEach((s) => store.remove('templateSets', s.id));
                    store.remove('templateExercises', te.id);
                  }}
                >
                  ✕
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <button className="block" onClick={() => setPicking(true)}>
        + Add exercise
      </button>
      <button
        className="danger ghost block"
        onClick={async () => {
          const ok = await dialog.confirm({
            title: `Delete template "${t.name}"?`,
            message: 'Past workouts started from it are kept.',
            confirmText: 'Delete',
            destructive: true,
          });
          if (!ok) return;
          store.deleteTemplate(t.id);
          onClose();
          dialog.toast('Template deleted');
        }}
      >
        Delete template
      </button>
      {picking && (
        <ExercisePicker
          exercises={store.exercises()}
          onClose={() => setPicking(false)}
          onPick={(e) => {
            const te = store.insert('templateExercises', {
              templateId: t.id,
              exerciseId: e.id,
              position: tes.length,
              supersetId: null,
              notes: null,
              restSeconds: null,
            });
            for (let i = 0; i < 3; i++)
              store.insert('templateSets', {
                templateId: t.id,
                templateExerciseId: te.id,
                position: i,
                kind: 'normal',
                weight: null,
                reps: null,
                distance: null,
                duration: null,
              });
            setPicking(false);
          }}
        />
      )}
    </Modal>
  );

  function swap(a: number, b: number) {
    const x = tes[a]!;
    const y = tes[b]!;
    store.update('templateExercises', x.id, { position: y.position });
    store.update('templateExercises', y.id, { position: x.position });
  }
}
