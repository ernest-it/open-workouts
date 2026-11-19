import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import {
  BODY_PARTS,
  EQUIPMENT,
  LOG_TYPES,
  exerciseHistory,
  exerciseRecords,
  exerciseSeries,
  formatDuration,
  fromKg,
  type BodyPart,
  type Equipment,
  type LogType,
} from '@open-workouts/shared';
import { useNav } from '../nav';
import { usePrefs, useStore } from '../state';
import { Button, Card, Chips, H2, Input, Screen, Sheet, T, formatDate, label, showWeight, styles, useTheme } from '../ui';
import { useDialog } from '../dialog';

export function ExercisesScreen() {
  const store = useStore();
  const nav = useNav();
  const t = useTheme();
  const [q, setQ] = useState('');
  const [part, setPart] = useState('all');
  const dialog = useDialog();
  const [creating, setCreating] = useState(false);
  const list = store
    .exercises()
    .filter((e) => (part === 'all' || e.bodyPart === part) && e.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Same width cap and header style as the other tabs (see Screen in ui.tsx). */}
      <View style={[styles.sheetBody, { paddingHorizontal: 16, paddingTop: 16 }]}>
      <View style={styles.rowBetween}>
        <T bold style={styles.h1}>
          Exercises
        </T>
        <Button small variant="primary" title="+ New" onPress={() => setCreating(true)} />
      </View>
      <Input placeholder="Search" value={q} onChangeText={setQ} autoCorrect={false} />
      <Chips options={['all', ...BODY_PARTS].map((p) => ({ value: p, label: label(p) }))} value={part} onChange={setPart} />
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <T muted style={{ marginTop: 16 }}>
            No exercises match. Tap + New to create one.
          </T>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => nav.push({ name: 'exerciseDetail', id: item.id })}
            style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderColor: t.border }}
          >
            <T bold>{item.name}</T>
            <T small muted>
              {label(item.bodyPart)}
              {item.id.startsWith('builtin:') ? '' : ' · custom'}
            </T>
          </Pressable>
        )}
      />
      </View>
      {creating && (
        <NewExercise
          onClose={(name) => {
            setCreating(false);
            if (name) dialog.toast(`Created "${name}"`);
          }}
        />
      )}
    </View>
  );
}

function NewExercise({ onClose }: { onClose: (created?: string) => void }) {
  const store = useStore();
  const t = useTheme();
  const [name, setName] = useState('');
  const [logType, setLogType] = useState<LogType>('weight_reps');
  const [equipment, setEquipment] = useState<Equipment>('barbell');
  const [bodyPart, setBodyPart] = useState<BodyPart>('chest');
  return (
    <Sheet onClose={() => onClose()}>
      <Screen title="New exercise">
        <View style={{ backgroundColor: t.bg }}>
          <Input value={name} onChangeText={setName} placeholder="Name, e.g. Landmine Press (Barbell)" autoFocus />
          <T muted>Type</T>
          <Chips options={LOG_TYPES.map((v) => ({ value: v, label: label(v) }))} value={logType} onChange={setLogType} />
          <T muted>Equipment</T>
          <Chips options={EQUIPMENT.map((v) => ({ value: v, label: label(v) }))} value={equipment} onChange={setEquipment} />
          <T muted>Body part</T>
          <Chips options={BODY_PARTS.map((v) => ({ value: v, label: label(v) }))} value={bodyPart} onChange={setBodyPart} />
          <Button
            title="Save"
            variant="primary"
            disabled={!name.trim()}
            onPress={() => {
              store.insert('exercises', { name: name.trim(), logType, equipment, bodyPart, instructions: null });
              onClose();
            }}
          />
          <Button title="Cancel" variant="ghost" onPress={() => onClose()} />
        </View>
      </Screen>
    </Sheet>
  );
}

