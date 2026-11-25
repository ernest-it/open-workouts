import { useEffect, useSyncExternalStore } from 'react';
import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';

/**
 * The rest timer lives here rather than in the workout screen so it keeps counting when you
 * switch tabs, lock the phone or the app is killed. When the rest ends with the app in the
 * background, a scheduled local notification buzzes instead.
 */
export interface Rest {
  until: number;
  total: number;
  /** Shown in the notification: what to do next. */
  label: string | null;
}

const KEY = 'ow.rest';
const CHANNEL = 'rest-timer';
const listeners = new Set<() => void>();
let notificationId: string | null = null;
let current: Rest | null = load();

function load(): Rest | null {
  try {
    const raw = Storage.getItemSync(KEY);
    const r = raw ? (JSON.parse(raw) as Rest & { notificationId?: string }) : null;
    if (!r || r.until <= Date.now()) return null;
    notificationId = r.notificationId ?? null;
    return { until: r.until, total: r.total, label: r.label ?? null };
  } catch {
    return null;
  }
}

function save() {
  try {
    if (current) Storage.setItemSync(KEY, JSON.stringify({ ...current, notificationId }));
    else Storage.removeItemSync(KEY);
  } catch {
    /* the timer still works for this session */
  }
  listeners.forEach((l) => l());
}

// In the foreground the app buzzes itself, so the scheduled notification stays silent there.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const rest = n.request.content.data?.kind === 'rest';
    return { shouldShowBanner: !rest, shouldShowList: !rest, shouldPlaySound: false, shouldSetBadge: false };
  },
});

let ready: Promise<boolean> | null = null;
/** Creates the Android channel and asks for permission once; resolves false if refused. */
function ensureReady(): Promise<boolean> {
  ready ??= (async () => {
    try {
      if (Platform.OS === 'android') {
        // Android 13+ only shows the permission prompt once a channel exists.
        await Notifications.setNotificationChannelAsync(CHANNEL, {
          name: 'Rest timer',
          description: 'Tells you when your rest between sets is over',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 300, 150, 300],
          enableVibrate: true,
        });
      }
      const existing = await Notifications.getPermissionsAsync();
      if (existing.granted) return true;
      if (!existing.canAskAgain) return false;
      return (await Notifications.requestPermissionsAsync()).granted;
    } catch {
      return false;
    }
  })();
  return ready;
}

async function schedule() {
  await cancelNotification();
  if (!current) return;
  if (!(await ensureReady())) return;
  const seconds = Math.round((current.until - Date.now()) / 1000);
  if (seconds < 1 || !current) return;
  try {
    notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest over',
        body: current.label ? `Next: ${current.label}` : 'Time for your next set.',
        data: { kind: 'rest' },
        sound: 'default',
      },
      // An alarm-clock alarm: Android (and OEM battery savers) never defer these, unlike the default
      // exact alarm, which some phones push back by minutes. Needs the exact-alarm permission (app.json).
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: current.until, channelId: CHANNEL, delivery: 'alarmClock' },
    });
    save();
  } catch (e) {
    console.warn('Could not schedule the rest notification', e);
  }
}

async function cancelNotification() {
  const id = notificationId;
  notificationId = null;
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

export const restTimer = {
  get: () => current,
  start(seconds: number, label: string | null = null) {
    if (seconds <= 0) return;
    current = { until: Date.now() + seconds * 1000, total: seconds, label };
    save();
    void schedule();
  },
  /** Adds (or with a negative value, removes) seconds; going below zero ends the rest. */
  adjust(seconds: number) {
    if (!current) return;
    const until = current.until + seconds * 1000;
    if (until <= Date.now()) return restTimer.skip();
    current = { ...current, until, total: Math.max(1, current.total + Math.max(0, seconds)) };
    save();
    void schedule();
  },
  skip() {
    current = null;
    save();
    void cancelNotification();
  },
  /** Called every tick while the app is open; buzzes and clears when the rest is over. */
  tick(now = Date.now()) {
    if (!current || now < current.until) return;
    const late = now - current.until > 3000;
    current = null;
    notificationId = null; // it fires (silently, in the foreground) on its own
    save();
    // Already over while the app was in the background: the notification did the buzzing.
    if (late) return;
    Vibration.vibrate([0, 300, 150, 300]);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
};

/** Mount once at the root: keeps the timer ticking whichever screen is open. */
export function useRestWatcher() {
  const rest = useRest();
  useEffect(() => {
    if (!rest) return;
    const t = setInterval(() => restTimer.tick(), 250);
    return () => clearInterval(t);
  }, [rest]);
}

export function useRest(): Rest | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
