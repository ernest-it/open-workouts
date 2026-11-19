import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { store as storeRef, useStore, type Account } from '../state';
import { Button, Card, Input, T, formatDate, styles, useTheme } from '../ui';

interface Report {
  id: string;
  kind: 'weekly' | 'report' | 'compare' | 'answer';
  title: string;
  content: string;
  model: string | null;
  createdAt: number;
}

async function call<T>(account: Account, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${account.server!.baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${account.server!.token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

/** Minimal Markdown → native text: headings, bullets and **bold**. */
function MarkdownText({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View>
      {text.split('\n').map((line, i) => {
        const h = line.match(/^#{1,4}\s+(.*)$/);
        const li = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
        const content = (h?.[1] ?? li?.[1] ?? line).split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <Text key={j} style={{ fontWeight: '700' }}>
              {part.slice(2, -2)}
            </Text>
          ) : (
            part
          ),
        );
        if (!line.trim()) return <View key={i} style={{ height: 6 }} />;
        if (/^\s*\|/.test(line)) return null; // tables are shown in the web UI
        return (
          <Text
            key={i}
            style={{ color: t.text, fontSize: h ? 17 : 15, fontWeight: h ? '700' : '400', marginTop: h ? 8 : 2, paddingLeft: li ? 10 : 0, lineHeight: 21 }}
          >
            {li ? '•  ' : ''}
            {content}
          </Text>
        );
      })}
    </View>
  );
}

export function InsightsScreen({ account }: { account: Account }) {
  useStore();
  const t = useTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!account.server) return;
    try {
      const [status, list] = await Promise.all([
        call<{ enabled: boolean }>(account, '/api/v1/insights/status'),
        call<Report[]>(account, '/api/v1/insights/reports'),
      ]);
      setEnabled(status.enabled);
      setReports(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [account]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await storeRef.sync().catch(() => {});
      const r = await call<Report>(account, path, body);
      setOpen(r.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!account.server) {
    return (
      <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.screen}>
        <T bold style={styles.h1}>
          Insights
        </T>
        <T muted>AI insights run on your server. Connect a server in Settings to use them.</T>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
    >
      <T bold style={styles.h1}>
        Insights
      </T>
      {enabled === false && (
        <Card>
          <T bold>No AI model configured on the server</T>
          <T small muted>
            Ask your server admin to set LLM_PROVIDER (Claude or a local model through Ollama). See docs/AI_INSIGHTS.md.
          </T>
        </Card>
      )}
      {enabled !== false && (
      <Card>
        <View style={styles.row}>
          <Button title="This week" variant="primary" small disabled={!enabled || busy} onPress={() => void run('/api/v1/insights/report', { days: 7 })} />
          <Button title="Last 4 weeks" small disabled={!enabled || busy} onPress={() => void run('/api/v1/insights/report', { days: 28 })} />
          {busy && <ActivityIndicator />}
        </View>
        <Input placeholder="Ask about your training…" value={question} onChangeText={setQuestion} editable={!!enabled} />
        <Button
          title="Ask"
          small
          disabled={!enabled || busy || question.trim().length < 3}
          onPress={() => void run('/api/v1/insights/ask', { question }).then(() => setQuestion(''))}
        />
        {error && (
          <T small style={{ color: t.danger }}>
            {error}
          </T>
        )}
      </Card>
      )}
      {reports.map((r) => (
        <Card key={r.id} onPress={() => setOpen(open === r.id ? null : r.id)}>
          <View style={styles.rowBetween}>
            <T bold style={{ flex: 1 }}>
              {r.title}
            </T>
            <T small muted>
              {formatDate(r.createdAt)}
            </T>
          </View>
          {open === r.id ? (
            <MarkdownText text={r.content} />
          ) : (
            <T small muted>
              {r.content.replace(/[#*|]/g, '').trim().slice(0, 140)}…
            </T>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}