export function ExerciseDetailScreen({ id }: { id: string }) {
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const t = useTheme();
  const [tab, setTab] = useState<'records' | 'history' | 'chart'>('records');
  const ex = store.get('exercises', id);
  const ds = store.dataset;
  const rec = useMemo(() => (ex ? exerciseRecords(ds, ex) : null), [ds, ex]);
  const hist = useMemo(() => exerciseHistory(ds, id), [ds, id]);
  const series = useMemo(() => (ex ? exerciseSeries(ds, ex) : []), [ds, ex]);
  if (!ex || !rec)
    return (
      <Screen>
        <T>Exercise not found.</T>
      </Screen>
    );
  const w = (kg?: number) => (kg == null ? '—' : `${showWeight(kg, prefs)} ${prefs.weightUnit}`);
  const weighted = ex.logType === 'weight_reps' || ex.logType === 'weighted_bodyweight';
  const points = series.map((p) => (weighted ? fromKg(p.best1RM, prefs.weightUnit) : p.maxReps)).filter((v) => v > 0);
  const max = Math.max(1, ...points);

  return (
    <Screen title={ex.name}>
      <Chips
        options={[
          { value: 'records' as const, label: 'Records' },
          { value: 'history' as const, label: 'History' },
          { value: 'chart' as const, label: 'Chart' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'records' && (
        <Card>
          {weighted ? (
            <>
              <Row
                k="Estimated 1RM"
                v={rec.estimated1RM ? `${+fromKg(rec.estimated1RM.value, prefs.weightUnit).toFixed(1)} ${prefs.weightUnit}` : '—'}
              />
              <Row k="Max weight" v={w(rec.maxWeight?.value)} />
              <Row k="Max volume (set)" v={w(rec.maxSetVolume?.value)} />
              <Row k="Max volume (session)" v={w(rec.maxSessionVolume?.value)} />
              <H2>Rep records</H2>
              {Object.entries(rec.repMaxes).map(([reps, r]) => (
                <Row key={reps} k={`${reps} rep${reps === '1' ? '' : 's'}`} v={`${w(r.value)} · ${formatDate(r.at)}`} />
              ))}
            </>
          ) : (
            <>
              <Row k="Max reps" v={String(rec.maxReps?.value ?? '—')} />
              <Row k="Longest duration" v={rec.longestDuration ? formatDuration(rec.longestDuration.value) : '—'} />
              <Row
                k="Longest distance"
                v={rec.longestDistance ? `${(rec.longestDistance.value / (prefs.distanceUnit === 'mi' ? 1609.344 : 1000)).toFixed(2)} ${prefs.distanceUnit}` : '—'}
              />
            </>
          )}
        </Card>
      )}
      {tab === 'history' &&
        hist.map((h) => (
          <Card key={h.workoutExercise.id} onPress={() => nav.push({ name: 'workoutDetail', id: h.workout.id })}>
            <View style={styles.rowBetween}>
              <T bold>{h.workout.name}</T>
              <T small muted>
                {formatDate(h.workout.startedAt)}
              </T>
            </View>
            {h.sets.map((s) => (
              <T key={s.id} small>
                {s.kind !== 'normal' ? `${s.kind[0]!.toUpperCase()} ` : ''}
                {s.weight != null ? `${w(s.weight)} × ` : ''}
                {s.reps ?? ''}
                {s.duration != null ? ` ${formatDuration(s.duration)}` : ''}
              </T>
            ))}
          </Card>
        ))}
      {tab === 'chart' && (
        <Card>
          <T muted small>
            {weighted ? `Best set, estimated 1RM (${prefs.weightUnit})` : 'Max reps'} per session
          </T>
          {points.length < 2 ? (
            <T muted>Not enough data yet.</T>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 2, marginTop: 8 }}>
              {points.slice(-40).map((v, i) => (
                <View key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, backgroundColor: t.accent, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
              ))}
            </View>
          )}
          {points.length >= 2 && (
            <T small muted>
              Latest {+points[points.length - 1]!.toFixed(1)} · best {+max.toFixed(1)}
            </T>
          )}
        </Card>
      )}
    </Screen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={[styles.rowBetween, { paddingVertical: 4 }]}>
      <T muted>{k}</T>
      <T bold>{v}</T>
    </View>
  );
}
