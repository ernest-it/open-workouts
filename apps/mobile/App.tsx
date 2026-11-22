import { Activity, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ActivityIndicator, Animated, AppState, BackHandler, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NavContext, type Nav, type Route, type Tab } from './src/nav';
import { initStore, loadAccount, saveAccount, store, usePrefs, useStore, type Account } from './src/state';
import { useStreakReminder } from './src/reminders';
import { KeyboardFocusGuard, useTheme } from './src/ui';
import { ConnectScreen } from './src/screens/Connect';
import { TemplateDetailScreen, WorkoutScreen } from './src/screens/Workout';
import { DialogProvider } from './src/dialog';
import { HistoryScreen, WorkoutDetailScreen } from './src/screens/History';
import { ExerciseDetailScreen, ExercisesScreen } from './src/screens/Exercises';
import { ProfileScreen, SettingsScreen } from './src/screens/Profile';
import { InsightsScreen } from './src/screens/Insights';
import { WorkoutDoneScreen } from './src/screens/WorkoutDone';
import { TemplateEditScreen } from './src/screens/TemplateEdit';
import { LogMeasurementsScreen, MeasurementScreen } from './src/screens/Measurements';
import { useNow } from './src/screens/ActiveWorkout';
import { useRest, useRestWatcher } from './src/rest';
import { formatDuration } from '@open-workouts/shared';

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
      <DialogProvider>
      <ThemedStatusBar />
      <KeyboardFocusGuard />
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
      </DialogProvider>
    </SafeAreaProvider>
  );
}

function ThemedStatusBar() {
  const t = useTheme();
  return <StatusBar style={t.dark ? 'light' : 'dark'} />;
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
        <Text style={{ color: t.accentText, fontSize: 16, fontWeight: '600' }}>Try again</Text>
      </Pressable>
    </Center>
  );
}

type IconName = keyof typeof Ionicons.glyphMap;
// Outline icon when inactive, filled when selected (same convention as iOS and Material).
// Profile (and Settings behind its gear) opens from the avatar in the top-right of each tab.
// Insights needs a server, so local-only mode has three tabs with Train in the middle.
const ALL_TABS: { key: Tab; label: string; icon: IconName; iconOn: IconName }[] = [
  { key: 'history', label: 'History', icon: 'time-outline', iconOn: 'time' },
  { key: 'workout', label: 'Train', icon: 'add-circle-outline', iconOn: 'add-circle' },
  { key: 'exercises', label: 'Exercises', icon: 'barbell-outline', iconOn: 'barbell' },
  { key: 'insights', label: 'Insights', icon: 'sparkles-outline', iconOn: 'sparkles' },
];
/** Back in the app after this long in the background: start again on Train. */
const RESET_AFTER_MS = 60_000;
const ROOTS: Record<Tab, Route[]> = {
  history: [{ name: 'history' }],
  workout: [{ name: 'workout' }],
  exercises: [{ name: 'exercises' }],
  insights: [{ name: 'insights' }],
};

