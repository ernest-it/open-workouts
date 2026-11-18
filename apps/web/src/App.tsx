import { useEffect, useState } from 'react';
import { navigate, useRoute } from './router';
import { initStore, loadAuth, saveAuth, useStore, type Auth } from './state';
import { Login } from './pages/Login';
import { WorkoutPage } from './pages/Workout';
import { HistoryPage } from './pages/History';
import { ExercisesPage } from './pages/Exercises';
import { MeasurementsPage, ProfilePage } from './pages/Profile';
import { SettingsPage } from './pages/Settings';
import { InsightsPage } from './pages/Insights';

const TABS = [
  ['profile', 'Profile', '👤'],
  ['history', 'History', '🕘'],
  ['workout', 'Workout', '＋'],
  ['exercises', 'Exercises', '🏋'],
  ['measure', 'Measure', '📏'],
  ['insights', 'Insights', '✨'],
  ['settings', 'Settings', '⚙'],
] as const;

export function App() {
  const [auth, setAuth] = useState<Auth | null>(loadAuth);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!auth) return;
    setReady(false);
    void initStore(auth).then(() => setReady(true));
  }, [auth]);

  if (!auth)
    return (
      <Login
        onLogin={(a) => {
          saveAuth(a);
          setAuth(a);
          navigate('workout');
        }}
      />
    );
  if (!ready) return <div className="page muted">Loading…</div>;
  return (
    <Shell
      auth={auth}
      onLogout={() => {
        saveAuth(null);
        setAuth(null);
      }}
    />
  );
}

function Shell({ auth, onLogout }: { auth: Auth; onLogout: () => void }) {
  const store = useStore();
  const [section = 'workout', id] = useRoute();
  const active = store.activeWorkout();
  return (
    <div className="app">
      <nav className="tabs-nav">
        <span className="brand">Open Workouts</span>
        {TABS.map(([key, name, icon]) => (
          <a key={key} href={`#/${key}`} className={section === key ? 'on' : ''}>
            <span className="icon">{icon}</span>
            <span className="tab-name">{name}</span>
            {key === 'workout' && active && <span className="dot-live" />}
          </a>
        ))}
        <span className={`sync-state ${store.lastSyncError ? 'error' : ''}`} title={store.lastSyncError ?? 'Synced'}>
          {store.lastSyncError ? 'offline' : store.pendingCount() ? 'syncing…' : 'synced'}
        </span>
      </nav>
      <main>
        {section === 'profile' && <ProfilePage username={auth.username} />}
        {section === 'history' && <HistoryPage id={id} />}
        {section === 'workout' && <WorkoutPage />}
        {section === 'exercises' && <ExercisesPage id={id} />}
        {section === 'measure' && <MeasurementsPage />}
        {section === 'insights' && <InsightsPage />}
        {section === 'settings' && <SettingsPage onLogout={onLogout} />}
      </main>
    </div>
  );
}
