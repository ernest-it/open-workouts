// Template-level derived data: when each was last done, and which one is probably next.

import type { Template, Workout } from './schema';
import type { Dataset } from './stats';

type TemplateData = Dataset & { templates: Template[] };

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Finished workouts per template, newest first. A workout counts when it was started from the
 * template, or when it has no template but the same name: workouts imported from other apps
 * (Strong CSV) carry only the name.
 */
export function templateWorkouts(ds: TemplateData): Map<string, Workout[]> {
  const live = ds.templates.filter((t) => !t.deletedAt);
  const byName = new Map<string, string>();
  for (const t of live) if (!byName.has(norm(t.name))) byName.set(norm(t.name), t.id);
  const out = new Map<string, Workout[]>(live.map((t) => [t.id, []]));
  for (const w of ds.workouts) {
    if (w.deletedAt || w.endedAt == null) continue;
    const id = w.templateId && out.has(w.templateId) ? w.templateId : !w.templateId ? byName.get(norm(w.name)) : undefined;
    if (id) out.get(id)!.push(w);
  }
  for (const list of out.values()) list.sort((a, b) => b.startedAt - a.startedAt);
  return out;
}

/** Start time of the latest finished workout per template (0 when never done). */
export function templateLastDone(ds: TemplateData): Map<string, number> {
  return new Map([...templateWorkouts(ds)].map(([id, ws]) => [id, ws[0]?.startedAt ?? 0]));
}

/**
 * The template you're most likely to do next when rotating through a programme: of the templates
 * used in the last `windowDays`, the one done longest ago. Null when there's no rotation to go by.
 */
export function suggestNextTemplate(ds: TemplateData, now = Date.now(), windowDays = 42): Template | null {
  const last = templateLastDone(ds);
  const recent = ds.templates
    .filter((t) => !t.deletedAt && (last.get(t.id) ?? 0) > now - windowDays * 86_400_000)
    .sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0) || a.position - b.position);
  return recent.length >= 2 ? recent[0]! : null;
}
