import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatDuration, suggestNextTemplate, templateLastDone, weeklyGoal } from '@open-workouts/shared';
import { useNav } from '../nav';
import { usePrefs, useStore } from '../state';
import { Button, Card, Eyebrow, H2, Pill, Screen, T, relativeDay, showWeight, styles, useTheme } from '../ui';
import { useDialog } from '../dialog';
import { ExerciseAvatar, ExercisePicker, KIND_LABEL, SetBadge } from '../workoutParts';
import { ActiveWorkout } from './ActiveWorkout';
import { APP_VERSION, useUpdate } from '../update';
import { HeaderActions } from '../ProfileButton';

export function WorkoutScreen() {
  const store = useStore();
  const active = store.activeWorkout();
  if (active) return <ActiveWorkout workout={active} />;
  return <StartScreen />;
}

function StartScreen() {
  const store = useStore();
  const nav = useNav();
  const theme = useTheme();
  const dialog = useDialog();
  const templates = store.all('templates').sort((a, b) => a.position - b.position);
  const folders = store.all('templateFolders').sort((a, b) => a.position - b.position);
  const groups = [{ id: null as string | null, name: 'My templates' }, ...folders];
  const { lastDone, next, lastWorkout } = useMemo(() => {
    const tds = { ...store.dataset, templates: store.all('templates') };
    const finished = store.dataset.workouts.filter((w) => w.endedAt != null).sort((a, b) => b.startedAt - a.startedAt);
    return { lastDone: templateLastDone(tds), next: suggestNextTemplate(tds), lastWorkout: finished[0] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.version]);
  const lastExercises = lastWorkout ? store.workoutExercises(lastWorkout.id).length : 0;
  // "Repeat" is for workouts that aren't a template (by id, or by name for imported ones); templates start from their card.
  const isTemplated = (w: { name: string; templateId: string | null }) =>
    (!!w.templateId && !!store.get('templates', w.templateId)) || templates.some((t) => t.name.trim().toLowerCase() === w.name.trim().toLowerCase());
  const showRepeat = !!lastWorkout && lastExercises > 0 && !isTemplated(lastWorkout);
  const newTemplate = async () => {
    const name = await dialog.prompt({ title: 'New template', placeholder: 'Template name, e.g. Push Day', confirmText: 'Create' });
    if (!name) return;
    const tpl = store.createTemplate(name);
    nav.push({ name: 'templateEdit', id: tpl.id });
  };
  return (
    <Screen
      title="Train"
      subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      right={<HeaderActions />}
    >
      <Pressable
        onPress={() => store.startWorkout()}
        accessibilityRole="button"
        accessibilityLabel="Start an empty workout"
        style={({ pressed }) => [local.hero, { backgroundColor: theme.accent }, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[local.heroTitle, { color: theme.onAccent }]}>Quick start</Text>
          <Text style={{ color: theme.onAccent, opacity: 0.8, fontSize: 14 }}>Empty workout. Add exercises as you go.</Text>
        </View>
        <View style={[local.heroIcon, { backgroundColor: theme.onAccent }]}>
          <Ionicons name="play" size={22} color={theme.accent} style={{ marginLeft: 3 }} />
        </View>
      </Pressable>
      <UpdateBanner />
      <WeekGoal />
      {next && (
        <Card>
          <View style={styles.rowBetween}>
            {/* Only the text opens the template, so Start stays its own button for screen readers. */}
            <Pressable
              style={{ flex: 1 }}
              onPress={() => nav.push({ name: 'templateDetail', id: next.id })}
              accessibilityRole="button"
              accessibilityLabel={`Up next: ${next.name}. Show template`}
            >
              <Text style={{ color: theme.accentText, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 }}>UP NEXT</Text>
              <T bold style={{ fontSize: 17, marginTop: 2 }}>
                {next.name}
              </T>
              <T small muted>
                Last done {relativeDay(lastDone.get(next.id) ?? 0)} · {store.templateExercises(next.id).length} exercises
              </T>
            </Pressable>
            <Button small variant="soft" icon="play" title="Start" onPress={() => store.startWorkout({ templateId: next.id })} />
          </View>
        </Card>
      )}
      {showRepeat && lastWorkout && (
        <Card>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 }}>REPEAT LAST WORKOUT</Text>
              <T bold style={{ fontSize: 17, marginTop: 2 }} lines={1}>
                {lastWorkout.name}
              </T>
              <T small muted>
                {relativeDay(lastWorkout.startedAt)} · {lastExercises} exercise{lastExercises === 1 ? '' : 's'}
              </T>
            </View>
            <Button small icon="repeat" title="Repeat" onPress={() => store.repeatWorkout(lastWorkout.id)} />
          </View>
        </Card>
      )}
      <H2 right={<Button small variant="ghost" icon="add" title="New template" onPress={newTemplate} />}>Templates</H2>
      {groups.map((g) => {
        const list = templates.filter((t) => t.folderId === g.id);
        if (!list.length) return null;
        return (
          <View key={g.id ?? 'root'}>
            {(folders.length > 0 || g.id) && (
              <Eyebrow>
                {g.name} · {list.length}
              </Eyebrow>
            )}
            {list.map((t) => {
              const tes = store.all('templateExercises').filter((x) => x.templateId === t.id).sort((a, b) => a.position - b.position);
              const names = tes.map((te) => store.get('exercises', te.exerciseId)?.name).filter(Boolean) as string[];
              const last = lastDone.get(t.id) ?? 0;
              return (
                // Opens a preview of the whole template; the workout starts from there.
                <Card key={t.id} onPress={() => nav.push({ name: 'templateDetail', id: t.id })}>
                  <View style={styles.rowBetween}>
                    <T bold style={{ flex: 1, fontSize: 17 }}>
                      {t.name}
                    </T>
                    <Ionicons name="chevron-forward" size={18} color={theme.muted} />
                  </View>
                  <T small muted lines={2} style={{ marginTop: 4, lineHeight: 19 }}>
                    {names.length ? names.join(' · ') : 'No exercises yet'}
                  </T>
                  <View style={[styles.row, { marginTop: 10, gap: 6 }]}>
                    <Pill icon="barbell-outline" text={`${tes.length} exercise${tes.length === 1 ? '' : 's'}`} tone="neutral" />
                    <Pill icon="time-outline" text={last ? relativeDay(last) : 'Not done yet'} tone={last ? 'neutral' : 'accent'} />
                  </View>
                </Card>
              );
            })}
          </View>
        );
      })}
      {!templates.length && (
        <T muted style={{ marginTop: 16 }}>
          No templates yet. Tap New template to build one, or save a finished workout as a template.
        </T>
      )}
    </Screen>
  );
}

