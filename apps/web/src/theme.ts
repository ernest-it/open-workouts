import { useSyncExternalStore } from 'react';
import { DEFAULT_APPEARANCE, buildTheme, parseAppearance, type Appearance, type ThemeColors } from '@open-workouts/shared';

/** Theme choice for this browser (not synced, so a phone and a laptop can differ). */
const KEY = 'ow.appearance';
const listeners = new Set<() => void>();
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function load(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseAppearance(JSON.parse(raw)) : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

let current = load();

const VARS: [keyof ThemeColors, string][] = [
  ['bg', '--bg'],
  ['surface', '--surface'],
  ['surface2', '--surface-2'],
  ['text', '--text'],
  ['muted', '--muted'],
  ['border', '--border'],
  ['accent', '--accent'],
  ['onAccent', '--on-accent'],
  ['accentText', '--accent-text'],
  ['accentSoft', '--accent-soft'],
  ['success', '--success'],
  ['danger', '--danger'],
  ['warn', '--warn'],
  ['doneRow', '--done-row'],
];

/** Writes the theme into CSS variables on <html>. Call once before the first render. */
export function applyTheme() {
  const t = buildTheme(current, media?.matches ?? false);
  const root = document.documentElement;
  for (const [k, v] of VARS) root.style.setProperty(v, String(t[k]));
  root.style.colorScheme = t.dark ? 'dark' : 'light';
  root.dataset.theme = t.mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
}

media?.addEventListener('change', () => {
  if (current.mode === 'system') applyTheme();
});

export function setAppearance(patch: Partial<Appearance>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: the theme still applies for this visit */
  }
  applyTheme();
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
