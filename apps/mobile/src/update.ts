// "Update available": the app is installed from GitHub releases, so nothing else tells people a
// new version is out. Checks at most once a day; a dismissed version isn't shown again.

import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';

const RELEASES = 'https://api.github.com/repos/ernest-it/open-workouts/releases/latest';
const CHECK_KEY = 'ow.updateCheck';
const DISMISS_KEY = 'ow.updateDismissed';
const DAY = 86_400_000;

export interface Update {
  version: string;
  url: string;
}

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** True when version `a` is newer than `b` (plain x.y.z). */
export function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

function read<T>(key: string): T | null {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function latest(): Promise<Update | null> {
  const cached = read<{ at: number; update: Update | null }>(CHECK_KEY);
  if (cached && Date.now() - cached.at < DAY) return cached.update;
  const res = await fetch(RELEASES, { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean };
  const update = body.tag_name && body.html_url && !body.draft && !body.prerelease ? { version: body.tag_name.replace(/^v/, ''), url: body.html_url } : null;
  Storage.setItemSync(CHECK_KEY, JSON.stringify({ at: Date.now(), update }));
  return update;
}

/** The newer release, if there is one and it hasn't been dismissed. `enabled: false` skips the check. */
export function useUpdate(enabled: boolean): { update: Update | null; dismiss: () => void } {
  const [update, setUpdate] = useState<Update | null>(null);
  useEffect(() => {
    if (!enabled) return setUpdate(null);
    let live = true;
    latest()
      .then((u) => {
        if (live && u && isNewer(u.version, APP_VERSION) && read<string>(DISMISS_KEY) !== u.version) setUpdate(u);
      })
      .catch(() => {}); // offline or rate-limited: try again another day
    return () => {
      live = false;
    };
  }, [enabled]);
  return {
    update,
    dismiss: () => {
      if (update) Storage.setItemSync(DISMISS_KEY, JSON.stringify(update.version));
      setUpdate(null);
    },
  };
}
