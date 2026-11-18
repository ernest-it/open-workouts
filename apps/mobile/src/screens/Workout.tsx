import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
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
import { Button, Card, Chips, H2, Input, NumInput, Screen, Sheet, T, label, showWeight, styles, useTheme } from '../ui';

export function WorkoutScreen() {
  const store = useStore();
  const active = store.activeWorkout();
  if (active) return <ActiveWorkout workout={active} />;
  return <StartScreen />;
}

function StartScreen() {
  const store = useStore();
  const templates = store.all('templates').sort((a, b) => a.position - b.position);
  const folders = store.all('templateFolders').sort((a, b) => a.position - b.position);
  const groups = [{ id: null as string | null, name: 'My Templates' }, ...folders];
  return (
    <Screen title="Start Workout">
      <Button title="Start an empty workout" variant="primary" onPress={() => store.startWorkout()} />
      {groups.map((g) => {
        const list = templates.filter((t) => t.folderId === g.id);
        if (!list.length) return null;
        return (
          <View key={g.id ?? 'root'}>
            <H2>{g.name}</H2>
            {list.map((t) => {
              const tes = store.all('templateExercises').filter((x) => x.templateId === t.id).sort((a, b) => a.position - b.position);
              return (
                <Card key={t.id} onPress={() => store.startWorkout({ templateId: t.id })}>
                  <T bold>{t.name}</T>
                  {tes.slice(0, 5).map((te) => (
                    <T key={te.id} small muted>
                      {store.all('templateSets').filter((s) => s.templateExerciseId === te.id).length} × {store.get('exercises', te.exerciseId)?.name}
                    </T>
                  ))}
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

  const finish = () => {
    const incomplete = store.all('sets').filter((s) => s.workoutId === workout.id && !s.completed).length;
    const doIt = () => {
      store.finishWorkout(workout.id);
      nav.switchTab('history');
      nav.push({ name: 'workoutDetail', id: workout.id });
    };
    if (!incomplete) return doIt();
    Alert.alert('Finish workout?', `${incomplete} incomplete set(s) will be discarded.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finish', onPress: doIt },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={styles.rowBetween}>
          <Input
            value={workout.name}
            onChangeText={(v) => store.update('workouts', workout.id, { name: v.replace(/\n/g, ' ') })}
            // Multiline so long names wrap instead of scrolling out of view on narrow phones.
            multiline
            submitBehavior="blurAndSubmit"
            accessibilityLabel="Workout name"
            style={{ flex: 1, fontSize: 22, fontWeight: '700', borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 }}
          />
          {editing ? (
            <Button title="Done" variant="primary" small onPress={() => onDone?.()} />
          ) : (
            <>
              <T muted>{formatDuration((now - workout.startedAt) / 1000)}</T>
              <Button title="Finish" variant="success" small onPress={finish} />
            </>
          )}
        </View>
        <Input
          placeholder="Workout notes"
          value={workout.notes ?? ''}
          multiline
          onChangeText={(v) => store.update('workouts', workout.id, { notes: v || null })}
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
        <Button title="+ Add exercise" onPress={() => setPicking(true)} />
        {!editing && (
          <Button
            title="Cancel workout"
            variant="danger"
            onPress={() =>
              Alert.alert('Discard workout?', 'This cannot be undone.', [
                { text: 'Keep', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: () => store.deleteWorkout(workout.id) },
              ])
            }
          />
        )}
      </Screen>

      {rest && (
        <View style={[local.restBar, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={[local.restProgress, { backgroundColor: t.accent, width: `${Math.max(0, ((rest.until - now) / (rest.total * 1000)) * 100)}%` }]} />
          <T bold>Rest {formatDuration(Math.max(0, (rest.until - now) / 1000))}</T>
          <View style={styles.row}>
            <Button small title="-15" onPress={() => setRest({ ...rest, until: rest.until - 15_000 })} />
            <Button small title="+15" onPress={() => setRest({ until: rest.until + 15_000, total: rest.total + 15 })} />
            <Button small title="Skip" onPress={() => setRest(null)} />
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
const NEXT_KIND: Record<SetKind, SetKind> = { normal: 'warmup', warmup: 'drop', drop: 'failure', failure: 'normal' };

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
  const hasWeight = lt === 'weight_reps' || lt === 'weighted_bodyweight' || lt === 'assisted_bodyweight';
  const hasReps = lt !== 'duration' && lt !== 'distance_duration';
  const hasDistance = lt === 'distance_duration';
  const hasDuration = lt === 'duration' || lt === 'distance_duration';
  const dist = prefs.distanceUnit === 'mi' ? 1609.344 : 1000;
  let n = 0;

  return (
    <Card>
      <View style={styles.rowBetween}>
        <Pressable onPress={() => nav.push({ name: 'exerciseDetail', id: ex.id })} style={{ flex: 1 }}>
          <Text style={{ color: t.accent, fontWeight: '700', fontSize: 16 }}>{ex.name}</Text>
        </Pressable>
        {lt === 'weight_reps' && <Button small variant="ghost" title="Plates" onPress={() => setPlates(true)} />}
        <Button
          small
          variant="danger"
          title="✕"
          onPress={() =>
            Alert.alert(`Remove ${ex.name}?`, undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => store.removeWorkoutExercise(we.id) },
            ])
          }
        />
      </View>
      <View style={[styles.row, local.headRow]}>
        <T small muted style={local.cSet} lines={1}>
          SET
        </T>
        <T small muted style={local.cPrev} lines={1}>
          PREV
        </T>
        {hasWeight && (
          <T small muted style={local.cNum}>
            {lt === 'assisted_bodyweight' ? '-' : lt === 'weighted_bodyweight' ? '+' : ''}
            {prefs.weightUnit.toUpperCase()}
          </T>
        )}
        {hasDistance && (
          <T small muted style={local.cNum}>
            {prefs.distanceUnit.toUpperCase()}
          </T>
        )}
        {hasDuration && (
          <T small muted style={local.cNum}>
            SEC
          </T>
        )}
        {hasReps && (
          <T small muted style={local.cNum}>
            REPS
          </T>
        )}
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
      <Button small title="+ Add set" onPress={() => store.addSet(we.id)} style={{ marginTop: 6 }} />
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
  const up = (patch: Partial<WorkoutSet>) => store.update('sets', s.id, patch);
  const dist = prefs.distanceUnit === 'mi' ? 1609.344 : 1000;
  const kindColor = { normal: t.text, warmup: t.warn, drop: t.accent, failure: t.danger }[s.kind];
  return (
    <View style={[styles.row, local.setRow, s.completed && { backgroundColor: t.doneRow }]}>
      <Pressable
        style={local.cSet}
        onPress={() => up({ kind: NEXT_KIND[s.kind] })}
        onLongPress={() =>
          Alert.alert('Delete set?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => store.remove('sets', s.id) },
          ])
        }
      >
        <Text style={{ color: kindColor, fontWeight: '700', textAlign: 'center' }}>{setLabel}</Text>
      </Pressable>
      <Pressable style={local.cPrev} onPress={onUsePrev} accessibilityLabel={onUsePrev ? `Use previous: ${prevText}` : undefined}>
        <T small muted lines={1}>
          {prevText}
        </T>
      </Pressable>
      {cols.hasWeight && (
        <NumInput
          style={local.cNum}
          value={s.weight == null ? null : +fromKg(s.weight, prefs.weightUnit).toFixed(2)}
          onChange={(v) => up({ weight: v == null ? null : toKg(v, prefs.weightUnit) })}
        />
      )}
      {cols.hasDistance && (
        <NumInput style={local.cNum} value={s.distance == null ? null : +(s.distance / dist).toFixed(3)} onChange={(v) => up({ distance: v == null ? null : v * dist })} />
      )}
      {cols.hasDuration && <NumInput style={local.cNum} value={s.duration} onChange={(v) => up({ duration: v })} />}
      {cols.hasReps && <NumInput style={local.cNum} value={s.reps} onChange={(v) => up({ reps: v == null ? null : Math.round(v) })} />}
      <Pressable
        accessibilityLabel="Complete set"
        style={[local.cCheck, local.check, { backgroundColor: s.completed ? t.success : t.surface2 }]}
        onPress={() => {
          up({ completed: !s.completed });
          if (!s.completed && !editing) onCompleted();
        }}
      >
        <Text style={{ color: s.completed ? '#fff' : t.muted, fontWeight: '800' }}>✓</Text>
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
              <View key={i} style={{ width: 30, height: 30 + p * 1.6, backgroundColor: t.accent, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{p}</Text>
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
        <Input placeholder="Search" value={q} onChangeText={setQ} autoCorrect={false} />
        <Chips options={parts.map((p) => ({ value: p, label: label(p) }))} value={part} onChange={setPart} />
        <FlatList
          data={list}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item)} style={[local.pickRow, { borderColor: t.border }]} accessibilityRole="button">
              <T bold style={{ flex: 1 }}>
                {item.name}
              </T>
              <T small muted>
                {label(item.bodyPart)}
              </T>
            </Pressable>
          )}
        />
      </View>
    </Sheet>
  );
}

const local = StyleSheet.create({
  headRow: { marginTop: 8, paddingHorizontal: 4 },
  setRow: { paddingVertical: 4, paddingHorizontal: 4, borderRadius: 6, marginTop: 2 },
  // Number columns flex (capped) so a full row still fits a 320pt-wide phone with larger text.
  cSet: { width: 28 },
  cPrev: { flex: 1.2, minWidth: 0 },
  cNum: { flex: 1, minWidth: 0, maxWidth: 72, textAlign: 'center' },
  cCheck: { width: 40 },
  check: { height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  restBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  restProgress: { position: 'absolute', left: 0, bottom: 0, height: 3 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 14, padding: 16 },
  pickRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
