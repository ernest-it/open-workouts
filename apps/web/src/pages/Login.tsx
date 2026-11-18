import { useEffect, useState } from 'react';
import type { Auth } from '../state';

export function Login({ onLogin }: { onLogin: (a: Auth) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ registrationOpen: boolean; version: string } | null>(null);
  const baseUrl = '';

  useEffect(() => {
    fetch(`${baseUrl}/api/v1/server-info`)
      .then((r) => r.json())
      .then((i) => {
        setInfo(i);
        if (i.registrationOpen) setMode((m) => m);
      })
      .catch(() => setError('Cannot reach the server.'));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`${baseUrl}/api/v1/auth/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password, deviceName: `Web (${navigator.userAgent.split(') ')[0]?.split('(')[1] ?? 'browser'})` }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.issues ? body.issues.map((i: { path: string[]; message: string }) => `${i.path.join('.')}: ${i.message}`).join(', ') : body.error);
      return;
    }
    onLogin({ token: body.token, username: body.user.username, baseUrl });
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h1>Open Workouts</h1>
        <p className="muted">{mode === 'login' ? 'Sign in to your server' : 'Create an account'}</p>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 8 : 1}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        {info?.registrationOpen && (
          <button type="button" className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
          </button>
        )}
        {info && <p className="muted small">Server v{info.version}</p>}
      </form>
    </div>
  );
}
