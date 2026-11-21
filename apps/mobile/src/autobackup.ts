// Automatic daily backups to the app's own storage, so local-only data survives a bad import or
// an accidental delete. They're lost if the app is uninstalled: a file saved elsewhere (Settings →
// Save full backup) is still the real backup.

import { Directory, File, Paths } from 'expo-file-system';
import type { WorkoutStore } from '@open-workouts/shared';

const KEEP = 7;
const PREFIX = 'auto-';

const folder = () => new Directory(Paths.document, 'backups');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface AutoBackup {
  file: File;
  /** Local date the backup was made, YYYY-MM-DD. */
  date: string;
}

/** Saved automatic backups, newest first. */
export function listAutoBackups(): AutoBackup[] {
  try {
    const dir = folder();
    if (!dir.exists) return [];
    return dir
      .list()
      .filter((f): f is File => f instanceof File && f.name.startsWith(PREFIX) && f.name.endsWith('.json'))
      .map((file) => ({ file, date: file.name.slice(PREFIX.length, -'.json'.length) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

/** Writes today's backup if there isn't one yet (or always, with `force`), then prunes old ones. */
export async function autoBackup(store: WorkoutStore, force = false): Promise<boolean> {
  try {
    // Nothing worth backing up on a fresh install.
    if (!store.all('workouts').length && !store.all('templates').length && !store.all('measurements').length) return false;
    const dir = folder();
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `${PREFIX}${today()}.json`);
    if (file.exists && !force) return false;
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(store.backup()));
    for (const old of listAutoBackups().slice(KEEP)) old.file.delete();
    return true;
  } catch (e) {
    console.warn('Automatic backup failed', e);
    return false;
  }
}