function UpdateBanner() {
  const prefs = usePrefs();
  const t = useTheme();
  const { update, dismiss } = useUpdate(prefs.checkUpdates);
  if (!update) return null;
  return (
    <Card style={{ borderWidth: 1, borderColor: t.accent }}>
      <View style={styles.rowBetween}>
        <Ionicons name="arrow-up-circle" size={26} color={t.accentText} />
        <View style={{ flex: 1 }}>
          <T bold>Version {update.version} is available</T>
          <T small muted>
            You have {APP_VERSION}. See what's new and download it on GitHub.
          </T>
        </View>
      </View>
      <View style={[styles.row, { marginTop: 8, justifyContent: 'flex-end' }]}>
        <Button small variant="ghost" title="Not now" onPress={dismiss} />
        <Button small variant="primary" icon="open-outline" title="Get update" onPress={() => void Linking.openURL(update.url)} />
      </View>
    </Card>
  );
}

/** "2 of 3 this week" with a dot per workout, and the streak of weeks that hit the goal. Tap to change the goal. */
function WeekGoal() {
  const store = useStore();
  const prefs = usePrefs();
  const dialog = useDialog();
  const t = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(() => weeklyGoal(store.dataset, prefs.weeklyGoal), [store.version, prefs.weeklyGoal]);
  const done = g.thisWeek >= g.goal;
  const change = async () => {
    const v = await dialog.menu({
      title: 'Weekly goal',
      message: 'How many workouts a week do you want to aim for?',
      options: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ text: `${n === g.goal ? '✓ ' : ''}${n} workout${n === 1 ? '' : 's'} a week`, value: String(n) })),
    });
    if (v) store.setSetting('prefs', { ...prefs, weeklyGoal: Number(v) });
  };
  return (
    <Card onPress={change}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 }}>THIS WEEK</Text>
          <T bold style={{ fontSize: 17, marginTop: 2 }}>
            {done ? `Goal reached · ${g.thisWeek} of ${g.goal}` : `${g.thisWeek} of ${g.goal} workouts`}
          </T>
        </View>
        {g.streak > 0 && <Pill icon="flame" text={`${g.streak} week${g.streak === 1 ? '' : 's'}`} />}
      </View>
      <View style={[styles.row, { gap: 6, marginTop: 10 }]} accessibilityLabel={`${g.thisWeek} of ${g.goal} workouts this week. Tap to change the goal.`}>
        {Array.from({ length: Math.max(g.goal, g.thisWeek) }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < g.thisWeek ? t.accent : t.surface2 }} />
        ))}
      </View>
    </Card>
  );
}

