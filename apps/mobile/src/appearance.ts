import { useSyncExternalStore } from 'react';
import Storage from 'expo-sqlite/kv-store';
import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from '@open-workouts/shared';

/**
 * Theme choice for this device. Kept outside the synced store so it applies before sign-in
 * (and on the connect screen), and so a phone and a laptop can use different themes.
 */
const KEY = 'ow.appearance';
const listeners = new Set<() => void>();

function load(): Appearance {
  try {
    const raw = Storage.getItemSync(KEY);
    return raw ? parseAppearance(JSON.parse(raw)) : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

let current: Appearance = load();

export function setAppearance(patch: Partial<Appearance>) {
  current = { ...current, ...patch };
  try {
    Storage.setItemSync(KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('Could not save the theme', e);
  }
  listeners.forEach((l) => l());
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
