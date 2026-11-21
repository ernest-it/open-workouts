import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { normalizeServerUrl, type Account } from '../state';
import { Button, Card, Input, Screen, T, useTheme } from '../ui';

/** First-run screen: start using the app on this phone, or connect a self-hosted server. */
export function ConnectScreen({ onDone }: { onDone: (a: Account) => void }) {
  const t = useTheme();
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ registrationOpen: boolean; version: string } | null>(null);

  async function check() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${normalizeServerUrl(url)}/api/v1/server-info`);
      const body = await res.json();
      if (body.name !== 'open-workouts') throw new Error('That is not an Open Workouts server');
      setInfo(body);
    } catch (e) {
      const msg = (e as Error).message;
      // An http-only server reached over https fails with an opaque TLS error; say what to try.
      const hint = /SSL|TLS|certificate/i.test(msg) ? ' If your server has no HTTPS, start the address with http://' : '';
      setError(`Could not reach ${normalizeServerUrl(url)}: ${msg}.${hint}`);
    } finally {
      setBusy(false);
    }
  }

  async function auth(mode: 'login' | 'register') {
    setError(null);
    setBusy(true);
    try {
      const baseUrl = normalizeServerUrl(url);
      const res = await fetch(`${baseUrl}/api/v1/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, deviceName: `${Platform.OS} app` }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.issues?.map((i: { message: string }) => i.message).join(', ') ?? body.error);
      onDone({ server: { baseUrl, token: body.token, username: body.user.username } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen>
        <View style={{ alignItems: 'center', marginTop: 36, marginBottom: 8 }}>
          <Image source={require('../../assets/icon.png')} style={{ width: 88, height: 88, borderRadius: 22 }} accessibilityIgnoresInvertColors />
          <Text style={{ color: t.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.6, marginTop: 16 }}>Open Workouts</Text>
          <T muted style={{ textAlign: 'center', marginTop: 4, paddingHorizontal: 12 }}>
            Log your lifts, follow your progress, and keep your data. No account needed.
          </T>
        </View>
        {[
          ['barbell-outline', 'Fast logging with rest timer, supersets and PRs'],
          ['trending-up-outline', 'Charts, records and weekly goals'],
          ['lock-closed-outline', 'Everything stays on this phone unless you add a server'],
        ].map(([icon, text]) => (
          <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, paddingHorizontal: 8 }}>
            <Ionicons name={icon as 'barbell-outline'} size={20} color={t.accentText} />
            <T style={{ flex: 1 }}>{text}</T>
          </View>
        ))}
        <Button title="Start on this phone" icon="arrow-forward" variant="primary" style={{ marginTop: 16 }} onPress={() => onDone({ server: null })} />
        <T small muted style={{ textAlign: 'center', marginTop: 6 }}>
          You can connect a server later in Settings, and back up to a file any time.
        </T>
        {!showServer ? (
          <Button title="I have a server" icon="server-outline" variant="ghost" style={{ marginTop: 12 }} onPress={() => setShowServer(true)} />
        ) : (
        <Card style={{ marginTop: 16 }}>
          <T bold>Server address</T>
          <T small muted>
            Self-host the Open Workouts server to sync between devices and use the web app. The phone keeps working offline and syncs when it can reach it.
          </T>
          <Input
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              setInfo(null);
            }}
            placeholder="192.168.1.10:8080 or workouts.example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {!info && <Button title="Connect" variant="primary" onPress={check} disabled={!url.trim() || busy} />}
          {info && (
            <View>
              <T small muted>
                Connected · server v{info.version}
              </T>
              <Input value={username} onChangeText={setUsername} placeholder="Username" autoCapitalize="none" autoCorrect={false} />
              <Input value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
              <Button title="Sign in" variant="primary" onPress={() => auth('login')} disabled={busy || !username || !password} />
              {info.registrationOpen && (
                <Button title="Create account" onPress={() => auth('register')} disabled={busy || !username || password.length < 8} />
              )}
            </View>
          )}
          {busy && <ActivityIndicator style={{ marginTop: 8 }} />}
          {error && (
            <T small style={{ color: t.danger, marginTop: 8 }}>
              {error}
            </T>
          )}
        </Card>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
