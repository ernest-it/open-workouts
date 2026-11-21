import { useEffect, useState } from 'react';
import { fromKg, looksLikeBackup, parseBackup, toKg } from '@open-workouts/shared';
import { api, loadAuth, usePrefs, useStore, type Prefs } from '../state';
import { useDialog } from '../dialog';
import { AppearanceSection } from '../Appearance';

interface SessionInfo {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number;
  current: boolean;
}

export function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const store = useStore();
  const dialog = useDialog();
  const prefs = usePrefs();
  const setPref = (patch: Partial<Prefs>) => store.setSetting('prefs', { ...prefs, ...patch });
  const [importUnit, setImportUnit] = useState<'kg' | 'lb'>(prefs.weightUnit);
  const [msg, setMsg] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);

  const loadSessions = () => api<SessionInfo[]>('/api/v1/sessions').then(setSessions).catch(() => {});
  useEffect(() => {
    void loadSessions();
  }, []);

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  async function importFile(file: File) {
    setMsg('Importing…');
    try {
      const text = await file.text();
      if (looksLikeBackup(text)) {
        const s = store.restoreBackup(parseBackup(text));
        await store.sync().catch(() => {});
        const changed = s.added + s.restored + s.updated;
        setMsg(
          changed
            ? `Backup restored: ${plural(s.workouts, 'workout')} and ${plural(s.templates, 'template')} (${plural(changed, 'item')} in total).`
            : 'Everything in this backup is already here.',
        );
        return;
      }
      await store.sync().catch(() => {});
      const r = await api<{ workouts: number; sets: number; newExercises: string[]; skippedRows: number; alreadyLogged: number }>(
        `/api/v1/import/strong?weightUnit=${importUnit}&distanceUnit=${prefs.distanceUnit}&tzOffset=${new Date().getTimezoneOffset()}`,
        { method: 'POST', body: text, headers: { 'content-type': 'text/csv' } },
      );
      await store.sync();
      setMsg(
        (r.workouts
          ? `Imported ${plural(r.workouts, 'workout')} and ${plural(r.sets, 'set')}.`
          : r.alreadyLogged
            ? 'Nothing new: every workout in this file is already logged.'
            : 'No workouts found in this file.') +
          (r.workouts && r.alreadyLogged ? ` Skipped ${plural(r.alreadyLogged, 'workout')} you already have.` : '') +
          (r.newExercises.length ? ` Created ${plural(r.newExercises.length, 'custom exercise')}.` : ''),
      );
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  }

  const today = () => new Date().toISOString().slice(0, 10);

  async function download(path: string, filename: string) {
    const auth = loadAuth()!;
    const res = await fetch(path, { headers: { authorization: `Bearer ${auth.token}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="page">
      <h1>Settings</h1>

      <AppearanceSection />

      <section className="card">
        <h3>Units & defaults</h3>
        <label>
          Weight
          <select value={prefs.weightUnit} onChange={(e) => setPref({ weightUnit: e.target.value as Prefs['weightUnit'] })}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </label>
        <label>
          Distance
          <select value={prefs.distanceUnit} onChange={(e) => setPref({ distanceUnit: e.target.value as Prefs['distanceUnit'] })}>
            <option value="km">km</option>
            <option value="mi">mi</option>
          </select>
        </label>
        <label>
          Default rest timer (seconds)
          <input type="number" min={0} step={15} value={prefs.restSeconds} onChange={(e) => setPref({ restSeconds: Number(e.target.value) })} />
        </label>
        <label>
          Bar weight ({prefs.weightUnit})
          <input
            type="number"
            value={+fromKg(prefs.barWeightKg, prefs.weightUnit).toFixed(2)}
            onChange={(e) => setPref({ barWeightKg: toKg(Number(e.target.value), prefs.weightUnit) })}
          />
        </label>
      </section>

      <section className="card">
        <h3>Export</h3>
        <p className="muted small">
          The backup has everything: workouts, templates, measurements and settings. Restore it below, here or in the app. The CSV has your
          workouts in Strong's format, for spreadsheets and other apps.
        </p>
        <div className="row">
          <button className="primary" onClick={() => void download('/api/v1/export/json', `open-workouts-backup-${today()}.json`)}>
            Full backup (.json)
          </button>
          <button
            onClick={() =>
              void download(
                `/api/v1/export/strong.csv?weightUnit=${prefs.weightUnit}&distanceUnit=${prefs.distanceUnit}&tzOffset=${new Date().getTimezoneOffset()}`,
                `open-workouts-${today()}.csv`,
              )
            }
          >
            Workouts (.csv)
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Import</h3>
        <p className="muted small">
          Restore a backup, or import a CSV from Open Workouts or from Strong (in Strong: Settings → Export Strong Data). Workouts you
          already have are skipped, so importing the same file twice is safe.
        </p>
        <label>
          Strong files with no unit in the header are in
          <select value={importUnit} onChange={(e) => setImportUnit(e.target.value as 'kg' | 'lb')}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </label>
        <input
          type="file"
          accept=".csv,text/csv,.json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
        {msg && <p>{msg}</p>}
      </section>

      <section className="card">
        <h3>Sync</h3>
        <p className="muted small">
          {store.pendingCount()} local change(s) waiting · last sync {store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleTimeString() : 'never'}
          {store.lastSyncError && <span className="error"> · {store.lastSyncError}</span>}
        </p>
        <button onClick={() => void store.sync().catch(() => {})}>Sync now</button>
      </section>

      <section className="card">
        <h3>Devices & tokens</h3>
        <ul className="list">
          {sessions.map((s) => (
            <li key={s.id} className="pad row between">
              <span>
                {s.name} {s.current && <span className="badge">this device</span>}
                <br />
                <span className="muted small">last used {new Date(s.lastUsedAt).toLocaleString()}</span>
              </span>
              {!s.current && (
                <button className="ghost small danger" onClick={() => void api(`/api/v1/sessions/${s.id}`, { method: 'DELETE' }).then(loadSessions)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          onClick={async () => {
            const name = await dialog.prompt({
              title: 'Create API token',
              message: 'For scripts and AI assistants (MCP). The token is shown once.',
              placeholder: 'Name, e.g. backup script',
              confirmText: 'Create',
            });
            if (!name) return;
            const r = await api<{ token: string }>('/api/v1/tokens', { method: 'POST', body: JSON.stringify({ name }) });
            setNewToken(r.token);
            void loadSessions();
          }}
        >
          Create API token
        </button>
        {newToken && (
          <p className="small">
            Copy now, it won't be shown again: <code>{newToken}</code>
          </p>
        )}
      </section>

      <section className="card">
        <h3>About & license</h3>
        <p className="muted small">
          Open Workouts is source-available under the{' '}
          <a href="https://polyformproject.org/licenses/noncommercial/1.0.0" target="_blank" rel="noreferrer">
            PolyForm Noncommercial License 1.0.0
          </a>
          : free for non-commercial use, changes and sharing; commercial use needs a separate license. Built with open-source libraries; see the{' '}
          <a href="/third-party-notices.txt" target="_blank" rel="noreferrer">
            third-party notices
          </a>
          .
        </p>
      </section>

      <section className="card">
        <h3>Account</h3>
        <button
          className="danger"
          onClick={async () => {
            await api('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
            await store.reset();
            onLogout();
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
