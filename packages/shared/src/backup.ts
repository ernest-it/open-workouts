// Full-fidelity JSON backup of a user's data (every collection, original ids).
//
// The same format is produced by the server (GET /api/v1/export/json), the web
// app and the mobile app, and any of them can read it back. Restoring merges by
// id, so importing the same file twice never creates duplicates.

import { BUILTIN_PREFIX, COLLECTIONS, COLLECTION_NAMES, type ChangeSet, type CollectionName, type RowTypes } from './schema';

export const BACKUP_FORMAT = 'open-workouts-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  data: ChangeSet;
}

export function makeBackup(data: ChangeSet, exportedAt = Date.now()): Backup {
  const out: ChangeSet = {};
  for (const c of COLLECTION_NAMES) {
    (out as Record<string, unknown[]>)[c] = ((data[c] ?? []) as { deletedAt: number | null }[]).filter((r) => !r.deletedAt);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, data: out };
}

/** Cheap check used to route a picked file to the right importer. */
export function looksLikeBackup(text: string): boolean {
  return /^\s*\{/.test(text) && text.includes(`"${BACKUP_FORMAT}"`);
}

export interface ParsedBackup {
  exportedAt: number;
  changes: ChangeSet;
  /** Rows that failed validation and were left out. */
  invalid: number;
}

export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  const b = json as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.format !== BACKUP_FORMAT || typeof b.data !== 'object' || !b.data) {
    throw new Error('Not an Open Workouts backup file.');
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of Open Workouts. Update the app and try again.');
  }
  const changes: ChangeSet = {};
  let invalid = 0;
  for (const c of COLLECTION_NAMES) {
    const rows = (b.data as Record<string, unknown>)[c];
    if (!Array.isArray(rows)) continue;
    const ok: unknown[] = [];
    for (const raw of rows) {
      const p = COLLECTIONS[c].safeParse(raw);
      if (!p.success || (p.data as { id: string }).id.startsWith(BUILTIN_PREFIX)) invalid++;
      else ok.push(p.data);
    }
    (changes as Record<string, unknown[]>)[c] = ok;
  }
  return { exportedAt: typeof b.exportedAt === 'number' ? b.exportedAt : 0, changes, invalid };
}

export interface RestoreSummary {
  /** Rows that didn't exist yet. */
  added: number;
  /** Rows that had been deleted here and were brought back. */
  restored: number;
  /** Rows where the backup had a newer edit than this device. */
  updated: number;
  /** Rows already present with the same or a newer edit (left alone). */
  unchanged: number;
  workouts: number;
  templates: number;
}

/**
 * Decides which backup rows to apply on top of `current` (the rows this device
 * has, including deleted ones). Local rows that are as new or newer win, so a
 * backup never undoes later edits; rows that were deleted come back, since that
 * is what restoring a backup is for. Restored rows get `updatedAt = now` so the
 * restore also wins on the server at the next sync.
 */
export function planRestore(
  backup: ChangeSet,
  current: <K extends CollectionName>(c: K, id: string) => RowTypes[K] | undefined,
  now = Date.now(),
): { changes: ChangeSet; summary: RestoreSummary } {
  const changes: ChangeSet = {};
  const summary: RestoreSummary = { added: 0, restored: 0, updated: 0, unchanged: 0, workouts: 0, templates: 0 };
  for (const c of COLLECTION_NAMES) {
    const out: unknown[] = [];
    for (const row of (backup[c] ?? []) as RowTypes[typeof c][]) {
      const cur = current(c, row.id);
      let apply: RowTypes[typeof c] | null = null;
      if (!cur) {
        apply = { ...row, deletedAt: null };
        summary.added++;
      } else if (cur.deletedAt) {
        apply = { ...row, deletedAt: null, updatedAt: Math.max(now, cur.updatedAt + 1) };
        summary.restored++;
      } else if (row.updatedAt > cur.updatedAt) {
        apply = { ...row, deletedAt: null };
        summary.updated++;
      } else summary.unchanged++;
      if (apply) {
        out.push(apply);
        if (c === 'workouts') summary.workouts++;
        if (c === 'templates') summary.templates++;
      }
    }
    if (out.length) (changes as Record<string, unknown[]>)[c] = out;
  }
  return { changes, summary };
}
