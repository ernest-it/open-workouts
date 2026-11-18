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

  useEffect(() => {
    if (!account) return;
    setReady(false);
    void initStore(account).then(() => setReady(true));
  }, [account]);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {account === undefined || (account && !ready) ? (
        <Center>
          <ActivityIndicator />
        </Center>
      ) : account === null ? (
        <SafeAreaView style={{ flex: 1 }}>
          <ConnectScreen
            onDone={(a) => {
              void saveAccount(a);
              setAccount(a);
            }}
          />
        </SafeAreaView>
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

const TABS: { key: Tab; label: string; icon: string }[] = [
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
          <Pressable onPress={pop} style={styles.back} accessibilityRole="button">
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
            <Text style={{ fontSize: 20 }}>{x.icon}</Text>
            <Text style={{ fontSize: 11, color: tab === x.key ? t.accent : t.muted, fontWeight: tab === x.key ? '700' : '400' }}>
              {x.label}
              {x.key === 'workout' && s.activeWorkout() ? ' •' : ''}
            </Text>
          </Pressable>
        ))}
      </SafeAreaView>
    </NavContext.Provider>
  );
}

const styles = StyleSheet.create({
  back: { paddingHorizontal: 16, paddingTop: 8 },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6 },
});
