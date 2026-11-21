import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDuration, isWorkingSet, workoutPRs, workoutSummary } from '@open-workouts/shared';
import { useNav } from '../nav';
import { usePrefs, useStore } from '../state';
import { Button, Card, Eyebrow, Pill, Screen, Stat, T, formatDate, showWeight, styles, useTheme } from '../ui';
import { ActiveWorkout, SetBadge } from './Workout';
import { useDialog } from '../dialog';

export function HistoryScreen() {
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const t = useTheme();
  const [limit, setLimit] = useState(30);
  const workouts = store
    .all('workouts')
    .filter((w) => w.endedAt != null)
    .sort((a, b) => b.startedAt - a.startedAt);
  return (
    <Screen title="History" subtitle={workouts.length ? `${workouts.length} workout${workouts.length === 1 ? '' : 's'} logged` : undefined}>
      {workouts.length === 0 && (
        <Card>
          <T bold style={{ fontSize: 17 }}>No workouts yet</T>
          <T small muted>
            Finished workouts show up here with their sets, volume and PRs.
          </T>
          <Button title="Start a workout" variant="primary" onPress={() => nav.switchTab('workout')} style={{ marginTop: 8 }} />
        </Card>
      )}
      {workouts.slice(0, limit).map((w, i) => {
        const sum = workoutSummary(store.dataset, w.id);
        const d = new Date(w.startedAt);
        const month = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        const prevMonth = i > 0 ? new Date(workouts[i - 1]!.startedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
        return (
          <View key={w.id}>
            {month !== prevMonth && <Eyebrow style={{ marginTop: i ? 18 : 4 }}>{month}</Eyebrow>}
            <Card onPress={() => nav.push({ name: 'workoutDetail', id: w.id })}>
              <View style={[styles.row, { alignItems: 'flex-start', gap: 14 }]}>
                <View style={[local.date, { backgroundColor: t.accentSoft }]}>
                  <Text style={{ color: t.accentText, fontSize: 11, fontWeight: '800' }}>
                    {d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                  </Text>
                  <Text style={{ color: t.text, fontSize: 20, fontWeight: '800', marginTop: -2 }}>{d.getDate()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <T bold style={{ fontSize: 17 }} lines={2}>
                    {w.name}
                  </T>
                  <View style={[styles.row, { flexWrap: 'wrap', gap: 6, marginTop: 6 }]}>
                    <Pill icon="time-outline" text={formatDuration(sum.durationSeconds)} tone="neutral" />
                    {sum.volume > 0 && <Pill icon="barbell-outline" text={`${showWeight(sum.volume, prefs)} ${prefs.weightUnit}`} tone="neutral" />}
                    <Pill icon="layers-outline" text={`${sum.setCount} set${sum.setCount === 1 ? '' : 's'}`} tone="neutral" />
                  </View>
                  <View style={{ marginTop: 8 }}>
                    {store.workoutExercises(w.id).map((we) => (
                      <T key={we.id} small muted lines={1}>
                        <Text style={{ color: t.text, fontWeight: '700' }}>{store.setsOf(we.id).filter(isWorkingSet).length} ×</Text>{' '}
                        {store.get('exercises', we.exerciseId)?.name ?? 'Unknown'}
                      </T>
                    ))}
                  </View>
                </View>
              </View>
            </Card>
          </View>
        );
      })}
      {workouts.length > limit && <Button title="Show more" variant="soft" onPress={() => setLimit(limit + 30)} />}
    </Screen>
  );
}

export function WorkoutDetailScreen({ id }: { id: string }) {
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const t = useTheme();
  const dialog = useDialog();
  const [editing, setEditing] = useState(false);
  const w = store.get('workouts', id);
  const prs = useMemo(() => new Map(workoutPRs(store.dataset, id).map((p) => [p.setId, p.types])), [store.dataset, id]);
  if (!w)
    return (
      <Screen>
        <T>Workout not found.</T>
      </Screen>
    );
  if (editing) return <ActiveWorkout workout={w} editing onDone={() => setEditing(false)} />;
  const sum = workoutSummary(store.dataset, id);
  const dist = prefs.distanceUnit === 'mi' ? 1609.344 : 1000;
  return (
    <Screen title={w.name} subtitle={formatDate(w.startedAt)} right={<Button small title="Edit" icon="create-outline" onPress={() => setEditing(true)} />}>
      <Card>
        <View style={styles.row}>
          <Stat value={formatDuration(sum.durationSeconds)} caption="Duration" />
          <Stat value={sum.volume > 0 ? `${showWeight(sum.volume, prefs)}` : '—'} caption={`Volume (${prefs.weightUnit})`} />
          <Stat value={String(sum.setCount)} caption="Sets" />
          <Stat value={String(prs.size)} caption={prs.size === 1 ? 'Record' : 'Records'} />
        </View>
      </Card>
      {w.notes ? (
        <View style={[local.notes, { backgroundColor: t.surface2 }]}>
          <T>{w.notes}</T>
        </View>
      ) : null}
      {store.workoutExercises(id).map((we) => {
        let n = 0;
        return (
          <Card key={we.id} onPress={() => nav.push({ name: 'exerciseDetail', id: we.exerciseId })}>
            <T bold style={{ fontSize: 17 }}>
              {store.get('exercises', we.exerciseId)?.name ?? 'Unknown'}
            </T>
            {we.notes ? (
              <View style={[local.notes, { backgroundColor: t.surface2 }]}>
                <T small muted>
                  {we.notes}
                </T>
              </View>
            ) : null}
            {store.setsOf(we.id).map((s) => (
              <View key={s.id} style={[styles.row, { paddingVertical: 3 }]}>
                <SetBadge kind={s.kind} text={s.kind === 'warmup' ? 'W' : s.kind === 'drop' ? 'D' : s.kind === 'failure' ? 'F' : String(++n)} />
                <T style={{ flex: 1, fontVariant: ['tabular-nums'] }}>
                  {s.weight != null ? `${showWeight(s.weight, prefs)} ${prefs.weightUnit} × ` : ''}
                  {s.reps ?? ''}
                  {s.distance != null ? ` ${(s.distance / dist).toFixed(2)} ${prefs.distanceUnit}` : ''}
                  {s.duration != null ? ` ${formatDuration(s.duration)}` : ''}
                  {s.rpe != null ? ` @${s.rpe}` : ''}
                </T>
                {prs.get(s.id) && <Pill icon="trophy" text={prs.get(s.id)!.join(', ')} />}
              </View>
            ))}
          </Card>
        );
      })}
      <Button
        title="Save as template"
        icon="bookmark-outline"
        variant="soft"
        style={{ marginTop: 8 }}
        onPress={async () => {
          const name = await dialog.prompt({
            title: 'Save as template',
            message: "Reuse this workout's exercises and sets from the Workout tab.",
            defaultValue: w.name,
            placeholder: 'Template name',
          });
          if (!name) return;
          store.saveWorkoutAsTemplate(id, name);
          dialog.toast(`Saved template "${name}"`, { text: 'View', onPress: () => nav.switchTab('workout') });
        }}
      />
      <Button
        title="Delete workout"
        variant="danger"
        onPress={async () => {
          const ok = await dialog.confirm({
            title: 'Delete workout?',
            message: `"${w.name}" and its sets are removed from your history and records.`,
            confirmText: 'Delete',
            destructive: true,
          });
          if (!ok) return;
          nav.pop();
          store.deleteWorkout(id);
          dialog.toast('Workout deleted');
        }}
      />
    </Screen>
  );
}

const local = StyleSheet.create({
  date: { width: 50, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  notes: { borderRadius: 12, padding: 10, marginTop: 8 },
});
