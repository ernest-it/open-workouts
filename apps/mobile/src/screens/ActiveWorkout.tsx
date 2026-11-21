import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {
  calculatePlates,
  formatDuration,
  fromKg,
  previousSets,
  toKg,
  workoutPRs,
  type Exercise,
  type SetKind,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@open-workouts/shared';
import { useNav } from '../nav';
import { usePrefs, useStore, type Prefs } from '../state';
import { restTimer, useRest } from '../rest';
import { Button, Card, H2, IconButton, Input, NumInput, Pill, Screen, T, showWeight, styles, useTheme } from '../ui';
import { useDialog } from '../dialog';
import { ExercisePicker, KIND_LABEL, SetBadge } from '../workoutParts';

export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

type Field = 'weight' | 'reps' | 'distance' | 'duration';
interface Cols {
  hasWeight: boolean;
  hasReps: boolean;
  hasDistance: boolean;
  hasDuration: boolean;
}
type Picker = { mode: 'add' } | { mode: 'replace'; we: WorkoutExercise; bodyPart: string } | null;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function ActiveWorkout({ workout, editing = false, onDone }: { workout: Workout; editing?: boolean; onDone?: () => void }) {
  useKeepAwake();
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const t = useTheme();
  const dialog = useDialog();
  const now = useNow();
  const rest = useRest();
  const [picker, setPicker] = useState<Picker>(null);
  const wexs = store.workoutExercises(workout.id);

  // Letter per superset in order of appearance (A, B, ...), plus each member's place in it.
  const supersets = new Map<string, { letter: string; index: number; size: number }>();
  {
    const groups = new Map<string, string[]>();
    for (const we of wexs) if (we.supersetId) groups.set(we.supersetId, [...(groups.get(we.supersetId) ?? []), we.id]);
    let i = 0;
    for (const [, ids] of groups) {
      if (ids.length < 2) continue;
      const letter = LETTERS[i++ % LETTERS.length]!;
      ids.forEach((id, index) => supersets.set(id, { letter, index, size: ids.length }));
    }
  }

  /** What comes next after this set, for the rest notification ("Squat · set 3"). */
  const nextUp = (afterSetId: string) => {
    const ordered = wexs.flatMap((we) => store.setsOf(we.id).map((s) => ({ we, s })));
    const from = ordered.findIndex((x) => x.s.id === afterSetId);
    const next = [...ordered.slice(from + 1), ...ordered.slice(0, from)].find((x) => !x.s.completed && x.s.id !== afterSetId);
    if (!next) return null;
    const name = store.get('exercises', next.we.exerciseId)?.name ?? 'next exercise';
    const n = store.setsOf(next.we.id).findIndex((s) => s.id === next.s.id) + 1;
    return `${name} · set ${n}`;
  };

  const onSetDone = (we: WorkoutExercise, ex: Exercise, s: WorkoutSet) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const pr = workoutPRs(store.dataset, workout.id).find((p) => p.setId === s.id);
    if (pr) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dialog.toast(`🏆 New PR · ${ex.name} (${pr.types.join(', ')})`);
    }
    if (editing || !store.restsAfter(we.id)) return;
    restTimer.start(we.restSeconds ?? prefs.restSeconds, nextUp(s.id));
  };

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
      if (discard) {
        restTimer.skip();
        store.deleteWorkout(workout.id);
      }
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
    restTimer.skip();
    store.finishWorkout(workout.id);
    nav.push({ name: 'workoutDone', id: workout.id });
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
        {wexs.map((we, i) => (
          <ExerciseBlock
            key={we.id}
            we={we}
            workout={workout}
            prefs={prefs}
            editing={editing}
            superset={supersets.get(we.id)}
            others={wexs.filter((x) => x.id !== we.id)}
            canMoveUp={i > 0}
            canMoveDown={i < wexs.length - 1}
            onReplace={(bodyPart) => setPicker({ mode: 'replace', we, bodyPart })}
            onSetDone={onSetDone}
          />
        ))}
        <Button title="Add exercise" icon="add" variant="soft" onPress={() => setPicker({ mode: 'add' })} style={{ marginTop: 8 }} />
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
              if (!ok) return;
              restTimer.skip();
              store.deleteWorkout(workout.id);
            }}
          />
        )}
      </Screen>

      {rest && !editing && <RestBar until={rest.until} total={rest.total} now={now} />}

      <ExercisePicker
        key={picker?.mode === 'replace' ? `r-${picker.we.id}` : 'add'}
        visible={!!picker}
        title={picker?.mode === 'replace' ? 'Replace exercise' : 'Add exercise'}
        initialPart={picker?.mode === 'replace' ? picker.bodyPart : 'all'}
        onClose={() => setPicker(null)}
        onPick={(e) => {
          if (picker?.mode === 'replace') store.replaceWorkoutExercise(picker.we.id, e.id);
          else store.addExerciseToWorkout(workout.id, e.id);
          setPicker(null);
        }}
      />
    </View>
  );
}

