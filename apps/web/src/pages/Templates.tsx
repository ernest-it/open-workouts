import { useState } from 'react';
import type { Template } from '@open-workouts/shared';
import { useStore } from '../state';
import { ExercisePicker, Modal } from '../ui';

export function Templates() {
  const store = useStore();
  const [editing, setEditing] = useState<Template | null>(null);
  const folders = store.all('templateFolders').sort((a, b) => a.position - b.position);
  const templates = store.all('templates').sort((a, b) => a.position - b.position);
  const groups: { id: string | null; name: string }[] = [{ id: null, name: 'My Templates' }, ...folders];

  function newTemplate(folderId: string | null) {
    const name = prompt('Template name');
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
            onClick={() => {
              const name = prompt('Folder name');
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
                    onClick={() => {
                      if (!confirm(`Delete folder "${g.name}"? Templates move to My Templates.`)) return;
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
                  <div key={t.id} className="card template-card">
                    <div className="section-head">
                      <strong>{t.name}</strong>
                      <button className="ghost small" onClick={() => setEditing(t)}>
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
                    <button className="primary block" onClick={() => store.startWorkout({ templateId: t.id })} disabled={!!store.activeWorkout()}>
                      Start
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {editing && <TemplateEditor template={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateEditor({ template, onClose }: { template: Template; onClose: () => void }) {
  const store = useStore();
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
        onClick={() => {
          if (confirm(`Delete template "${t.name}"?`)) {
            store.deleteTemplate(t.id);
            onClose();
          }
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
