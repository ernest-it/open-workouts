import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavContext, type Nav, type Route, type Tab } from './src/nav';
import { initStore, loadAccount, saveAccount, store, useStore, type Account } from './src/state';
import { useTheme } from './src/ui';
import { ConnectScreen } from './src/screens/Connect';
import { WorkoutScreen } from './src/screens/Workout';
import { HistoryScreen, WorkoutDetailScreen } from './src/screens/History';
import { ExerciseDetailScreen, ExercisesScreen } from './src/screens/Exercises';
import { ProfileScreen, SettingsScreen } from './src/screens/Profile';
import { InsightsScreen } from './src/screens/Insights';

export default function App() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadAccount().then(setAccount);
  }, []);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!account) return;
    setReady(false);
    setLoadError(null);
    initStore(account)
      .then(() => setReady(true))
      .catch((e: Error) => setLoadError(e.message || String(e)));
  }, [account, attempt]);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {loadError ? (
        <LoadError message={loadError} onRetry={() => setAttempt((n) => n + 1)} />
      ) : account === undefined || (account && !ready) ? (
        <Center>
          <ActivityIndicator />
        </Center>
      ) : account === null ? (
        <ThemedSafeArea>
          <ConnectScreen
            onDone={(a) => {
              void saveAccount(a);
              setAccount(a);
            }}
          />
        </ThemedSafeArea>
      ) : (
        <Main
          account={account}
          onSignOut={async () => {
            if (account.server) {
              await fetch(`${account.server.baseUrl}/api/v1/auth/logout`, {
                method: 'POST',
                headers: { authorization: `Bearer ${account.server.token}` },
              }).catch(() => {});
              await store.reset();
            }
            await saveAccount(null);
            setAccount(null);
          }}
        />
      )}
    </SafeAreaProvider>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>{children}</View>;
}

/** Paints the status bar / home indicator areas in the theme background (no white/black bands). */
function ThemedSafeArea({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>{children}</SafeAreaView>;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTheme();
  return (
    <Center>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>Could not open your data</Text>
      <Text style={{ color: t.muted, textAlign: 'center', marginHorizontal: 24, marginBottom: 16 }}>{message}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={{ padding: 12 }}>
        <Text style={{ color: t.accent, fontSize: 16, fontWeight: '600' }}>Try again</Text>
      </Pressable>
    </Center>
  );
}

const TABS:{ key: Tab; label: string; icon: string }[] = [
  { key: 'profile', label: 'Profile', icon: '👤' },
  { key: 'history', label: 'History', icon: '🕘' },
  { key: 'workout', label: 'Workout', icon: '➕' },
  { key: 'exercises', label: 'Exercises', icon: '🏋️' },
  { key: 'insights', label: 'Insights', icon: '✨' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
];

function Main({ account, onSignOut }: { account: Account; onSignOut: () => void }) {
  const t = useTheme();
  const s = useStore();
  const [tab, setTab] = useState<Tab>('workout');
  const [stacks, setStacks] = useState<Record<Tab, Route[]>>({
    profile: [{ name: 'profile' }],
    history: [{ name: 'history' }],
    workout: [{ name: 'workout' }],
    exercises: [{ name: 'exercises' }],
    insights: [{ name: 'insights' }],
    settings: [{ name: 'settings' }],
  });
  const stack = stacks[tab];
  const route = stack[stack.length - 1]!;

  const pop = useCallback(() => {
    setStacks((st) => (st[tab].length > 1 ? { ...st, [tab]: st[tab].slice(0, -1) } : st));
  }, [tab]);

  // A ref so that switchTab() followed by push() in the same tick targets the new tab.
  const tabRef = useRef<Tab>(tab);
  tabRef.current = tab;
  const nav: Nav = useMemo(
    () => ({
      push: (r) => setStacks((st) => ({ ...st, [tabRef.current]: [...st[tabRef.current], r] })),
      pop,
      switchTab: (next) => {
        tabRef.current = next;
        setTab(next);
      },
    }),
    [pop],
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  return (
    <NavContext.Provider value={nav}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'left', 'right']}>
        {stack.length > 1 && (
          <Pressable onPress={pop} style={styles.back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
            <Text style={{ color: t.accent, fontSize: 16 }}>‹ Back</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          {route.name === 'workout' && <WorkoutScreen />}
          {route.name === 'history' && <HistoryScreen />}
          {route.name === 'workoutDetail' && <WorkoutDetailScreen id={route.id} />}
          {route.name === 'exercises' && <ExercisesScreen />}
          {route.name === 'exerciseDetail' && <ExerciseDetailScreen id={route.id} />}
          {route.name === 'profile' && <ProfileScreen account={account} />}
          {route.name === 'insights' && <InsightsScreen account={account} />}
          {route.name === 'settings' && <SettingsScreen account={account} onSignOut={onSignOut} />}
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={[styles.tabBar, { backgroundColor: t.surface, borderColor: t.border }]}>
        {TABS.map((x) => (
          <Pressable
            key={x.key}
            style={styles.tab}
            onPress={() => {
              if (x.key === tab) setStacks((st) => ({ ...st, [tab]: st[tab].slice(0, 1) }));
              setTab(x.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === x.key }}
          >
            <View>
              <Text style={{ fontSize: 20, opacity: tab === x.key ? 1 : 0.75 }} maxFontSizeMultiplier={1.3}>
                {x.icon}
              </Text>
              {x.key === 'workout' && s.activeWorkout() && (
                <View accessibilityLabel="Workout in progress" style={[styles.badge, { backgroundColor: t.success, borderColor: t.surface }]} />
              )}
            </View>
            {/* Six tabs share the width: keep labels on one line on 320pt phones / large text. */}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.2}
              style={{ fontSize: 11, color: tab === x.key ? t.accent : t.muted, fontWeight: tab === x.key ? '700' : '400' }}
            >
              {x.label}
            </Text>
          </Pressable>
        ))}
      </SafeAreaView>
    </NavContext.Provider>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8 },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 2 },
  badge: { position: 'absolute', top: 0, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
});
