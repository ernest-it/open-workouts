import { useCallback, useEffect, useState } from 'react';
import { api, useStore } from '../state';
import { Markdown } from '../markdown';
import { formatDate } from '../ui';

interface Report {
  id: string;
  kind: 'weekly' | 'report' | 'compare' | 'answer';
  title: string;
  content: string;
  model: string | null;
  createdAt: number;
}
interface Status {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  webhooks: boolean;
}
interface InsightsSettings {
  weeklyReport: boolean;
  weekday: number;
  hour: number;
  days: number;
  webhook: { url: string; format: 'ntfy' | 'discord' | 'json' } | null;
}

const DEFAULTS: InsightsSettings = { weeklyReport: false, weekday: 1, hour: 7, days: 7, webhook: null };
const KIND_LABEL: Record<Report['kind'], string> = { weekly: 'Weekly', report: 'Report', compare: 'Comparison', answer: 'Answer' };

export function InsightsPage() {
  const store = useStore();
  const [status, setStatus] = useState<Status | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [days, setDays] = useState(7);
  const [digest, setDigest] = useState<string | null>(null);
  const settings = { ...DEFAULTS, ...store.getSetting<Partial<InsightsSettings>>('insights', {}) };
  const save = (patch: Partial<InsightsSettings>) => store.setSetting('insights', { ...settings, ...patch });

  const load = useCallback(() => api<Report[]>('/api/v1/insights/reports').then(setReports).catch(() => {}), []);
  useEffect(() => {
    void api<Status>('/api/v1/insights/status').then(setStatus).catch(() => setStatus(null));
    void load();
  }, [load]);

  async function run(label: string, fn: () => Promise<Report>) {
    setBusy(label);
    setError(null);
    try {
      await store.sync().catch(() => {}); // make sure the server has the latest sets
      const r = await fn();
      setOpen(r.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page">
      <h1>Insights</h1>
      {status && !status.enabled && (
        <div className="card">
          <strong>No AI model configured on this server.</strong>
          <p className="muted small">
            Set <code>LLM_PROVIDER</code> to <code>anthropic</code> (Claude) or <code>openai</code> (Ollama or any OpenAI-compatible server). See
            docs/AI_INSIGHTS.md. The data summary below works without one, and you can also connect an AI assistant over MCP.
          </p>
        </div>
      )}

      <section className="card">
        <div className="section-head">
          <h3>Get an update</h3>
          {status?.enabled && (
            <span className="muted small">
              {status.provider} · {status.model}
            </span>
          )}
        </div>
        <div className="row">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={28}>Last 4 weeks</option>
            <option value={90}>Last 3 months</option>
          </select>
          <button
            className="primary"
            disabled={!status?.enabled || !!busy}
            onClick={() => void run('report', () => api<Report>('/api/v1/insights/report', { method: 'POST', body: JSON.stringify({ days }) }))}
          >
            {busy === 'report' ? 'Writing…' : 'Write report'}
          </button>
          <button
            disabled={!!busy}
            onClick={async () => setDigest(digest ? null : await api<string>(`/api/v1/insights/digest?days=${days}`))}
          >
            {digest ? 'Hide data' : 'Show data summary'}
          </button>
        </div>
        <form
          className="row"
          style={{ marginTop: '0.6rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim().length < 3) return;
            void run('ask', () =>
              api<Report>('/api/v1/insights/ask', { method: 'POST', body: JSON.stringify({ question, days: Math.max(days, 28) }) }),
            ).then(() => setQuestion(''));
          }}
        >
          <input
            placeholder="Ask about your training, e.g. “Is my squat still progressing?”"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!status?.enabled}
          />
          <button type="submit" disabled={!status?.enabled || !!busy || question.trim().length < 3}>
            {busy === 'ask' ? 'Thinking…' : 'Ask'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {digest && (
          <div className="digest">
            <Markdown text={digest} />
          </div>
        )}
      </section>

      {reports.map((r) => (
        <section key={r.id} className="card">
          <button className="section-head report-head" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <span>
              <span className="badge">{KIND_LABEL[r.kind]}</span> <strong>{r.title}</strong>
            </span>
            <span className="muted small">{formatDate(r.createdAt)}</span>
          </button>
          {open === r.id && (
            <>
              <Markdown text={r.content} />
              <div className="row between">
                <span className="muted small">{r.model}</span>
                <button
                  className="ghost small danger"
                  onClick={async () => {
                    await api(`/api/v1/insights/reports/${r.id}`, { method: 'DELETE' });
                    void load();
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </section>
      ))}
      {reports.length === 0 && status?.enabled && <p className="muted">No reports yet.</p>}

      <section className="card">
        <h3>Weekly updates</h3>
        <label className="row check-label">
          <input
            type="checkbox"
            checked={settings.weeklyReport}
            onChange={(e) => save({ weeklyReport: e.target.checked })}
            disabled={!status?.enabled}
          />
          Write a report automatically every week
        </label>
        <div className="row">
          <label>
            Day
            <select value={settings.weekday} onChange={(e) => save({ weekday: Number(e.target.value) })}>
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            After (server time)
            <select value={settings.hour} onChange={(e) => save({ hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
        </div>
        {status?.webhooks && (
          <>
            <p className="muted small">
              Optional: push each weekly update to your phone or chat. Works with ntfy (e.g. <code>https://ntfy.sh/your-secret-topic</code>), Discord
              webhooks, or any URL that accepts JSON.
            </p>
            <div className="row">
              <input
                placeholder="Notification URL"
                defaultValue={settings.webhook?.url ?? ''}
                onBlur={(e) => {
                  const url = e.target.value.trim();
                  save({ webhook: url ? { url, format: settings.webhook?.format ?? 'ntfy' } : null });
                }}
              />
              <select
                value={settings.webhook?.format ?? 'ntfy'}
                disabled={!settings.webhook}
                onChange={(e) => settings.webhook && save({ webhook: { ...settings.webhook, format: e.target.value as 'ntfy' } })}
              >
                <option value="ntfy">ntfy</option>
                <option value="discord">Discord</option>
                <option value="json">JSON</option>
              </select>
              <button
                disabled={!settings.webhook}
                onClick={async () => {
                  setError(null);
                  await store.sync().catch(() => {});
                  await api('/api/v1/insights/webhook/test', { method: 'POST' }).catch((e) => setError((e as Error).message));
                }}
              >
                Test
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h3>Use your own AI assistant (MCP)</h3>
        <p className="muted small">
          AI assistants that support the Model Context Protocol (Claude Desktop, Claude Code and others) can read your training log directly. They
          get read-only tools to list and compare workouts, check exercise history and records, and pull summaries. Create an API token in Settings,
          then add this server:
        </p>
        <pre className="code">{`URL:    ${location.origin}/mcp
Header: Authorization: Bearer <your API token>

# Claude Code
claude mcp add --transport http open-workouts ${location.origin}/mcp \\
  --header "Authorization: Bearer <your API token>"`}</pre>
      </section>
    </div>
  );
}