/** Full preview of a template: every exercise and set. Starting a workout happens from here. */
export function TemplateDetailScreen({ id }: { id: string }) {
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const dialog = useDialog();
  const t = useTheme();
  const tpl = store.get('templates', id);
  if (!tpl)
    return (
      <Screen>
        <T>Template not found.</T>
      </Screen>
    );
  const tes = store
    .all('templateExercises')
    .filter((x) => x.templateId === id)
    .sort((a, b) => a.position - b.position);
  const setsOf = (teId: string) =>
    store
      .all('templateSets')
      .filter((s) => s.templateExerciseId === teId)
      .sort((a, b) => a.position - b.position);
  const totalSets = tes.reduce((n, te) => n + setsOf(te.id).length, 0);
  const folder = tpl.folderId ? store.get('templateFolders', tpl.folderId)?.name : null;
  const lastAt = templateLastDone({ ...store.dataset, templates: store.all('templates') }).get(id) ?? 0;
  const last = lastAt ? { startedAt: lastAt } : undefined;
  const active = store.activeWorkout();
  const dist = prefs.distanceUnit === 'mi' ? 1609.344 : 1000;
  const describe = (s: { weight: number | null; reps: number | null; distance: number | null; duration: number | null }) => {
    const parts: string[] = [];
    if (s.weight != null) parts.push(`${showWeight(s.weight, prefs)} ${prefs.weightUnit}`);
    if (s.reps != null) parts.push(s.weight != null ? String(s.reps) : `${s.reps} reps`);
    let out = parts.join(' × ');
    if (s.distance != null) out += `${out ? ' · ' : ''}${+(s.distance / dist).toFixed(2)} ${prefs.distanceUnit}`;
    if (s.duration != null) out += `${out ? ' · ' : ''}${formatDuration(s.duration)}`;
    return out || '—';
  };

  const start = () => {
    store.startWorkout({ templateId: id });
    nav.pop(); // back to the Workout tab, which now shows the running workout
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title={tpl.name}>
        <View style={[styles.row, { flexWrap: 'wrap', gap: 6 }]}>
          {folder ? <Pill icon="folder-outline" text={folder} tone="neutral" /> : null}
          <Pill icon="barbell-outline" text={`${tes.length} exercise${tes.length === 1 ? '' : 's'}`} tone="neutral" />
          <Pill icon="layers-outline" text={`${totalSets} set${totalSets === 1 ? '' : 's'}`} tone="neutral" />
          <Pill icon="time-outline" text={last ? `Last done ${relativeDay(last.startedAt)}` : 'Not done yet'} />
        </View>
        {tpl.notes ? <T style={{ marginTop: 8 }}>{tpl.notes}</T> : null}
        {tes.length === 0 && <T muted style={{ marginTop: 12 }}>This template has no exercises yet. Tap Edit to add some.</T>}
        {tes.map((te) => {
          const ex = store.get('exercises', te.exerciseId);
          let n = 0;
          return (
            <Card key={te.id} onPress={ex ? () => nav.push({ name: 'exerciseDetail', id: ex.id }) : undefined}>
              <View style={styles.rowBetween}>
                <T bold style={{ flex: 1, fontSize: 16 }}>
                  {ex?.name ?? 'Unknown exercise'}
                </T>
                {te.restSeconds ? <Pill icon="hourglass-outline" text={formatDuration(te.restSeconds)} tone="neutral" /> : null}
              </View>
              {ex && store.pinnedNote(ex.id) ? (
                <View style={[local.note, { backgroundColor: t.accentSoft }]}>
                  <Ionicons name="pin" size={14} color={t.accentText} style={local.noteIcon} />
                  <T small style={{ flex: 1 }}>
                    {store.pinnedNote(ex.id)}
                  </T>
                </View>
              ) : null}
              {te.notes ? (
                <T small muted>
                  {te.notes}
                </T>
              ) : null}
              <View style={{ marginTop: 6 }}>
                {setsOf(te.id).map((s) => (
                  <View key={s.id} style={[styles.row, { paddingVertical: 3 }]}>
                    <SetBadge kind={s.kind} text={KIND_LABEL[s.kind] || String(++n)} />
                    <T style={{ fontVariant: ['tabular-nums'] }}>{describe(s)}</T>
                  </View>
                ))}
              </View>
            </Card>
          );
        })}
        <View style={[styles.row, { marginTop: 8 }]}>
          <Button title="Edit template" icon="create-outline" onPress={() => nav.push({ name: 'templateEdit', id })} />
          <Button
            title="Delete template"
            variant="danger"
            onPress={async () => {
              const ok = await dialog.confirm({
                title: `Delete "${tpl.name}"?`,
                message: 'Past workouts started from it are kept.',
                confirmText: 'Delete',
                destructive: true,
              });
              if (!ok) return;
              store.deleteTemplate(id);
              nav.pop();
              dialog.toast('Template deleted');
            }}
          />
        </View>
      </Screen>
      <View style={[local.startBar, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        {active && (
          <T small muted style={{ textAlign: 'center', marginBottom: 4 }}>
            Finish or cancel your current workout first.
          </T>
        )}
        <Button title="Start workout" icon="play" variant="primary" disabled={!!active} onPress={start} />
        </View>
      </View>
    </View>
  );
}

export { ActiveWorkout, ExerciseAvatar, ExercisePicker, SetBadge };

const local = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 20, marginTop: 6, marginBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 2 },
  heroIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  noteIcon: { marginTop: 2 },
  startBar: { padding: 12, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