/** Floating rest countdown. The tint drains from right to left as the rest runs out. */
export function RestBar({ until, total, now }: { until: number; total: number; now: number }) {
  const t = useTheme();
  const left = Math.max(0, (until - now) / 1000);
  return (
    <View style={[local.restBar, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={[local.restProgress, { backgroundColor: t.accentSoft, width: `${Math.min(100, (left / total) * 100)}%` }]} />
      <View>
        <Text style={{ color: t.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>REST</Text>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatDuration(left)}</Text>
      </View>
      <View style={styles.row}>
        <Button small title="−15" onPress={() => restTimer.adjust(-15)} />
        <Button small title="+15" onPress={() => restTimer.adjust(15)} />
        <Button small title="Skip" variant="primary" onPress={() => restTimer.skip()} />
      </View>
    </View>
  );
}

function ExerciseBlock({
  we,
  workout,
  prefs,
  editing,
  superset,
  others,
  canMoveUp,
  canMoveDown,
  onReplace,
  onSetDone,
}: {
  we: WorkoutExercise;
  workout: Workout;
  prefs: Prefs;
  editing: boolean;
  superset?: { letter: string; index: number; size: number };
  others: WorkoutExercise[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onReplace: (bodyPart: string) => void;
  onSetDone: (we: WorkoutExercise, ex: Exercise, s: WorkoutSet) => void;
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
  const editRest = async () => {
    const current = we.restSeconds ?? prefs.restSeconds;
    const v = await dialog.prompt({
      title: 'Rest timer',
      message: `Seconds of rest after each set of ${ex.name}. Leave empty to use your default (${formatDuration(prefs.restSeconds)}).`,
      defaultValue: we.restSeconds != null ? String(current) : '',
      placeholder: String(prefs.restSeconds),
      allowEmpty: true,
    });
    if (v == null) return;
    const n = Number(v.replace(',', '.'));
    if (v.trim() === '') store.update('workoutExercises', we.id, { restSeconds: null });
    else if (Number.isFinite(n) && n >= 0) store.update('workoutExercises', we.id, { restSeconds: Math.round(n) });
    else void dialog.alert('Not a number', 'Enter the rest in seconds, e.g. 90.');
  };
  const pickSupersetPartner = async () => {
    const choice = await dialog.menu({
      title: `Superset ${ex.name} with…`,
      message: 'Do one set of each back to back; the rest timer starts after the last one.',
      options: others.map((o) => ({ text: store.get('exercises', o.exerciseId)?.name ?? 'Exercise', value: o.id })),
    });
    if (choice) store.makeSuperset([we.id, choice]);
  };
  const remove = async () => {
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
  };
  const openMenu = async () => {
    const opts: { text: string; value: string; destructive?: boolean }[] = [
      { text: we.notes ? 'Edit note' : 'Add note', value: 'note' },
      { text: pinned ? 'Edit pinned note' : 'Pin a note', value: 'pin' },
      { text: 'Replace exercise', value: 'replace' },
    ];
    if (we.supersetId && superset) opts.push({ text: 'Remove from superset', value: 'unsuperset' });
    else if (others.length) opts.push({ text: 'Superset with…', value: 'superset' });
    if (canMoveUp) opts.push({ text: 'Move up', value: 'up' });
    if (canMoveDown) opts.push({ text: 'Move down', value: 'down' });
    opts.push({ text: `Rest timer (${formatDuration(we.restSeconds ?? prefs.restSeconds)})`, value: 'rest' });
    opts.push({ text: 'History & records', value: 'history' });
    opts.push({ text: 'Remove exercise', value: 'remove', destructive: true });
    const choice = await dialog.menu({ title: ex.name, options: opts });
    if (choice === 'note') return void editNote();
    if (choice === 'pin') return void editPinned();
    if (choice === 'replace') {
      const logged = sets.filter((s) => s.completed).length;
      if (
        logged &&
        !(await dialog.confirm({
          title: `Replace ${ex.name}?`,
          message: `${logged} completed set${logged === 1 ? '' : 's'} will move to the new exercise. Unticked sets are refilled from the last time you did it.`,
          confirmText: 'Choose exercise',
        }))
      )
        return;
      return onReplace(ex.bodyPart);
    }
    if (choice === 'superset') return void pickSupersetPartner();
    if (choice === 'unsuperset') return store.leaveSuperset(we.id);
    if (choice === 'up') return store.moveWorkoutExercise(we.id, -1);
    if (choice === 'down') return store.moveWorkoutExercise(we.id, 1);
    if (choice === 'rest') return void editRest();
    if (choice === 'history') return nav.push({ name: 'exerciseDetail', id: ex.id });
    if (choice === 'remove') return void remove();
  };

  const hasWeight = lt === 'weight_reps' || lt === 'weighted_bodyweight' || lt === 'assisted_bodyweight';
  const cols: Cols = {
    hasWeight,
    hasReps: lt !== 'duration' && lt !== 'distance_duration',
    hasDistance: lt === 'distance_duration',
    hasDuration: lt === 'duration' || lt === 'distance_duration',
  };
  const done = sets.filter((x) => x.completed).length;
  let n = 0;

  return (
    <Card style={superset && { marginTop: superset.index > 0 ? 2 : 6, marginBottom: superset.index < superset.size - 1 ? 2 : 6 }}>
      {superset && <View pointerEvents="none" style={[local.supersetBar, { backgroundColor: t.accent }]} />}
      <View style={styles.rowBetween}>
        <Pressable onPress={() => nav.push({ name: 'exerciseDetail', id: ex.id })} style={{ flex: 1 }} accessibilityRole="link">
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 17, letterSpacing: -0.2 }}>{ex.name}</Text>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600', marginTop: 1 }}>
            {done}/{sets.length} sets done
            {superset ? (
              <Text style={{ color: t.accentText, fontWeight: '800' }}>
                {'  ·  '}Superset {superset.letter}
                {superset.index + 1}
              </Text>
            ) : null}
          </Text>
        </Pressable>
        {/* Plates only make sense for a loaded bar, not dumbbells, cables or machines. */}
        {lt === 'weight_reps' && (ex.equipment === 'barbell' || ex.equipment === 'smith_machine') && (
          <IconButton name="calculator-outline" label="Plate calculator" onPress={() => setPlates(true)} />
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`More options for ${ex.name}`} hitSlop={10} style={local.more} onPress={openMenu}>
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
        {cols.hasWeight && (
          <Text style={[local.head, local.cNum, { color: t.muted }]}>
            {lt === 'assisted_bodyweight' ? '−' : lt === 'weighted_bodyweight' ? '+' : ''}
            {prefs.weightUnit.toUpperCase()}
          </Text>
        )}
        {cols.hasDistance && <Text style={[local.head, local.cNum, { color: t.muted }]}>{prefs.distanceUnit.toUpperCase()}</Text>}
        {cols.hasDuration && <Text style={[local.head, local.cNum, { color: t.muted }]}>SEC</Text>}
        {cols.hasReps && <Text style={[local.head, local.cNum, { color: t.muted }]}>REPS</Text>}
        <View style={local.cCheck} />
      </View>
      {sets.map((s, i) => {
        const idx = s.kind === 'warmup' ? -1 : n++;
        return (
          <SetRow
            key={s.id}
            s={s}
            label={KIND_LABEL[s.kind] || String(idx + 1)}
            prev={idx >= 0 ? prev[idx] : undefined}
            above={i > 0 ? sets[i - 1] : undefined}
            prefs={prefs}
            cols={cols}
            onDone={() => onSetDone(we, ex, s)}
          />
        );
      })}
      <Button small title="Add set" icon="add" onPress={() => store.addSet(we.id)} style={{ marginTop: 10 }} />
      {plates && <PlateModal prefs={prefs} kg={sets.find((s) => !s.completed)?.weight ?? sets[0]?.weight ?? 60} onClose={() => setPlates(false)} />}
    </Card>
  );
}

const SET_FIELDS = ['weight', 'reps', 'distance', 'duration'] as const;

function SetRow({
  s,
  label: setLabel,
  prev,
  above,
  prefs,
  cols,
  onDone,
}: {
  s: WorkoutSet;
  label: string;
  /** Same set last time (for the PREVIOUS column and as the first auto-fill source). */
  prev?: WorkoutSet;
  /** The set above in this workout (auto-fill source when there's no previous). */
  above?: WorkoutSet;
  prefs: Prefs;
  cols: Cols;
  onDone: () => void;
}) {
  const store = useStore();
  const t = useTheme();
  const dialog = useDialog();
  const [focused, setFocused] = useState<Field | null>(null);
  const up = (patch: Partial<WorkoutSet>) => store.update('sets', s.id, patch);
  const dist = prefs.distanceUnit === 'mi' ? 1609.344 : 1000;

  // Empty fields show what you'd most likely lift (last time, else the set above) in grey, and
  // ticking the set fills them in.
  const hint = (f: Field) => prev?.[f] ?? above?.[f] ?? null;
  const show = (f: Field, v: number | null) =>
    v == null ? null : f === 'weight' ? +fromKg(v, prefs.weightUnit).toFixed(2) : f === 'distance' ? +(v / dist).toFixed(3) : v;
  const store_ = (f: Field, v: number | null) =>
    v == null ? null : f === 'weight' ? toKg(v, prefs.weightUnit) : f === 'distance' ? v * dist : f === 'reps' ? Math.round(v) : v;
  const step: Record<Field, number> = { weight: prefs.weightUnit === 'kg' ? 2.5 : 5, reps: 1, distance: 0.1, duration: 5 };
  const bump = (f: Field, dir: 1 | -1) => {
    const base = show(f, s[f]) ?? show(f, hint(f)) ?? 0;
    const next = Math.max(0, +(base + dir * step[f]).toFixed(3));
    up({ [f]: store_(f, next) });
    void Haptics.selectionAsync();
  };

  const prevText = !prev
    ? '—'
    : cols.hasWeight
      ? `${showWeight(prev.weight, prefs)}×${prev.reps ?? 0}`
      : cols.hasDistance
        ? `${((prev.distance ?? 0) / dist).toFixed(1)}`
        : cols.hasDuration
          ? formatDuration(prev.duration)
          : `${prev.reps ?? 0}`;

  const toggle = () => {
    if (s.completed) return up({ completed: false });
    Keyboard.dismiss(); // ticking a set means you are done typing it
    const fill: Partial<WorkoutSet> = {};
    for (const f of SET_FIELDS) if (s[f] == null && hint(f) != null) fill[f] = hint(f);
    up({ ...fill, completed: true });
    onDone();
  };

  const remove = () => {
    const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...copy } = s;
    store.remove('sets', s.id);
    dialog.toast(`Set ${setLabel} deleted`, { text: 'Undo', onPress: () => store.insert('sets', copy) });
  };
  const openMenu = async () => {
    const mark = (k: SetKind, text: string) => ({ text: s.kind === k ? `✓ ${text}` : text, value: k });
    const choice = await dialog.menu({
      title: `Set ${setLabel}`,
      message: 'Tip: swipe a set to the left to delete it.',
      options: [
        mark('normal', 'Normal set'),
        mark('warmup', 'Warm-up'),
        mark('drop', 'Drop set'),
        mark('failure', 'Failure'),
        { text: 'Delete set', value: 'delete', destructive: true },
      ],
    });
    if (choice === 'delete') remove();
    else if (choice) up({ kind: choice });
  };

  // Swipe left to delete. Only horizontal drags are claimed, so the list still scrolls.
  const x = useRef(new Animated.Value(0)).current;
  const removeRef = useRef(remove);
  removeRef.current = remove;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderMove: (_, g) => x.setValue(Math.min(0, g.dx)),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -110 || g.vx < -0.9) {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            Animated.timing(x, { toValue: -600, duration: 160, useNativeDriver: true }).start(() => removeRef.current());
          } else Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [x],
  );

  const field = (f: Field) => {
    const label = { weight: `weight in ${prefs.weightUnit}`, reps: 'reps', distance: `distance in ${prefs.distanceUnit}`, duration: 'seconds' }[f];
    const h = show(f, hint(f));
    return (
      <NumInput
        key={f}
        style={[local.cNum, s.completed && { backgroundColor: 'transparent' }]}
        value={show(f, s[f])}
        placeholder={h == null ? undefined : String(h)}
        accessibilityLabel={`Set ${setLabel} ${label}`}
        onFocus={() => setFocused(f)}
        onBlur={() => setFocused((cur) => (cur === f ? null : cur))}
        onChange={(v) => up({ [f]: store_(f, v) })}
      />
    );
  };
  const unit = (f: Field) => (f === 'weight' ? ` ${prefs.weightUnit}` : f === 'distance' ? ` ${prefs.distanceUnit}` : f === 'duration' ? ' s' : '');

  return (
    <View>
      <View style={local.swipeWrap}>
        <Animated.View
          pointerEvents="none"
          style={[local.deleteBehind, { backgroundColor: t.danger, opacity: x.interpolate({ inputRange: [-90, -10, 0], outputRange: [1, 0.3, 0] }) }]}
        >
          <Ionicons name="trash" size={18} color="#fff" />
        </Animated.View>
        <Animated.View {...pan.panHandlers} style={[styles.row, local.setRow, { backgroundColor: t.surface, transform: [{ translateX: x }] }]}>
          {/* A separate layer rather than a background on the row: Android drops the corner radius when a background is added after mount. */}
          {s.completed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.doneRow, borderRadius: 12 }]} />}
          <Pressable style={local.cSet} onPress={openMenu} onLongPress={openMenu} accessibilityRole="button" accessibilityLabel={`Set ${setLabel} options`} hitSlop={6}>
            <SetBadge kind={s.kind} text={setLabel} />
          </Pressable>
          <Pressable
            style={local.cPrev}
            onPress={prev ? () => up({ weight: prev.weight, reps: prev.reps, distance: prev.distance, duration: prev.duration }) : undefined}
            accessibilityLabel={prev ? `Use previous: ${prevText}` : undefined}
          >
            <T small muted lines={1}>
              {prevText}
            </T>
          </Pressable>
          {cols.hasWeight && field('weight')}
          {cols.hasDistance && field('distance')}
          {cols.hasDuration && field('duration')}
          {cols.hasReps && field('reps')}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: s.completed }}
            accessibilityLabel={`Set ${setLabel} done`}
            style={[local.cCheck, local.check, { backgroundColor: s.completed ? t.accent : t.surface2 }]}
            onPress={toggle}
          >
            <Ionicons name="checkmark" size={20} color={s.completed ? t.onAccent : t.muted} />
          </Pressable>
        </Animated.View>
      </View>
      {focused && (
        // Steppers under the row while typing, for small changes without the keypad.
        <View style={local.stepper}>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', flex: 1 }}>{focused.toUpperCase()}</Text>
          {([-1, 1] as const).map((dir) => (
            <Pressable
              key={dir}
              onPress={() => bump(focused, dir)}
              accessibilityRole="button"
              accessibilityLabel={`${dir < 0 ? 'Decrease' : 'Increase'} ${focused} by ${step[focused]}`}
              style={({ pressed }) => [local.stepBtn, { backgroundColor: t.accentSoft, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={{ color: t.accentText, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] }}>
                {dir < 0 ? '−' : '+'}
                {step[focused]}
                {unit(focused)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
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
        <Pressable accessible={false} style={[local.sheet, { backgroundColor: t.surface }]}>
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

const local = StyleSheet.create({
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  titleInput: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 2 },
  supersetBar: { position: 'absolute', left: 0, top: 18, bottom: 18, width: 4, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  headRow: { marginTop: 12, paddingHorizontal: 4 },
  head: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  swipeWrap: { marginTop: 4 },
  deleteBehind: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 12, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 18 },
  setRow: { paddingVertical: 4, paddingHorizontal: 4, borderRadius: 12 },
  // Number columns flex (capped) so a full row still fits a 320pt-wide phone with larger text.
  cSet: { width: 28 },
  cPrev: { flex: 1.2, minWidth: 0 },
  cNum: { flex: 1, minWidth: 0, maxWidth: 72, textAlign: 'center', borderRadius: 10 },
  cCheck: { width: 42 },
  check: { height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 2 },
  stepBtn: { minWidth: 76, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
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
});
