import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { findComparableWorkout, formatDuration, formatElapsed, workoutPRs, workoutSummary } from '@open-workouts/shared';
import { useNav } from '../nav';
import { usePrefs, useStore } from '../state';
import { Button, Card, Eyebrow, Input, Pill, Screen, Stat, T, formatDate, relativeDay, showVolume, showWeight, styles, useTheme } from '../ui';
import { useDialog } from '../dialog';

/** Shown right after finishing: the numbers, new records, and how it compares with last time. */
export function WorkoutDoneScreen({ id }: { id: string }) {
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const dialog = useDialog();
  const t = useTheme();
  const w = store.get('workouts', id);
  const ds = store.dataset;
  const prs = useMemo(() => workoutPRs(ds, id), [ds, id]);
  const sum = useMemo(() => workoutSummary(ds, id), [ds, id]);
  const last = useMemo(() => findComparableWorkout(ds, id), [ds, id]);
  const lastSum = useMemo(() => (last ? workoutSummary(ds, last.id) : null), [ds, last]);
  if (!w)
    return (
      <Screen>
        <T>Workout not found.</T>
      </Screen>
    );

  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const volDelta = lastSum ? pct(sum.volume, lastSum.volume) : null;
  const setById = new Map(store.all('sets').map((s) => [s.id, s]));
  const exName = (setId: string) => {
    const s = setById.get(setId);
    const we = s && store.get('workoutExercises', s.workoutExerciseId);
    return (we && store.get('exercises', we.exerciseId)?.name) ?? 'Exercise';
  };
  const fromTemplate = !!w.templateId && !!store.get('templates', w.templateId);

  return (
    <Screen>
      <View style={local.hero}>
        <View style={[local.badge, { backgroundColor: t.accent }]}>
          <Ionicons name="checkmark" size={40} color={t.onAccent} />
        </View>
        <Text style={[local.title, { color: t.text }]}>Workout complete</Text>
        <T muted>
          {w.name} · {formatDate(w.startedAt)}
        </T>
      </View>

      <Card>
        <View style={styles.row}>
          <Stat value={formatElapsed(sum.durationSeconds)} caption="Duration" />
          <Stat value={sum.volume > 0 ? showVolume(sum.volume, prefs) : '—'} caption={`Volume (${prefs.weightUnit})`} />
          <Stat value={String(sum.setCount)} caption="Sets" />
          <Stat value={String(prs.length)} caption={prs.length === 1 ? 'Record' : 'Records'} />
        </View>
      </Card>

      {last && lastSum && (
        <Card>
          <Eyebrow style={{ marginTop: 0 }}>Compared with {relativeDay(last.startedAt)}</Eyebrow>
          <T>
            {last.name}: {formatElapsed(lastSum.durationSeconds)}
            {lastSum.volume > 0 ? ` · ${showVolume(lastSum.volume, prefs)} ${prefs.weightUnit}` : ''} · {lastSum.setCount} sets
          </T>
          {volDelta != null && (
            <View style={[styles.row, { marginTop: 8 }]}>
              <Pill
                icon={volDelta >= 0 ? 'trending-up' : 'trending-down'}
                text={`${volDelta >= 0 ? '+' : ''}${volDelta}% volume`}
                tone={volDelta >= 0 ? 'accent' : 'neutral'}
              />
            </View>
          )}
        </Card>
      )}

      {prs.length > 0 && (
        <Card>
          <Eyebrow style={{ marginTop: 0 }}>New records</Eyebrow>
          {prs.map((p) => {
            const s = setById.get(p.setId);
            return (
              <View key={p.setId} style={[styles.rowBetween, { paddingVertical: 5 }]}>
                <View style={[styles.row, { flex: 1 }]}>
                  <Ionicons name="trophy" size={16} color={t.accentText} />
                  <T bold style={{ flex: 1 }} lines={1}>
                    {exName(p.setId)}
                  </T>
                </View>
                <T muted small>
                  {s?.weight != null ? `${showWeight(s.weight, prefs)} ${prefs.weightUnit} × ${s.reps ?? 0}` : `${s?.reps ?? 0} reps`} · {p.types.join(', ')}
                </T>
              </View>
            );
          })}
        </Card>
      )}

      <Eyebrow style={{ marginTop: 14 }}>How did it go?</Eyebrow>
      <Input
        placeholder="Add a note (optional)"
        value={w.notes ?? ''}
        multiline
        onChangeText={(v) => store.update('workouts', id, { notes: v || null })}
        style={{ backgroundColor: t.surface, minHeight: 70, textAlignVertical: 'top' }}
      />

      <Button title="Done" variant="primary" style={{ marginTop: 12 }} onPress={() => nav.pop()} />
      <View style={[styles.row, { justifyContent: 'center' }]}>
        <Button
          small
          variant="ghost"
          icon="time-outline"
          title="View in History"
          onPress={() => {
            nav.pop();
            nav.switchTab('history');
            nav.push({ name: 'workoutDetail', id });
          }}
        />
        {fromTemplate && store.workoutDiffersFromTemplate(id) && (
          <Button
            small
            variant="ghost"
            icon="sync-outline"
            title="Update template"
            onPress={async () => {
              const tplName = store.get('templates', w.templateId!)?.name ?? 'the template';
              const ok = await dialog.confirm({
                title: `Update "${tplName}"?`,
                message: 'Its exercises and sets are replaced with what you did today.',
                confirmText: 'Update',
              });
              if (!ok) return;
              store.updateTemplateFromWorkout(w.templateId!, id);
              dialog.toast('Template updated');
            }}
          />
        )}
        {!fromTemplate && (
          <Button
            small
            variant="ghost"
            icon="bookmark-outline"
            title="Save as template"
            onPress={async () => {
              const name = await dialog.prompt({ title: 'Save as template', defaultValue: w.name, placeholder: 'Template name' });
              if (!name) return;
              const tpl = store.saveWorkoutAsTemplate(id, name);
              store.update('workouts', id, { templateId: tpl.id });
              dialog.toast(`Saved template "${name}"`);
            }}
          />
        )}
      </View>
    </Screen>
  );
}

const local = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 24, marginBottom: 12, gap: 4 },
  badge: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
});
