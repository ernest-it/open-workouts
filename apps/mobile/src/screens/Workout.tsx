import { useEffect, useMemo, useState } from 'react';
import { FlatList, Keyboard, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {
  calculatePlates,
  formatDuration,
  fromKg,
  previousSets,
  toKg,
  type Exercise,
  type SetKind,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@open-workouts/shared';
import { useNav } from '../nav';
import { usePrefs, useStore, type Prefs } from '../state';
import {
  Button,
  Card,
  Chips,
  H2,
  IconButton,
  Input,
  NumInput,
  Pill,
  Screen,
  SearchInput,
  Sheet,
  T,
  label,
  relativeDay,
  showWeight,
  styles,
  useTheme,
} from '../ui';
import { useDialog } from '../dialog';

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
  const templates = store.all('templates').sort((a, b) => a.position - b.position);
  const folders = store.all('templateFolders').sort((a, b) => a.position - b.position);
  const groups = [{ id: null as string | null, name: 'My templates' }, ...folders];
  const finished = store.all('workouts').filter((w) => w.endedAt != null);
  const lastDone = (templateId: string) =>
    finished.filter((w) => w.templateId === templateId).reduce((m, w) => Math.max(m, w.startedAt), 0);
  return (
    <Screen title="Train" subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
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
      {groups.map((g) => {
        const list = templates.filter((t) => t.folderId === g.id);
        if (!list.length) return null;
        return (
          <View key={g.id ?? 'root'}>
            <H2 right={<Pill text={String(list.length)} tone="neutral" />}>{g.name}</H2>
            {list.map((t) => {
              const tes = store.all('templateExercises').filter((x) => x.templateId === t.id).sort((a, b) => a.position - b.position);
              const names = tes.map((te) => store.get('exercises', te.exerciseId)?.name).filter(Boolean) as string[];
              const last = lastDone(t.id);
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
          Finish a workout and save it as a template to see it here. Templates can also be edited in the web UI.
        </T>
      )}
    </Screen>
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
  const last = store
    .all('workouts')
    .filter((w) => w.templateId === id && w.endedAt != null)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
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
        {tes.length === 0 && <T muted style={{ marginTop: 12 }}>This template has no exercises yet. Add them in the web UI.</T>}
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
          <Button
            title="Rename"
            variant="ghost"
            onPress={async () => {
              const name = await dialog.prompt({ title: 'Rename template', defaultValue: tpl.name, placeholder: 'Template name' });
              if (name) store.update('templates', id, { name });
            }}
          />
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

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function ActiveWorkout({ workout, editing = false, onDone }: { workout: Workout; editing?: boolean; onDone?: () => void }) {
  useKeepAwake();
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const t = useTheme();
  const dialog = useDialog();
  const now = useNow();
  const [picking, setPicking] = useState(false);
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const wexs = store.workoutExercises(workout.id);

  useEffect(() => {
    if (rest && now >= rest.until) {
      setRest(null);
      Vibration.vibrate([0, 300, 150, 300]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [now, rest]);

  const finish = async () => {
    const sets = store.all('sets').filter((s) => s.workoutId === workout.id);
    const done = sets.filter((s) => s.completed).length;
    if (!done) {
      // Finishing would save an empty workout: offer to keep going or throw it away instead.
      const discard = await dialog.confirm({
        title: 'Nothing logged yet',
        message: 'Tap ✓ next to each set you finish. A workout with no completed sets is not saved.',
        cancelText: 'Keep logging',
        confirmText: 'Discard',
        destructive: true,
      });
      if (discard) store.deleteWorkout(workout.id);
      return;
    }
    const incomplete = sets.length - done;
    if (
      incomplete &&
      !(await dialog.confirm({
        title: 'Finish workout?',
        message: `${incomplete} unticked set${incomplete === 1 ? '' : 's'} will be left out.`,
        cancelText: 'Keep logging',
        confirmText: 'Finish',
      }))
    )
      return;
    store.finishWorkout(workout.id);
    nav.switchTab('history');
    nav.push({ name: 'workoutDetail', id: workout.id });
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={[styles.rowBetween, { marginTop: 4 }]}>
          {editing ? (
            <Pill icon="create-outline" text="Editing" tone="neutral" />
          ) : (
            <View style={styles.row}>
              <View style={[local.liveDot, { backgroundColor: t.accent }]} />
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }} accessibilityLabel="Elapsed time">
                {formatDuration((now - workout.startedAt) / 1000)}
              </Text>
            </View>
          )}
          {editing ? (
            <Button title="Done" variant="primary" small onPress={() => onDone?.()} />
          ) : (
            <Button title="Finish" icon="flag" variant="primary" small onPress={finish} />
          )}
        </View>
        <Input
          value={workout.name}
          onChangeText={(v) => store.update('workouts', workout.id, { name: v.replace(/\n/g, ' ') })}
          // Multiline so long names wrap instead of scrolling out of view on narrow phones.
          multiline
          submitBehavior="blurAndSubmit"
          accessibilityLabel="Workout name"
          style={local.titleInput}
        />
        <Input
          placeholder="Add workout notes…"
          value={workout.notes ?? ''}
          multiline
          onChangeText={(v) => store.update('workouts', workout.id, { notes: v || null })}
          style={{ backgroundColor: t.surface }}
        />
        {wexs.map((we) => (
          <ExerciseBlock
            key={we.id}
            we={we}
            workout={workout}
            prefs={prefs}
            editing={editing}
            onCompleted={(secs) => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (secs > 0 && !editing) setRest({ until: Date.now() + secs * 1000, total: secs });
            }}
          />
        ))}
        <Button title="Add exercise" icon="add" variant="soft" onPress={() => setPicking(true)} style={{ marginTop: 8 }} />
        {!editing && (
          <Button
            title="Cancel workout"
            variant="danger"
            onPress={async () => {
              const ok = await dialog.confirm({
                title: 'Discard workout?',
                message: 'Everything logged in this workout is deleted. This cannot be undone.',
                cancelText: 'Keep',
                confirmText: 'Discard',
                destructive: true,
              });
              if (ok) store.deleteWorkout(workout.id);
            }}
          />
        )}
      </Screen>

      {rest && (
        <View style={[local.restBar, { backgroundColor: t.surface, borderColor: t.border }]}>
          {/* The tint drains from right to left as the rest runs out. */}
          <View style={[local.restProgress, { backgroundColor: t.accentSoft, width: `${Math.max(0, ((rest.until - now) / (rest.total * 1000)) * 100)}%` }]} />
          <View>
            <Text style={{ color: t.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>REST</Text>
            <Text style={{ color: t.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
              {formatDuration(Math.max(0, (rest.until - now) / 1000))}
            </Text>
          </View>
          <View style={styles.row}>
            <Button small title="−15" onPress={() => setRest({ ...rest, until: rest.until - 15_000 })} />
            <Button small title="+15" onPress={() => setRest({ until: rest.until + 15_000, total: rest.total + 15 })} />
            <Button small title="Skip" variant="primary" onPress={() => setRest(null)} />
          </View>
        </View>
      )}

      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(e) => {
          store.addExerciseToWorkout(workout.id, e.id);
          setPicking(false);
        }}
      />
    </View>
  );
}

const KIND_LABEL: Record<SetKind, string> = { normal: '', warmup: 'W', drop: 'D', failure: 'F' };

function ExerciseBlock({
  we,
  workout,
  prefs,
  editing,
  onCompleted,
}: {
  we: WorkoutExercise;
  workout: Workout;
  prefs: Prefs;
  editing: boolean;
  onCompleted: (restSeconds: number) => void;
}) {
  const store = useStore();
  const nav = useNav();
  const t = useTheme();
  const dialog = useDialog();
  const [plates, setPlates] = useState(false);
  const ex = store.get('exercises', we.exerciseId);
  const sets = store.setsOf(we.id);
  const prev = useMemo(
    () => previousSets(store.dataset, we.exerciseId, workout.startedAt).filter((s) => s.kind !== 'warmup'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.version, we.exerciseId, workout.startedAt],
  );
  if (!ex) return null;
  const lt = ex.logType;
  const pinned = store.pinnedNote(ex.id);
  const editNote = async () => {
    const v = await dialog.prompt({
      title: we.notes ? 'Edit note' : 'Add note',
      message: 'For this workout only. It shows in the workout summary in History.',
      defaultValue: we.notes ?? '',
      placeholder: 'How did it feel?',
      multiline: true,
      allowEmpty: !!we.notes,
    });
    if (v != null) store.update('workoutExercises', we.id, { notes: v || null });
  };
  const editPinned = async () => {
    const v = await dialog.prompt({
      title: pinned ? 'Edit pinned note' : 'Pin a note',
      message: `Shows on ${ex.name} every time you do it. Good for seat settings, grip or cues.`,
      defaultValue: pinned ?? '',
      placeholder: 'e.g. Seat on 4, pause at the bottom',
      multiline: true,
      allowEmpty: !!pinned,
    });
    if (v != null) store.setPinnedNote(ex.id, v || null);
  };
  const hasWeight = lt === 'weight_reps' || lt === 'weighted_bodyweight' || lt === 'assisted_bodyweight';
  const hasReps = lt !== 'duration' && lt !== 'distance_duration';
  const hasDistance = lt === 'distance_duration';
  const hasDuration = lt === 'duration' || lt === 'distance_duration';
  const dist = prefs.distanceUnit === 'mi' ? 1609.344 : 1000;
  let n = 0;

  return (
    <Card>
      <View style={styles.rowBetween}>
        <Pressable onPress={() => nav.push({ name: 'exerciseDetail', id: ex.id })} style={{ flex: 1 }} accessibilityRole="link">
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 17, letterSpacing: -0.2 }}>{ex.name}</Text>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600', marginTop: 1 }}>
            {sets.filter((x) => x.completed).length}/{sets.length} sets done
          </Text>
        </Pressable>
        {/* Plates only make sense for a loaded bar, not dumbbells, cables or machines. */}
        {lt === 'weight_reps' && (ex.equipment === 'barbell' || ex.equipment === 'smith_machine') && (
          <IconButton name="calculator-outline" label="Plate calculator" onPress={() => setPlates(true)} />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More options for ${ex.name}`}
          hitSlop={10}
          style={local.more}
          onPress={async () => {
            const choice = await dialog.menu({
              title: ex.name,
              options: [
                { text: we.notes ? 'Edit note' : 'Add note', value: 'note' },
                { text: pinned ? 'Edit pinned note' : 'Pin a note', value: 'pin' },
                { text: 'History & records', value: 'history' },
                { text: 'Remove exercise', value: 'remove', destructive: true },
              ],
            });
            if (choice === 'note') return void editNote();
            if (choice === 'pin') return void editPinned();
            if (choice === 'history') nav.push({ name: 'exerciseDetail', id: ex.id });
            if (choice !== 'remove') return;
            const logged = sets.filter((s) => s.completed).length;
            if (
              logged &&
              !(await dialog.confirm({
                title: `Remove ${ex.name}?`,
                message: `${logged} completed set${logged === 1 ? '' : 's'} will be deleted.`,
                confirmText: 'Remove',
                destructive: true,
              }))
            )
              return;
            store.removeWorkoutExercise(we.id);
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={t.muted} />
        </Pressable>
      </View>
      {pinned && (
        <Pressable
          onPress={editPinned}
          accessibilityRole="button"
          accessibilityLabel={`Pinned note: ${pinned}. Tap to edit.`}
          style={[local.note, { backgroundColor: t.accentSoft }]}
        >
          <Ionicons name="pin" size={14} color={t.accentText} style={local.noteIcon} />
          <T small style={{ flex: 1 }}>
            {pinned}
          </T>
        </Pressable>
      )}
      {we.notes ? (
        <Pressable
          onPress={editNote}
          accessibilityRole="button"
          accessibilityLabel={`Note: ${we.notes}. Tap to edit.`}
          style={[local.note, { backgroundColor: t.surface2 }]}
        >
          <Ionicons name="chatbox-ellipses-outline" size={14} color={t.muted} style={local.noteIcon} />
          <T small muted style={{ flex: 1 }}>
            {we.notes}
          </T>
        </Pressable>
      ) : null}
      <View style={[styles.row, local.headRow]}>
        <Text style={[local.head, local.cSet, { color: t.muted, textAlign: 'center' }]} numberOfLines={1}>
          SET
        </Text>
        <Text style={[local.head, local.cPrev, { color: t.muted }]} numberOfLines={1}>
          PREVIOUS
        </Text>
        {hasWeight && (
          <Text style={[local.head, local.cNum, { color: t.muted }]}>
            {lt === 'assisted_bodyweight' ? '−' : lt === 'weighted_bodyweight' ? '+' : ''}
            {prefs.weightUnit.toUpperCase()}
          </Text>
        )}
        {hasDistance && <Text style={[local.head, local.cNum, { color: t.muted }]}>{prefs.distanceUnit.toUpperCase()}</Text>}
        {hasDuration && <Text style={[local.head, local.cNum, { color: t.muted }]}>SEC</Text>}
        {hasReps && <Text style={[local.head, local.cNum, { color: t.muted }]}>REPS</Text>}
        <View style={local.cCheck} />
      </View>
      {sets.map((s) => {
        const idx = s.kind === 'warmup' ? -1 : n++;
        const p = idx >= 0 ? prev[idx] : undefined;
        const prevText = !p
          ? '—'
          : hasWeight
            ? `${showWeight(p.weight, prefs)}×${p.reps ?? 0}`
            : hasDistance
              ? `${((p.distance ?? 0) / dist).toFixed(1)}`
              : hasDuration
                ? formatDuration(p.duration)
                : `${p.reps ?? 0}`;
        return (
          <SetRow
            key={s.id}
            s={s}
            label={KIND_LABEL[s.kind] || String(idx + 1)}
            prevText={prevText}
            onUsePrev={p ? () => store.update('sets', s.id, { weight: p.weight, reps: p.reps, distance: p.distance, duration: p.duration }) : undefined}
            prefs={prefs}
            cols={{ hasWeight, hasReps, hasDistance, hasDuration }}
            onCompleted={() => onCompleted(we.restSeconds ?? prefs.restSeconds)}
            editing={editing}
          />
        );
      })}
      <Button small title="Add set" icon="add" onPress={() => store.addSet(we.id)} style={{ marginTop: 10 }} />
      {plates && <PlateModal prefs={prefs} kg={sets.find((s) => !s.completed)?.weight ?? sets[0]?.weight ?? 60} onClose={() => setPlates(false)} />}
    </Card>
  );
}

function SetRow({
  s,
  label: setLabel,
  prevText,
  onUsePrev,
  prefs,
  cols,
  onCompleted,
  editing,
}: {
  s: WorkoutSet;
  label: string;
  prevText: string;
  onUsePrev?: () => void;
  prefs: Prefs;
  cols: { hasWeight: boolean; hasReps: boolean; hasDistance: boolean; hasDuration: boolean };
  onCompleted: () => void;
  editing: boolean;
}) {
  const store = useStore();
  const t = useTheme();
  const dialog = useDialog();
  const up = (patch: Partial<WorkoutSet>) => store.update('sets', s.id, patch);
  const dist = prefs.distanceUnit === 'mi' ? 1609.344 : 1000;
  // Fields on a ticked row blend into the tinted row instead of sitting in grey boxes.
  const numStyle = [local.cNum, s.completed && { backgroundColor: 'transparent' }];
  // Tapping the set number opens a menu (set type, delete) instead of silently cycling the type.
  const openMenu = async () => {
    const mark = (k: SetKind, text: string) => ({ text: s.kind === k ? `✓ ${text}` : text, value: k });
    const choice = await dialog.menu({
      title: `Set ${setLabel}`,
      options: [
        mark('normal', 'Normal set'),
        mark('warmup', 'Warm-up'),
        mark('drop', 'Drop set'),
        mark('failure', 'Failure'),
        { text: 'Delete set', value: 'delete', destructive: true },
      ],
    });
    if (choice === 'delete') store.remove('sets', s.id);
    else if (choice) up({ kind: choice });
  };
  return (
    <View style={[styles.row, local.setRow]}>
      {/* A separate layer rather than a background on the row: Android drops the corner radius when a background is added after mount. */}
      {s.completed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.doneRow, borderRadius: 12 }]} />}
      <Pressable
        style={local.cSet}
        onPress={openMenu}
        onLongPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel={`Set ${setLabel} options`}
        hitSlop={6}
      >
        <SetBadge kind={s.kind} text={setLabel} />
      </Pressable>
      <Pressable style={local.cPrev} onPress={onUsePrev} accessibilityLabel={onUsePrev ? `Use previous: ${prevText}` : undefined}>
        <T small muted lines={1}>
          {prevText}
        </T>
      </Pressable>
      {cols.hasWeight && (
        <NumInput
          style={numStyle}
          value={s.weight == null ? null : +fromKg(s.weight, prefs.weightUnit).toFixed(2)}
          onChange={(v) => up({ weight: v == null ? null : toKg(v, prefs.weightUnit) })}
        />
      )}
      {cols.hasDistance && (
        <NumInput style={numStyle} value={s.distance == null ? null : +(s.distance / dist).toFixed(3)} onChange={(v) => up({ distance: v == null ? null : v * dist })} />
      )}
      {cols.hasDuration && <NumInput style={numStyle} value={s.duration} onChange={(v) => up({ duration: v })} />}
      {cols.hasReps && <NumInput style={numStyle} value={s.reps} onChange={(v) => up({ reps: v == null ? null : Math.round(v) })} />}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: s.completed }}
        accessibilityLabel={`Set ${setLabel} done`}
        style={[local.cCheck, local.check, { backgroundColor: s.completed ? t.accent : t.surface2 }]}
        onPress={() => {
          if (!s.completed) Keyboard.dismiss(); // ticking a set means you are done typing it
          up({ completed: !s.completed });
          if (!s.completed && !editing) onCompleted();
        }}
      >
        <Ionicons name="checkmark" size={20} color={s.completed ? t.onAccent : t.muted} />
      </Pressable>
    </View>
  );
}

function PlateModal({ prefs, kg, onClose }: { prefs: Prefs; kg: number; onClose: () => void }) {
  const t = useTheme();
  const [target, setTarget] = useState<number | null>(+fromKg(kg, prefs.weightUnit).toFixed(2));
  const bar = +fromKg(prefs.barWeightKg, prefs.weightUnit).toFixed(2);
  const r = calculatePlates(target ?? 0, bar, prefs.weightUnit === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={local.backdrop} onPress={onClose}>
        <Pressable style={[local.sheet, { backgroundColor: t.surface }]}>
          <H2>Plate calculator</H2>
          <T muted>Target ({prefs.weightUnit})</T>
          <NumInput value={target} onChange={setTarget} />
          <T muted small>
            Bar {bar} {prefs.weightUnit}
          </T>
          <View style={[styles.row, { minHeight: 90, flexWrap: 'wrap' }]}>
            {r.perSide.map((p, i) => (
              <View key={i} style={{ width: 30, height: 30 + p * 1.6, backgroundColor: t.accent, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: t.onAccent, fontSize: 11, fontWeight: '800' }}>{p}</Text>
              </View>
            ))}
          </View>
          <T>Per side: {r.perSide.join(' + ') || 'just the bar'}</T>
          {r.remainder > 0 && (
            <T small style={{ color: t.danger }}>
              Closest: {r.achieved} {prefs.weightUnit}
            </T>
          )}
          <Button title="Close" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ExercisePicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (e: Exercise) => void }) {
  const store = useStore();
  const t = useTheme();
  const [q, setQ] = useState('');
  const [part, setPart] = useState('all');
  const all = store.exercises();
  const parts = ['all', ...new Set(all.map((e) => e.bodyPart))];
  const list = all.filter((e) => (part === 'all' || e.bodyPart === part) && e.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <View style={styles.rowBetween}>
          <H2>Add exercise</H2>
          <Button small variant="ghost" title="Close" onPress={onClose} />
        </View>
        <SearchInput placeholder="Search exercises" value={q} onChangeText={setQ} />
        <Chips options={parts.map((p) => ({ value: p, label: label(p) }))} value={part} onChange={setPart} />
        <FlatList
          data={list}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              style={({ pressed }) => [local.pickRow, pressed && { backgroundColor: t.surface2 }]}
              accessibilityRole="button"
            >
              <ExerciseAvatar name={item.name} />
              <View style={{ flex: 1 }}>
                <T bold>{item.name}</T>
                <T small muted>
                  {label(item.bodyPart)}
                </T>
              </View>
              <Ionicons name="add-circle" size={24} color={t.accentText} />
            </Pressable>
          )}
        />
      </View>
    </Sheet>
  );
}

/** Set number (or W/D/F) in a small rounded badge, coloured by set type. */
export function SetBadge({ kind, text }: { kind: SetKind; text: string }) {
  const t = useTheme();
  const fg = { normal: t.text, warmup: t.warn, drop: t.accentText, failure: t.danger }[kind];
  return (
    <View style={[local.badge, { backgroundColor: kind === 'drop' ? t.accentSoft : t.surface2 }]}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] }}>{text}</Text>
    </View>
  );
}

/** Initials in a tinted circle, so long exercise lists are easier to scan. */
export function ExerciseAvatar({ name }: { name: string }) {
  const t = useTheme();
  const initials = name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <View style={[local.avatar, { backgroundColor: t.accentSoft }]}>
      <Text style={{ color: t.accentText, fontWeight: '800', fontSize: 14 }}>{initials}</Text>
    </View>
  );
}

const local = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 20, marginTop: 6, marginBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 2 },
  heroIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  titleInput: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 2 },
  headRow: { marginTop: 12, paddingHorizontal: 4 },
  head: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  setRow: { paddingVertical: 4, paddingHorizontal: 4, borderRadius: 12, marginTop: 4 },
  badge: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  // Number columns flex (capped) so a full row still fits a 320pt-wide phone with larger text.
  cSet: { width: 28 },
  cPrev: { flex: 1.2, minWidth: 0 },
  cNum: { flex: 1, minWidth: 0, maxWidth: 72, textAlign: 'center', borderRadius: 10 },
  cCheck: { width: 42 },
  check: { height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  restBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  restProgress: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 24, padding: 20 },
  more: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  noteIcon: { marginTop: 2 },
  startBar: { padding: 12, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  pickRow: { paddingVertical: 10, paddingHorizontal: 6, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