function Main({ account, onSignOut }: { account: Account; onSignOut: () => void }) {
  const t = useTheme();
  const s = useStore();
  useRestWatcher();
  const prefs = usePrefs();
  useStreakReminder(prefs.streakReminders, prefs.weeklyGoal);
  // `selected` moves the highlight at once; `tab` swaps the screen as a low-priority update, so
  // the tap feels instant even when the next screen takes a moment to build.
  const [selected, setSelected] = useState<Tab>('workout');
  const [tab, setTab] = useState<Tab>('workout');
  const [, startTransition] = useTransition();
  // Tabs are mounted on first visit and then kept (hidden), so switching back is instant.
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set(['workout']));
  const [stacks, setStacks] = useState<Record<Tab, Route[]>>(ROOTS);
  const TABS = useMemo(() => ALL_TABS.filter((x) => x.key !== 'insights' || !!account.server), [account.server]);

  // Opening the app again after a while starts fresh on Train, as after a cold launch.
  useEffect(() => {
    let leftAt = 0;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt = Date.now();
      else if (s === 'active' && leftAt && Date.now() - leftAt > RESET_AFTER_MS) {
        leftAt = 0;
        tabRef.current = 'workout';
        setSelected('workout');
        setTab('workout');
        setStacks(ROOTS);
      }
    });
    return () => sub.remove();
  }, []);

  // A ref so that switchTab() followed by push() in the same tick targets the new tab.
  const tabRef = useRef<Tab>(tab);
  const go = useCallback((next: Tab) => {
    tabRef.current = next;
    setSelected(next);
    setVisited((v) => (v.has(next) ? v : new Set([...v, next])));
    startTransition(() => setTab(next));
  }, []);
  const nav: Nav = useMemo(
    () => ({
      push: (r) => {
        nextSlide = 1;
        setStacks((st) => ({ ...st, [tabRef.current]: [...st[tabRef.current], r] }));
      },
      pop: () =>
        setStacks((st) => {
          if (st[tabRef.current].length <= 1) return st;
          nextSlide = -1;
          return { ...st, [tabRef.current]: st[tabRef.current].slice(0, -1) };
        }),
      switchTab: go,
    }),
    [go],
  );

  const depth = stacks[tab].length;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (depth > 1) {
        nav.pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [depth, nav]);

  const active = s.activeWorkout();
  const workoutTop = stacks.workout[stacks.workout.length - 1]!;
  const showMiniBar = !!active && !(tab === 'workout' && workoutTop.name === 'workout');

  return (
    <NavContext.Provider value={nav}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'left', 'right']}>
        {TABS.filter((x) => visited.has(x.key)).map((x) => (
          <Activity key={x.key} mode={x.key === tab ? 'visible' : 'hidden'}>
            <View style={{ flex: 1, display: x.key === tab ? 'flex' : 'none' }}>
              <TabStack stack={stacks[x.key]} account={account} onSignOut={onSignOut} onBack={nav.pop} />
            </View>
          </Activity>
        ))}
      </SafeAreaView>
      {showMiniBar && active && (
        <WorkoutMiniBar
          name={active.name}
          startedAt={active.startedAt}
          onPress={() => {
            setStacks((st) => ({ ...st, workout: ROOTS.workout }));
            go('workout');
          }}
        />
      )}
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.tabBar, { backgroundColor: t.surface, borderColor: t.border }]}>
        {TABS.map((x) => {
          const on = selected === x.key;
          return (
            <Pressable
              key={x.key}
              style={styles.tab}
              onPress={() => {
                // Tapping the current tab again goes back to its first screen.
                if (x.key === tabRef.current) setStacks((st) => ({ ...st, [x.key]: ROOTS[x.key] }));
                else go(x.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={x.label}
            >
              {/* Material-style indicator: the selected icon sits in a tinted pill. */}
              {/* Keyed so it remounts on selection: Android drops the corner radius when only the background changes. */}
              <View key={on ? 'on' : 'off'} style={[styles.tabPill, on && { backgroundColor: t.accentSoft }]}>
                <Ionicons name={on ? x.iconOn : x.icon} size={22} color={on ? t.accentText : t.muted} />
                {x.key === 'workout' && active && (
                  <View accessibilityLabel="Workout in progress" style={[styles.badge, { backgroundColor: t.accent, borderColor: t.surface }]} />
                )}
              </View>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
                style={{ fontSize: 11, marginTop: 2, color: on ? t.text : t.muted, fontWeight: on ? '700' : '500' }}
              >
                {x.label}
              </Text>
            </Pressable>
          );
        })}
      </SafeAreaView>
    </NavContext.Provider>
  );
}

/** One tab's screen stack; only the top screen is rendered. */
function TabStack({ stack, account, onSignOut, onBack }: { stack: Route[]; account: Account; onSignOut: () => void; onBack: () => void }) {
  const t = useTheme();
  const route = stack[stack.length - 1]!;
  return (
    <>
      {stack.length > 1 && route.name !== 'workoutDone' && (
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="chevron-back" size={22} color={t.accentText} style={{ marginLeft: -6 }} />
            <Text style={{ color: t.accentText, fontSize: 16, fontWeight: '600' }}>Back</Text>
          </View>
        </Pressable>
      )}
      <SlideIn key={`${stack.length}:${route.name}:${'id' in route ? route.id : ''}`}>
        {route.name === 'workout' && <WorkoutScreen />}
        {route.name === 'templateDetail' && <TemplateDetailScreen id={route.id} />}
        {route.name === 'templateEdit' && <TemplateEditScreen id={route.id} />}
        {route.name === 'workoutDone' && <WorkoutDoneScreen id={route.id} />}
        {route.name === 'history' && <HistoryScreen />}
        {route.name === 'workoutDetail' && <WorkoutDetailScreen id={route.id} />}
        {route.name === 'exercises' && <ExercisesScreen />}
        {route.name === 'exerciseDetail' && <ExerciseDetailScreen id={route.id} />}
        {route.name === 'profile' && <ProfileScreen account={account} />}
        {route.name === 'measurement' && <MeasurementScreen id={route.id} />}
        {route.name === 'measureLog' && <LogMeasurementsScreen />}
        {route.name === 'insights' && <InsightsScreen account={account} />}
        {route.name === 'settings' && <SettingsScreen account={account} onSignOut={onSignOut} />}
      </SlideIn>
      {stack.length > 1 && route.name !== 'workoutDone' && <EdgeSwipeBack onBack={onBack} />}
    </>
  );
}

// Set by push/pop just before the next screen mounts: pushing slides it in from the right, going
// back from the left. Tab switches and resets leave it at 0 (no animation).
let nextSlide: 1 | -1 | 0 = 0;

/** Slides and fades a screen in when it's pushed or popped to. */
function SlideIn({ children }: { children: ReactNode }) {
  // Decided once, on mount; re-renders must not restart or flip the animation.
  const [from] = useState(() => {
    const dir = nextSlide;
    nextSlide = 0;
    return dir;
  });
  const anim = useRef(new Animated.Value(from ? 0 : 1)).current;
  useEffect(() => {
    if (from) Animated.timing(anim, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim, from]);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
        transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [from * 48, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Drag from the left edge to go back, like iOS and Android's back gesture. */
function EdgeSwipeBack({ onBack }: { onBack: () => void }) {
  const back = useRef(onBack);
  back.current = onBack;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx > 70 || g.vx > 0.6) back.current();
        },
      }),
    [],
  );
  return <View {...pan.panHandlers} style={styles.edge} />;
}

/** Shown above the tab bar while a workout runs and you're elsewhere; tap to go back to it. */
function WorkoutMiniBar({ name, startedAt, onPress }: { name: string; startedAt: number; onPress: () => void }) {
  const t = useTheme();
  const now = useNow();
  const rest = useRest();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${name}`}
      style={({ pressed }) => [styles.miniBar, { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 }]}
    >
      <Ionicons name="barbell" size={18} color={t.onAccent} />
      <Text numberOfLines={1} style={{ flex: 1, color: t.onAccent, fontWeight: '700', fontSize: 15 }}>
        {name}
      </Text>
      <Text style={{ color: t.onAccent, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {rest ? `Rest ${formatDuration(Math.max(0, (rest.until - now) / 1000))}` : formatDuration((now - startedAt) / 1000)}
      </Text>
      <Ionicons name="chevron-up" size={18} color={t.onAccent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 18 },
  back: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 0 },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 6, paddingHorizontal: 2 },
  tabPill: { width: 54, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  miniBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16 },
  badge: { position: 'absolute', top: 2, right: 10, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
});
