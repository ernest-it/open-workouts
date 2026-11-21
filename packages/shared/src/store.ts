// Offline-first client store shared by the web UI and the mobile app.
//
// * All rows are held in memory and persisted through a StorageAdapter
//   (IndexedDB/localStorage on web, SQLite/AsyncStorage on mobile).
// * Every local mutation bumps `updatedAt` and marks the row as pending.
// * `sync()` pushes pending rows and pulls everything newer than the last
//   server revision. The server resolves conflicts with last-write-wins.

import { makeBackup, planRestore, type Backup, type ParsedBackup, type RestoreSummary } from './backup';
import { BUILTIN_EXERCISES } from './exercises';
import {
  BUILTIN_PREFIX,
  COLLECTION_NAMES,
  type ChangeSet,
  type CollectionName,
  type Exercise,
  type RowTypes,
  type SyncResponse,
  type Template,
  type TemplateExercise,
  type TemplateSet,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from './schema';
import { previousSets, type Dataset } from './stats';

export interface Snapshot {
  rev: number;
  rows: { [K in CollectionName]?: RowTypes[K][] };
  pending: { [K in CollectionName]?: string[] };
}

export interface StorageAdapter {
  load(): Promise<Snapshot | null>;
  save(snapshot: Snapshot): Promise<void>;
  clear?(): Promise<void>;
}

export class MemoryStorage implements StorageAdapter {
  data: Snapshot | null = null;
  async load() {
    return this.data ? structuredClone(this.data) : null;
  }
  async save(s: Snapshot) {
    this.data = structuredClone(s);
  }
  async clear() {
    this.data = null;
  }
}

export interface ServerConfig {
  baseUrl: string; // e.g. https://workouts.example.com
  token: string;
}

type Maps = { [K in CollectionName]: Map<string, RowTypes[K]> };
type Editable<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** Settings key prefix for pinned exercise notes (`pin:<exerciseId>`). */
export const PINNED_NOTE_PREFIX = 'pin:';

export function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class WorkoutStore {
  private maps: Maps = Object.fromEntries(COLLECTION_NAMES.map((c) => [c, new Map()])) as unknown as Maps;
  private pending: { [K in CollectionName]: Set<string> } = Object.fromEntries(
    COLLECTION_NAMES.map((c) => [c, new Set<string>()]),
  ) as unknown as { [K in CollectionName]: Set<string> };
  private listeners = new Set<() => void>();
  private cachedDataset: Dataset | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private syncing: Promise<SyncResponse | null> | null = null;
  rev = 0;
  version = 0;
  server: ServerConfig | null = null;
  lastSyncError: string | null = null;
  lastSyncAt: number | null = null;

  constructor(
    private storage: StorageAdapter,
    private opts: { now?: () => number; fetch?: typeof fetch } = {},
  ) {}

  private now() {
    return this.opts.now?.() ?? Date.now();
  }

  async init() {
    const snap = await this.storage.load();
    if (snap) {
      this.rev = snap.rev;
      for (const c of COLLECTION_NAMES) {
        for (const r of snap.rows[c] ?? []) (this.maps[c] as Map<string, unknown>).set(r.id, r);
        for (const id of snap.pending[c] ?? []) this.pending[c].add(id);
      }
    }
    this.emit(false);
  }

  // ---- subscription -------------------------------------------------------
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(persist = true) {
    this.version++;
    this.cachedDataset = null;
    for (const l of this.listeners) l();
    if (persist) this.schedulePersist();
  }

  private schedulePersist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.persist(), 200);
  }

  async persist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const snap: Snapshot = { rev: this.rev, rows: {}, pending: {} };
    for (const c of COLLECTION_NAMES) {
      (snap.rows as Record<string, unknown[]>)[c] = [...this.maps[c].values()];
      snap.pending[c] = [...this.pending[c]];
    }
    await this.storage.save(snap);
  }

  async reset() {
    for (const c of COLLECTION_NAMES) {
      this.maps[c].clear();
      this.pending[c].clear();
    }
    this.rev = 0;
    await this.storage.clear?.();
    this.emit();
  }

  // ---- generic access -----------------------------------------------------
  all<K extends CollectionName>(c: K, includeDeleted = false): RowTypes[K][] {
    const rows = [...this.maps[c].values()] as RowTypes[K][];
    return includeDeleted ? rows : rows.filter((r) => !r.deletedAt);
  }

  get<K extends CollectionName>(c: K, id: string): RowTypes[K] | undefined {
    if (c === 'exercises' && id.startsWith(BUILTIN_PREFIX)) {
      return BUILTIN_EXERCISES.find((e) => e.id === id) as RowTypes[K] | undefined;
    }
    const r = this.maps[c].get(id) as RowTypes[K] | undefined;
    return r && !r.deletedAt ? r : undefined;
  }

  pendingCount(): number {
    return COLLECTION_NAMES.reduce((a, c) => a + this.pending[c].size, 0);
  }

  insert<K extends CollectionName>(c: K, data: Editable<RowTypes[K]> & { id?: string }): RowTypes[K] {
    const t = this.now();
    const row = { ...data, id: data.id ?? randomId(), createdAt: t, updatedAt: t, deletedAt: null } as RowTypes[K];
    this.put(c, row);
    return row;
  }

  update<K extends CollectionName>(c: K, id: string, patch: Partial<Editable<RowTypes[K]>>): RowTypes[K] | undefined {
    const cur = this.maps[c].get(id) as RowTypes[K] | undefined;
    if (!cur) return undefined;
    const row = { ...cur, ...patch, updatedAt: Math.max(this.now(), cur.updatedAt + 1) } as RowTypes[K];
    this.put(c, row);
    return row;
  }

  remove(c: CollectionName, id: string) {
    const cur = this.maps[c].get(id);
    if (!cur || cur.deletedAt) return;
    const t = Math.max(this.now(), cur.updatedAt + 1);
    this.put(c, { ...cur, deletedAt: t, updatedAt: t } as never);
  }

  private put<K extends CollectionName>(c: K, row: RowTypes[K]) {
    (this.maps[c] as Map<string, RowTypes[K]>).set(row.id, row);
    this.pending[c].add(row.id);
    this.emit();
  }

  /** Apply rows from the server or an import without marking them pending. */
  applyRemote(changes: ChangeSet, markPending = false) {
    for (const c of COLLECTION_NAMES) {
      for (const r of (changes[c] ?? []) as RowTypes[typeof c][]) {
        const cur = this.maps[c].get(r.id);
        // A newer local edit made while the request was in flight wins locally;
        // it is still pending and will be pushed next sync.
        if (cur && this.pending[c].has(r.id) && cur.updatedAt > r.updatedAt) continue;
        (this.maps[c] as Map<string, unknown>).set(r.id, r);
        if (markPending) this.pending[c].add(r.id);
      }
    }
    this.emit();
  }

  // ---- backup ---------------------------------------------------------------
  /** Everything this device holds, in the backup format (see backup.ts). */
  backup(): Backup {
    const data: ChangeSet = {};
    for (const c of COLLECTION_NAMES) (data as Record<string, unknown[]>)[c] = this.all(c);
    return makeBackup(data, this.now());
  }

  /** Merges a parsed backup into the store. The changes are pushed on the next sync. */
  restoreBackup(backup: ParsedBackup): RestoreSummary {
    const active = this.activeWorkout();
    const plan = planRestore(backup.changes, (c, id) => this.maps[c].get(id) as never, this.now());
    // Never bring back a second in-progress workout next to the current one.
    if (active && plan.changes.workouts) {
      const extra = plan.changes.workouts.filter((w) => w.endedAt == null && w.id !== active.id);
      if (extra.length) {
        plan.changes.workouts = plan.changes.workouts.filter((w) => !extra.includes(w));
        plan.summary.workouts -= extra.length;
      }
    }
    this.applyRemote(plan.changes, true);
    return plan.summary;
  }

  get dataset(): Dataset {
    if (!this.cachedDataset) {
      this.cachedDataset = {
        exercises: [...BUILTIN_EXERCISES, ...this.all('exercises')],
        workouts: this.all('workouts'),
        workoutExercises: this.all('workoutExercises'),
        sets: this.all('sets'),
      };
    }
    return this.cachedDataset;
  }

  // ---- sync ---------------------------------------------------------------
  sync(): Promise<SyncResponse | null> {
    if (!this.server) return Promise.resolve(null);
    if (!this.syncing) {
      this.syncing = this.doSync().finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  }

  private async doSync(): Promise<SyncResponse | null> {
    const server = this.server!;
    const pushed: { c: CollectionName; id: string; updatedAt: number }[] = [];
    const changes: ChangeSet = {};
    for (const c of COLLECTION_NAMES) {
      const rows: unknown[] = [];
      for (const id of this.pending[c]) {
        const r = this.maps[c].get(id);
        if (!r) continue;
        rows.push(r);
        pushed.push({ c, id, updatedAt: r.updatedAt });
      }
      if (rows.length) (changes as Record<string, unknown[]>)[c] = rows;
    }
    const f = this.opts.fetch ?? fetch;
    const url = `${server.baseUrl.replace(/\/$/, '')}/api/v1/sync`;
    try {
      let body: SyncResponse & { more?: boolean };
      let first = true;
      do {
        const res = await f(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${server.token}` },
          body: JSON.stringify({ since: this.rev, changes: first ? changes : {} }),
        });
        if (!res.ok) throw new Error(res.status === 401 ? 'Not signed in (HTTP 401)' : `Sync failed: HTTP ${res.status}`);
        body = (await res.json()) as SyncResponse & { more?: boolean };
        if (first) {
          // Clear pending flags for rows that were not edited again meanwhile.
          for (const p of pushed) {
            const cur = this.maps[p.c].get(p.id);
            if (cur && cur.updatedAt === p.updatedAt) this.pending[p.c].delete(p.id);
          }
          first = false;
        }
        this.applyRemote(body.changes);
        this.rev = body.rev;
      } while (body.more);
      this.lastSyncError = null;
      this.lastSyncAt = this.now();
      this.emit();
      await this.persist();
      return body;
    } catch (e) {
      this.lastSyncError = e instanceof Error ? e.message : String(e);
      this.emit(false);
      throw e;
    }
  }

  // ---- domain actions -----------------------------------------------------
  exercises(): Exercise[] {
    return this.dataset.exercises.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  activeWorkout(): Workout | undefined {
    return this.all('workouts')
      .filter((w) => w.endedAt == null)
      .sort((a, b) => b.startedAt - a.startedAt)[0];
  }

  workoutExercises(workoutId: string): WorkoutExercise[] {
    return this.all('workoutExercises')
      .filter((x) => x.workoutId === workoutId)
      .sort((a, b) => a.position - b.position);
  }

  setsOf(workoutExerciseId: string): WorkoutSet[] {
    return this.all('sets')
      .filter((s) => s.workoutExerciseId === workoutExerciseId)
      .sort((a, b) => a.position - b.position);
  }

  startWorkout(opts: { name?: string; templateId?: string } = {}): Workout {
    const t = opts.templateId ? this.get('templates', opts.templateId) : undefined;
    const hour = new Date(this.now()).getHours();
    const defaultName =
      hour < 5 ? 'Night Workout' : hour < 12 ? 'Morning Workout' : hour < 17 ? 'Afternoon Workout' : 'Evening Workout';
    const w = this.insert('workouts', {
      name: opts.name ?? t?.name ?? defaultName,
      startedAt: this.now(),
      endedAt: null,
      notes: null,
      templateId: t?.id ?? null,
    });
    if (t) {
      const tes = this.all('templateExercises')
        .filter((x) => x.templateId === t.id)
        .sort((a, b) => a.position - b.position);
      const supersetMap = new Map<string, string>();
      for (const te of tes) {
        const we = this.insert('workoutExercises', {
          workoutId: w.id,
          exerciseId: te.exerciseId,
          position: te.position,
          supersetId: te.supersetId
            ? (supersetMap.get(te.supersetId) ?? supersetMap.set(te.supersetId, randomId()).get(te.supersetId)!)
            : null,
          notes: te.notes,
          restSeconds: te.restSeconds,
        });
        const tsets = this.all('templateSets')
          .filter((s) => s.templateExerciseId === te.id)
          .sort((a, b) => a.position - b.position);
        for (const ts of tsets) {
          this.insert('sets', {
            workoutId: w.id,
            workoutExerciseId: we.id,
            position: ts.position,
            kind: ts.kind,
            weight: ts.weight,
            reps: ts.reps,
            distance: ts.distance,
            duration: ts.duration,
            rpe: null,
            completed: false,
          });
        }
      }
    }
    return w;
  }

  addExerciseToWorkout(workoutId: string, exerciseId: string, initialSets = 1): WorkoutExercise {
    const position = this.workoutExercises(workoutId).length;
    const we = this.insert('workoutExercises', {
      workoutId,
      exerciseId,
      position,
      supersetId: null,
      notes: null,
      restSeconds: null,
    });
    const w = this.get('workouts', workoutId);
    const prev = previousSets(this.dataset, exerciseId, w?.startedAt).filter((s) => s.kind !== 'warmup');
    const count = Math.max(initialSets, prev.length);
    for (let i = 0; i < count; i++) {
      const p = prev[i];
      this.insert('sets', {
        workoutId,
        workoutExerciseId: we.id,
        position: i,
        kind: p?.kind ?? 'normal',
        weight: p?.weight ?? null,
        reps: p?.reps ?? null,
        distance: p?.distance ?? null,
        duration: p?.duration ?? null,
        rpe: null,
        completed: false,
      });
    }
    return we;
  }

  addSet(workoutExerciseId: string): WorkoutSet {
    const we = this.get('workoutExercises', workoutExerciseId)!;
    const sets = this.setsOf(workoutExerciseId);
    const last = sets[sets.length - 1];
    return this.insert('sets', {
      workoutId: we.workoutId,
      workoutExerciseId,
      position: (last?.position ?? -1) + 1,
      kind: 'normal',
      weight: last?.weight ?? null,
      reps: last?.reps ?? null,
      distance: last?.distance ?? null,
      duration: last?.duration ?? null,
      rpe: null,
      completed: false,
    });
  }

  removeWorkoutExercise(workoutExerciseId: string) {
    for (const s of this.setsOf(workoutExerciseId)) this.remove('sets', s.id);
    this.remove('workoutExercises', workoutExerciseId);
  }

  /** Rewrites positions 0..n-1 in the given order (only rows whose position changes are touched). */
  reorderWorkoutExercises(workoutId: string, orderedIds: string[]) {
    const current = this.workoutExercises(workoutId);
    const rest = current.filter((we) => !orderedIds.includes(we.id)).map((we) => we.id);
    [...orderedIds, ...rest].forEach((id, position) => {
      if (this.get('workoutExercises', id)?.position !== position) this.update('workoutExercises', id, { position });
    });
  }

  /**
   * Moves an exercise one place up or down. A superset moves as one block, and an exercise
   * inside a superset moves within it.
   */
  moveWorkoutExercise(workoutExerciseId: string, direction: -1 | 1) {
    const we = this.get('workoutExercises', workoutExerciseId);
    if (!we) return;
    const list = this.workoutExercises(we.workoutId);
    // Blocks: consecutive exercises sharing a superset id.
    const blocks: WorkoutExercise[][] = [];
    for (const x of list) {
      const last = blocks[blocks.length - 1];
      if (last && x.supersetId && last[0]!.supersetId === x.supersetId) last.push(x);
      else blocks.push([x]);
    }
    const bi = blocks.findIndex((b) => b.some((x) => x.id === workoutExerciseId));
    const block = blocks[bi]!;
    if (block.length > 1) {
      // Inside a superset: swap with the neighbour in the same block.
      const i = block.findIndex((x) => x.id === workoutExerciseId);
      const j = i + direction;
      if (j < 0 || j >= block.length) return;
      [block[i], block[j]] = [block[j]!, block[i]!];
    } else {
      const bj = bi + direction;
      if (bj < 0 || bj >= blocks.length) return;
      [blocks[bi], blocks[bj]] = [blocks[bj]!, blocks[bi]!];
    }
    this.reorderWorkoutExercises(we.workoutId, blocks.flat().map((x) => x.id));
  }

  /**
   * Swaps the exercise (e.g. the machine is taken). Completed sets keep their numbers; sets not
   * yet done are refilled from the last time the new exercise was logged.
   */
  replaceWorkoutExercise(workoutExerciseId: string, exerciseId: string) {
    const we = this.get('workoutExercises', workoutExerciseId);
    if (!we || we.exerciseId === exerciseId) return;
    const w = this.get('workouts', we.workoutId);
    const prev = previousSets(this.dataset, exerciseId, w?.startedAt).filter((s) => s.kind !== 'warmup');
    this.update('workoutExercises', workoutExerciseId, { exerciseId });
    let n = 0;
    for (const s of this.setsOf(workoutExerciseId)) {
      if (s.kind === 'warmup' || s.completed) {
        if (s.kind !== 'warmup') n++;
        continue;
      }
      const p = prev[n++];
      this.update('sets', s.id, { weight: p?.weight ?? null, reps: p?.reps ?? null, distance: p?.distance ?? null, duration: p?.duration ?? null });
    }
  }

  /** Groups exercises into one superset and moves them next to each other (first one's place). */
  makeSuperset(workoutExerciseIds: string[]) {
    const rows = workoutExerciseIds.map((id) => this.get('workoutExercises', id)).filter((x): x is WorkoutExercise => !!x);
    if (rows.length < 2) return;
    const workoutId = rows[0]!.workoutId;
    // Joining an existing superset keeps its id so the others stay grouped.
    const supersetId = rows.find((r) => r.supersetId)?.supersetId ?? randomId();
    const members = new Set([
      ...rows.map((r) => r.id),
      ...this.workoutExercises(workoutId)
        .filter((x) => x.supersetId && rows.some((r) => r.supersetId === x.supersetId))
        .map((x) => x.id),
    ]);
    for (const id of members) if (this.get('workoutExercises', id)?.supersetId !== supersetId) this.update('workoutExercises', id, { supersetId });
    const list = this.workoutExercises(workoutId);
    const first = list.findIndex((x) => members.has(x.id));
    const grouped = list.filter((x) => members.has(x.id));
    const others = list.filter((x) => !members.has(x.id));
    others.splice(first, 0, ...grouped);
    this.reorderWorkoutExercises(workoutId, others.map((x) => x.id));
  }

  /** Takes one exercise out of its superset; a superset left with one exercise is dissolved. */
  leaveSuperset(workoutExerciseId: string) {
    const we = this.get('workoutExercises', workoutExerciseId);
    if (!we?.supersetId) return;
    const group = this.workoutExercises(we.workoutId).filter((x) => x.supersetId === we.supersetId);
    this.update('workoutExercises', workoutExerciseId, { supersetId: null });
    const left = group.filter((x) => x.id !== workoutExerciseId);
    if (left.length === 1) this.update('workoutExercises', left[0]!.id, { supersetId: null });
    // Put it right after the superset so the group stays contiguous.
    if (left.length >= 1) {
      const order = this.workoutExercises(we.workoutId).filter((x) => x.id !== workoutExerciseId);
      const lastIdx = order.map((x) => x.id).lastIndexOf(left[left.length - 1]!.id);
      order.splice(lastIdx + 1, 0, we);
      this.reorderWorkoutExercises(we.workoutId, order.map((x) => x.id));
    }
  }

  /**
   * True when the timer should rest after this exercise's set: always, except for an exercise in a
   * superset that isn't the last one (you go straight to the next exercise).
   */
  restsAfter(workoutExerciseId: string): boolean {
    const we = this.get('workoutExercises', workoutExerciseId);
    if (!we?.supersetId) return true;
    const group = this.workoutExercises(we.workoutId).filter((x) => x.supersetId === we.supersetId);
    return group[group.length - 1]?.id === workoutExerciseId;
  }

  /** Finish: drop sets that were never completed, stamp the end time. */
  finishWorkout(workoutId: string, opts: { dropIncomplete?: boolean } = { dropIncomplete: true }) {
    if (opts.dropIncomplete !== false) {
      for (const s of this.all('sets').filter((x) => x.workoutId === workoutId && !x.completed)) {
        this.remove('sets', s.id);
      }
      for (const we of this.workoutExercises(workoutId)) {
        if (this.setsOf(we.id).length === 0) this.remove('workoutExercises', we.id);
      }
    }
    return this.update('workouts', workoutId, { endedAt: this.now() });
  }

  deleteWorkout(workoutId: string) {
    for (const s of this.all('sets').filter((x) => x.workoutId === workoutId)) this.remove('sets', s.id);
    for (const we of this.workoutExercises(workoutId)) this.remove('workoutExercises', we.id);
    this.remove('workouts', workoutId);
  }

  /** Create (or overwrite) a template from a workout's structure. */
  saveWorkoutAsTemplate(workoutId: string, name?: string, folderId: string | null = null): Template {
    const w = this.get('workouts', workoutId)!;
    const t = this.insert('templates', {
      name: name ?? w.name,
      folderId,
      notes: w.notes,
      position: this.all('templates').length,
    });
    for (const we of this.workoutExercises(workoutId)) {
      const te = this.insert('templateExercises', {
        templateId: t.id,
        exerciseId: we.exerciseId,
        position: we.position,
        supersetId: we.supersetId,
        notes: null, // a workout's notes are about that session only; pinned notes carry over
        restSeconds: we.restSeconds,
      });
      for (const s of this.setsOf(we.id)) {
        this.insert('templateSets', {
          templateId: t.id,
          templateExerciseId: te.id,
          position: s.position,
          kind: s.kind,
          weight: s.weight,
          reps: s.reps,
          distance: s.distance,
          duration: s.duration,
        });
      }
    }
    return t;
  }

  deleteTemplate(templateId: string) {
    for (const s of this.all('templateSets').filter((x) => x.templateId === templateId)) this.remove('templateSets', s.id);
    for (const e of this.all('templateExercises').filter((x) => x.templateId === templateId))
      this.remove('templateExercises', e.id);
    this.remove('templates', templateId);
  }

  // ---- template editing ---------------------------------------------------
  templateExercises(templateId: string): TemplateExercise[] {
    return this.all('templateExercises')
      .filter((x) => x.templateId === templateId)
      .sort((a, b) => a.position - b.position);
  }

  templateSetsOf(templateExerciseId: string): TemplateSet[] {
    return this.all('templateSets')
      .filter((s) => s.templateExerciseId === templateExerciseId)
      .sort((a, b) => a.position - b.position);
  }

  createTemplate(name: string, folderId: string | null = null): Template {
    return this.insert('templates', { name, folderId, notes: null, position: this.all('templates').length });
  }

  /** Adds an exercise with `count` sets, pre-filled from the last time it was done. */
  addExerciseToTemplate(templateId: string, exerciseId: string, count = 3): TemplateExercise {
    const te = this.insert('templateExercises', {
      templateId,
      exerciseId,
      position: this.templateExercises(templateId).length,
      supersetId: null,
      notes: null,
      restSeconds: null,
    });
    const prev = previousSets(this.dataset, exerciseId).filter((s) => s.kind !== 'warmup');
    for (let i = 0; i < Math.max(count, prev.length); i++) {
      const p = prev[i];
      this.insert('templateSets', {
        templateId,
        templateExerciseId: te.id,
        position: i,
        kind: 'normal',
        weight: p?.weight ?? null,
        reps: p?.reps ?? null,
        distance: p?.distance ?? null,
        duration: p?.duration ?? null,
      });
    }
    return te;
  }

  addTemplateSet(templateExerciseId: string): TemplateSet {
    const te = this.get('templateExercises', templateExerciseId)!;
    const sets = this.templateSetsOf(templateExerciseId);
    const last = sets[sets.length - 1];
    return this.insert('templateSets', {
      templateId: te.templateId,
      templateExerciseId,
      position: (last?.position ?? -1) + 1,
      kind: 'normal',
      weight: last?.weight ?? null,
      reps: last?.reps ?? null,
      distance: last?.distance ?? null,
      duration: last?.duration ?? null,
    });
  }

  removeTemplateExercise(templateExerciseId: string) {
    for (const s of this.templateSetsOf(templateExerciseId)) this.remove('templateSets', s.id);
    this.remove('templateExercises', templateExerciseId);
  }

  moveTemplateExercise(templateExerciseId: string, direction: -1 | 1) {
    const te = this.get('templateExercises', templateExerciseId);
    if (!te) return;
    const list = this.templateExercises(te.templateId);
    const i = list.findIndex((x) => x.id === te.id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    list.forEach((x, k) => x.position !== k && this.update('templateExercises', x.id, { position: k }));
  }

  /** Replaces a template's exercises and sets with what was done in a workout. */
  updateTemplateFromWorkout(templateId: string, workoutId: string) {
    for (const te of this.templateExercises(templateId)) this.removeTemplateExercise(te.id);
    for (const we of this.workoutExercises(workoutId)) {
      const te = this.insert('templateExercises', {
        templateId,
        exerciseId: we.exerciseId,
        position: we.position,
        supersetId: we.supersetId,
        notes: this.templateNoteFor(templateId, we.exerciseId),
        restSeconds: we.restSeconds,
      });
      for (const s of this.setsOf(we.id))
        this.insert('templateSets', {
          templateId,
          templateExerciseId: te.id,
          position: s.position,
          kind: s.kind,
          weight: s.weight,
          reps: s.reps,
          distance: s.distance,
          duration: s.duration,
        });
    }
  }

  private templateNoteFor(templateId: string, exerciseId: string): string | null {
    return (
      this.all('templateExercises', true).find((x) => x.templateId === templateId && x.exerciseId === exerciseId && x.notes)?.notes ?? null
    );
  }

  /**
   * Whether a finished workout's exercises or set counts differ from the template it came from,
   * so the finish screen can offer to update the template.
   */
  workoutDiffersFromTemplate(workoutId: string): boolean {
    const w = this.get('workouts', workoutId);
    if (!w?.templateId || !this.get('templates', w.templateId)) return false;
    const a = this.workoutExercises(workoutId).map((we) => `${we.exerciseId}:${this.setsOf(we.id).length}`);
    const b = this.templateExercises(w.templateId).map((te) => `${te.exerciseId}:${this.templateSetsOf(te.id).length}`);
    return a.join('|') !== b.join('|');
  }

  /** Starts a new workout with the same exercises and sets as an earlier one, values from last time. */
  repeatWorkout(workoutId: string): Workout {
    const src = this.get('workouts', workoutId)!;
    const w = this.insert('workouts', {
      name: src.name,
      startedAt: this.now(),
      endedAt: null,
      notes: null,
      templateId: src.templateId && this.get('templates', src.templateId) ? src.templateId : null,
    });
    const supersetMap = new Map<string, string>();
    for (const old of this.workoutExercises(workoutId)) {
      const we = this.insert('workoutExercises', {
        workoutId: w.id,
        exerciseId: old.exerciseId,
        position: old.position,
        supersetId: old.supersetId
          ? (supersetMap.get(old.supersetId) ?? supersetMap.set(old.supersetId, randomId()).get(old.supersetId)!)
          : null,
        notes: null,
        restSeconds: old.restSeconds,
      });
      const prev = previousSets(this.dataset, old.exerciseId, w.startedAt);
      this.setsOf(old.id).forEach((s, i) => {
        const p = prev.find((x) => x.position === s.position) ?? prev[i] ?? s;
        this.insert('sets', {
          workoutId: w.id,
          workoutExerciseId: we.id,
          position: s.position,
          kind: s.kind,
          weight: p.weight,
          reps: p.reps,
          distance: p.distance,
          duration: p.duration,
          rpe: null,
          completed: false,
        });
      });
    }
    return w;
  }

  getSetting<T>(key: string, fallback: T): T {
    const s = this.get('settings', key);
    if (!s) return fallback;
    try {
      return JSON.parse(s.value) as T;
    } catch {
      return fallback;
    }
  }

  // ---- pinned exercise notes ---------------------------------------------------
  // A pinned note belongs to the exercise, not to one workout: it is shown every
  // time the exercise is logged (seat height, grip, cues). It is stored as a
  // setting so it also works for built-in exercises, which are read-only.
  // The per-workout note is WorkoutExercise.notes and shows up in History.

  pinnedNote(exerciseId: string): string | null {
    const row = this.get('settings', PINNED_NOTE_PREFIX + exerciseId);
    if (!row) return null;
    try {
      const v = JSON.parse(row.value) as unknown;
      return typeof v === 'string' && v.trim() ? v : null;
    } catch {
      return null;
    }
  }

  setPinnedNote(exerciseId: string, text: string | null) {
    const key = PINNED_NOTE_PREFIX + exerciseId;
    const v = text?.trim();
    if (!v) return this.remove('settings', key);
    const cur = this.maps.settings.get(key);
    if (cur && !cur.deletedAt) this.update('settings', key, { value: JSON.stringify(v) });
    else {
      // Re-pinning after an unpin revives the tombstone so sync sees the newer edit.
      const t = Math.max(this.now(), (cur?.updatedAt ?? 0) + 1);
      this.put('settings', { id: key, value: JSON.stringify(v), createdAt: cur?.createdAt ?? t, updatedAt: t, deletedAt: null });
    }
  }

  setSetting(key: string, value: unknown) {
    const v = JSON.stringify(value);
    if (this.maps.settings.has(key)) this.update('settings', key, { value: v });
    else this.insert('settings', { id: key, value: v });
  }
}
