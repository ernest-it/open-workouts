import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import {
  WorkoutStore,
  type DistanceUnit,
  type Snapshot,
  type StorageAdapter,
  type WeightUnit,
} from '@open-workouts/shared';

/** Snapshot persisted in on-device SQLite (no size limit, unlike AsyncStorage on Android). */
class SqliteKvStorage implements StorageAdapter {
  constructor(private key: string) {}
  async load() {
    const raw = await Storage.getItemAsync(this.key);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  }
  async save(s: Snapshot) {
    await Storage.setItemAsync(this.key, JSON.stringify(s));
  }
  async clear() {
    await Storage.removeItemAsync(this.key);
  }
}

/** Where the data lives. `server: null` = local-only mode (no account needed). */
export interface Account {
  server: { baseUrl: string; token: string; username: string } | null;
}

const ACCOUNT_KEY = 'ow.account';

export async function loadAccount(): Promise<Account | null> {
  const raw = await SecureStore.getItemAsync(ACCOUNT_KEY);
  return raw ? (JSON.parse(raw) as Account) : null;
}

export async function saveAccount(a: Account | null) {
  if (a) await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify(a));
  else await SecureStore.deleteItemAsync(ACCOUNT_KEY);
}

export let store: WorkoutStore;
let cleanup: (() => void) | null = null;

export async function initStore(account: Account) {
  cleanup?.();
  const key = account.server ? `snapshot:${account.server.username}@${account.server.baseUrl}` : 'snapshot:local';
  store = new WorkoutStore(new SqliteKvStorage(key));
  await store.init();
  if (!account.server) return store;
  store.server = { baseUrl: account.server.baseUrl, token: account.server.token };
  const trySync = () => void store.sync().catch(() => {});
  trySync();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastPending = store.pendingCount();
  const unsub = store.subscribe(() => {
    const p = store.pendingCount();
    if (p > 0 && p !== lastPending) {
      clearTimeout(timer);
      timer = setTimeout(trySync, 2000);
    }
    lastPending = p;
  });
  const interval = setInterval(trySync, 60_000);
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') trySync();
    if (s === 'background') void store.persist();
  });
  cleanup = () => {
    unsub();
    clearInterval(interval);
    clearTimeout(timer);
    appState.remove();
  };
  return store;
}

export function useStore(): WorkoutStore {
  useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.version,
  );
  return store;
}

export interface Prefs {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  restSeconds: number;
  barWeightKg: number;
}
export const DEFAULT_PREFS: Prefs = { weightUnit: 'kg', distanceUnit: 'km', restSeconds: 120, barWeightKg: 20 };

export function usePrefs(): Prefs {
  const s = useStore();
  return { ...DEFAULT_PREFS, ...s.getSetting<Partial<Prefs>>('prefs', {}) };
}

export function normalizeServerUrl(input: string): string {
  let u = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) {
    // No scheme typed: LAN addresses (IPs, localhost, mDNS/home names) are almost always plain
    // HTTP; public domains are expected to be behind HTTPS.
    const host = u.split(/[/:]/)[0]!.toLowerCase();
    const local = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === 'localhost' || /\.(local|lan|home|internal|home\.arpa)$/.test(host) || !host.includes('.');
    u = `${local ? 'http' : 'https'}://${u}`;
  }
  return u;
}
