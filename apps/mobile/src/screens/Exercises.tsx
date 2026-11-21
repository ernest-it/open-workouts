import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BODY_PARTS,
  EQUIPMENT,
  LOG_TYPES,
  exerciseHistory,
  exerciseRecords,
  exerciseSeries,
  formatDuration,
  formatNumber,
  fromKg,
  type BodyPart,
  type Equipment,
  type LogType,
} from '@open-workouts/shared';
import { useNav } from '../nav';
import { usePrefs, useStore } from '../state';
import { Button, Card, Chips, H2, Input, Screen, SearchInput, Segmented, Sheet, T, Title, formatDate, label, showWeight, styles, useTheme } from '../ui';
import { ExerciseAvatar } from './Workout';
import { HeaderActions } from '../ProfileButton';
import { LineChart, RANGES, inRange, type Range } from '../chart';
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
      <View style={[styles.sheetBody, { paddingHorizontal: 16, paddingTop: 12 }]}>
      <Title
        title="Exercises"
        right={
          <HeaderActions>
            <Button small variant="primary" icon="add" title="New" onPress={() => setCreating(true)} />
          </HeaderActions>
        }
      />
      <SearchInput placeholder={`Search ${store.exercises().length} exercises`} value={q} onChangeText={setQ} />
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
            accessibilityRole="button"
            style={({ pressed }) => [local.row, pressed && { backgroundColor: t.surface2 }]}
          >
            <ExerciseAvatar name={item.name} />
            <View style={{ flex: 1 }}>
              <T bold>{item.name}</T>
              <T small muted>
                {label(item.bodyPart)} · {label(item.equipment)}
                {item.id.startsWith('builtin:') ? '' : ' · custom'}
              </T>
            </View>
            <Ionicons name="chevron-forward" size={16} color={t.muted} />
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
  const [metric, setMetric] = useState<Metric>('best1RM');
  const [range, setRange] = useState<Range>('3m');
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
  const key = weighted ? metric : 'maxReps';
  const points = inRange(
    series.map((p) => ({ at: p.at, value: key === 'maxReps' ? p[key] : fromKg(p[key], prefs.weightUnit) })).filter((p) => p.value > 0),
    range,
  );
  const fmt = (v: number) => (key === 'maxReps' ? `${Math.round(v)} reps` : `${formatNumber(v, key === 'volume' ? 0 : 1)} ${prefs.weightUnit}`);

  return (
    <Screen title={ex.name} subtitle={`${label(ex.bodyPart)} · ${label(ex.equipment)}`}>
      <View style={{ marginVertical: 6 }}>
        <Segmented
          options={[
            { value: 'records' as const, label: 'Records' },
            { value: 'history' as const, label: 'History' },
            { value: 'chart' as const, label: 'Chart' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {store.pinnedNote(ex.id) ? (
        <View style={[local.note, { backgroundColor: t.accentSoft }]}>
          <Ionicons name="pin" size={14} color={t.accentText} style={{ marginTop: 2 }} />
          <T small style={{ flex: 1 }}>
            {store.pinnedNote(ex.id)}
          </T>
        </View>
      ) : null}
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
          {weighted && <Chips options={METRICS} value={metric} onChange={setMetric} />}
          <T muted small style={{ marginBottom: 6 }}>
            {METRICS.find((m) => m.value === (weighted ? metric : 'maxReps'))!.long} per session
          </T>
          <LineChart points={points} label={METRICS.find((m) => m.value === (weighted ? metric : 'maxReps'))!.long} format={fmt} />
          <View style={{ marginTop: 10 }}>
            <Segmented options={RANGES} value={range} onChange={setRange} />
          </View>
        </Card>
      )}
    </Screen>
  );
}

type Metric = 'best1RM' | 'maxWeight' | 'volume' | 'maxReps';
const METRICS: { value: Metric; label: string; long: string }[] = [
  { value: 'best1RM', label: 'Est. 1RM', long: 'Estimated 1RM of the best set' },
  { value: 'maxWeight', label: 'Top weight', long: 'Heaviest weight' },
  { value: 'volume', label: 'Volume', long: 'Total volume' },
  { value: 'maxReps', label: 'Reps', long: 'Most reps in a set' },
];

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={[styles.rowBetween, { paddingVertical: 6 }]}>
      <T muted>{k}</T>
      <T bold style={{ fontVariant: ['tabular-nums'] }}>
        {v}
      </T>
    </View>
  );
}

const local = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 14 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 10, marginVertical: 6 },
});
