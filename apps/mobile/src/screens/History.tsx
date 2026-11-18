import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { formatDuration, isWorkingSet, workoutPRs, workoutSummary } from '@open-workouts/shared';
import { useNav } from '../nav';
import { usePrefs, useStore } from '../state';
import { Button, Card, Screen, T, formatDate, showWeight, styles, useTheme } from '../ui';
import { ActiveWorkout } from './Workout';

export function HistoryScreen() {
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const [limit, setLimit] = useState(30);
  const workouts = store
    .all('workouts')
    .filter((w) => w.endedAt != null)
    .sort((a, b) => b.startedAt - a.startedAt);
  return (
    <Screen title="History">
      {workouts.length === 0 && <T muted>No workouts yet.</T>}
      {workouts.slice(0, limit).map((w) => {
        const sum = workoutSummary(store.dataset, w.id);
        return (
          <Card key={w.id} onPress={() => nav.push({ name: 'workoutDetail', id: w.id })}>
            <View style={styles.rowBetween}>
              <T bold>{w.name}</T>
              <T small muted>
                {formatDate(w.startedAt)}
              </T>
            </View>
            <T small muted>
              {formatDuration(sum.durationSeconds)} · {showWeight(sum.volume, prefs)} {prefs.weightUnit} · {sum.setCount} sets
            </T>
            {store.workoutExercises(w.id).map((we) => (
              <T key={we.id} small>
                {store.setsOf(we.id).filter(isWorkingSet).length} × {store.get('exercises', we.exerciseId)?.name ?? 'Unknown'}
              </T>
            ))}
          </Card>
        );
      })}
      {workouts.length > limit && <Button title="Show more" onPress={() => setLimit(limit + 30)} />}
    </Screen>
  );
}

export function WorkoutDetailScreen({ id }: { id: string }) {
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const t = useTheme();
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
    <Screen
      title={w.name}
      right={<Button small title="Edit" onPress={() => setEditing(true)} />}
    >
      <T muted>
        {formatDate(w.startedAt)} · {formatDuration(sum.durationSeconds)} · {showWeight(sum.volume, prefs)} {prefs.weightUnit}
        {prs.size ? ` · 🏆 ${prs.size} PR${prs.size > 1 ? 's' : ''}` : ''}
      </T>
      {w.notes ? <T style={{ marginTop: 8 }}>{w.notes}</T> : null}
      {store.workoutExercises(id).map((we) => {
        let n = 0;
        return (
          <Card key={we.id} onPress={() => nav.push({ name: 'exerciseDetail', id: we.exerciseId })}>
            <T bold>{store.get('exercises', we.exerciseId)?.name ?? 'Unknown'}</T>
            {we.notes ? (
              <T small muted>
                {we.notes}
              </T>
            ) : null}
            {store.setsOf(we.id).map((s) => (
              <View key={s.id} style={styles.row}>
                <T bold style={{ width: 24, color: s.kind === 'warmup' ? t.warn : s.kind === 'drop' ? t.accent : s.kind === 'failure' ? t.danger : t.text }}>
                  {s.kind === 'warmup' ? 'W' : s.kind === 'drop' ? 'D' : s.kind === 'failure' ? 'F' : ++n}
                </T>
                <T>
                  {s.weight != null ? `${showWeight(s.weight, prefs)} ${prefs.weightUnit} × ` : ''}
                  {s.reps ?? ''}
                  {s.distance != null ? ` ${(s.distance / dist).toFixed(2)} ${prefs.distanceUnit}` : ''}
                  {s.duration != null ? ` ${formatDuration(s.duration)}` : ''}
                  {s.rpe != null ? ` @${s.rpe}` : ''}
                </T>
                {prs.get(s.id) && (
                  <T small style={{ color: t.warn }}>
                    🏆 {prs.get(s.id)!.join(', ')}
                  </T>
                )}
              </View>
            ))}
          </Card>
        );
      })}
      <Button
        title="Save as template"
        onPress={() => {
          const tpl = store.saveWorkoutAsTemplate(id);
          Alert.alert('Template saved', `"${tpl.name}" is now on the Workout tab.`);
        }}
      />
      <Button
        title="Delete workout"
        variant="danger"
        onPress={() =>
          Alert.alert('Delete workout?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                store.deleteWorkout(id);
                nav.pop();
              },
            },
          ])
        }
      />
    </Screen>
  );
}
