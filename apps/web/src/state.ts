import { useSyncExternalStore } from 'react';
import { WorkoutStore, type Snapshot, type StorageAdapter, type WeightUnit, type DistanceUnit } from '@open-workouts/shared';

/** IndexedDB-backed snapshot storage (one record; plenty fast for years of training data). */
class IdbStorage implements StorageAdapter {
  constructor(private key: string) {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('open-workouts', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const r = fn(db.transaction('kv', mode).objectStore('kv'));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async load() {
    try {
      return ((await this.tx('readonly', (s) => s.get(this.key))) as Snapshot | undefined) ?? null;
    } catch {
      return null;
    }
  }
  async save(snap: Snapshot) {
    await this.tx('readwrite', (s) => s.put(snap, this.key));
  }
  async clear() {
    await this.tx('readwrite', (s) => s.delete(this.key));
  }
}

const AUTH_KEY = 'ow.auth';
export interface Auth {
  token: string;
  username: string;
  baseUrl: string;
}

export function loadAuth(): Auth | null {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null') as Auth | null;
  } catch {
    return null;
  }
}

export function saveAuth(a: Auth | null) {
  if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a));
  else localStorage.removeItem(AUTH_KEY);
}

export let store: WorkoutStore;

export async function initStore(auth: Auth) {
  store = new WorkoutStore(new IdbStorage(`snapshot:${auth.username}`));
  await store.init();
  store.server = { baseUrl: auth.baseUrl, token: auth.token };
  void store.sync().catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastPending = store.pendingCount();
  store.subscribe(() => {
    const p = store.pendingCount();
    if (p > 0 && p !== lastPending) {
      clearTimeout(timer);
      timer = setTimeout(() => void store.sync().catch(() => {}), 1500);
    }
    lastPending = p;
  });
  setInterval(() => void store.sync().catch(() => {}), 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void store.sync().catch(() => {});
  });
  window.addEventListener('online', () => void store.sync().catch(() => {}));
  return store;
}

/** Re-render whenever the store changes. */
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

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = loadAuth();
  const res = await fetch(`${auth?.baseUrl ?? ''}${path}`, {
    ...init,
    headers: {
      ...(init.body && typeof init.body === 'string' && !(init.headers as Record<string, string>)?.['content-type']
        ? { 'content-type': 'application/json' }
        : {}),
      ...(auth ? { authorization: `Bearer ${auth.token}` } : {}),
      ...(init.headers as Record<string, string>),
    },
  });
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as T;
}
