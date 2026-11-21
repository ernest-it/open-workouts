import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDuration, formatElapsed, workoutPRs, workoutSummaries, workoutSummary, type Workout } from '@open-workouts/shared';
import { useNav } from '../nav';
import { usePrefs, useStore } from '../state';
import { Button, Card, Eyebrow, IconButton, Pill, Screen, SearchInput, Stat, T, formatDate, showVolume, showWeight, styles, useTheme } from '../ui';
import { ActiveWorkout, SetBadge } from './Workout';
import { useDialog } from '../dialog';
import { HeaderActions } from '../ProfileButton';

export function HistoryScreen() {
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const t = useTheme();
  const [limit, setLimit] = useState(30);
  // One pass over the data per change, not one scan per workout on every render.
  const workouts = useMemo(
    () =>
      store
        .all('workouts')
        .filter((w) => w.endedAt != null)
        .sort((a, b) => b.startedAt - a.startedAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.version],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summaries = useMemo(() => workoutSummaries(store.dataset), [store.version]);
  const [q, setQ] = useState('');
  const [calendar, setCalendar] = useState(false);
  const [day, setDay] = useState<number | null>(null); // local midnight of the picked day
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!query && day == null) return workouts;
    return workouts.filter((w) => {
      if (day != null && dayStart(w.startedAt) !== day) return false;
      if (!query) return true;
      if (w.name.toLowerCase().includes(query)) return true;
      return summaries.get(w.id)!.exercises.some((e) => store.get('exercises', e.exerciseId)?.name.toLowerCase().includes(query));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workouts, summaries, query, day]);
  return (
    <Screen
      title="History"
      subtitle={workouts.length ? `${workouts.length} workout${workouts.length === 1 ? '' : 's'} logged` : undefined}
      right={
        <HeaderActions>
          {workouts.length > 0 && (
            <IconButton
            name={calendar ? 'list' : 'calendar-outline'}
            label={calendar ? 'Show list' : 'Show calendar'}
            size={22}
            color={t.text}
            filled
            onPress={() => {
              setCalendar(!calendar);
              setDay(null);
            }}
          />
          )}
        </HeaderActions>
      }
    >
      {workouts.length > 0 && <SearchInput placeholder="Search workouts or exercises" value={q} onChangeText={setQ} returnKeyType="search" />}
      {calendar && <MonthCalendar workouts={workouts} day={day} onDay={(d) => setDay(d === day ? null : d)} />}
      {(query || day != null) && (
        <View style={[styles.rowBetween, { marginTop: 8 }]}>
          <T small muted>
            {shown.length} result{shown.length === 1 ? '' : 's'}
            {day != null ? ` on ${formatDate(day)}` : ''}
          </T>
          <Button
            small
            variant="ghost"
            title="Clear"
            onPress={() => {
              setQ('');
              setDay(null);
            }}
          />
        </View>
      )}
      {workouts.length === 0 && (
        <Card>
          <T bold style={{ fontSize: 17 }}>No workouts yet</T>
          <T small muted>
            Finished workouts show up here with their sets, volume and PRs.
          </T>
          <Button title="Start a workout" variant="primary" onPress={() => nav.switchTab('workout')} style={{ marginTop: 8 }} />
        </Card>
      )}
      {shown.slice(0, limit).map((w, i) => {
        const sum = summaries.get(w.id)!;
        const d = new Date(w.startedAt);
        const month = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        const prevMonth = i > 0 ? new Date(shown[i - 1]!.startedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
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
                    <Pill icon="time-outline" text={formatElapsed(sum.durationSeconds)} tone="neutral" />
                    {sum.volume > 0 && <Pill icon="barbell-outline" text={`${showVolume(sum.volume, prefs)} ${prefs.weightUnit}`} tone="neutral" />}
                    <Pill icon="layers-outline" text={`${sum.setCount} set${sum.setCount === 1 ? '' : 's'}`} tone="neutral" />
                  </View>
                  <View style={{ marginTop: 8 }}>
                    {sum.exercises.map((e, j) => (
                      <T key={j} small muted lines={1}>
                        <Text style={{ color: t.text, fontWeight: '700' }}>{e.workingSets} ×</Text> {store.get('exercises', e.exerciseId)?.name ?? 'Unknown'}
                      </T>
                    ))}
                  </View>
                </View>
              </View>
            </Card>
          </View>
        );
      })}
      {shown.length > limit && <Button title="Show more" variant="soft" onPress={() => setLimit(limit + 30)} />}
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
          <Stat value={formatElapsed(sum.durationSeconds)} caption="Duration" />
          <Stat value={sum.volume > 0 ? `${showVolume(sum.volume, prefs)}` : '—'} caption={`Volume (${prefs.weightUnit})`} />
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

const dayStart = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** A month grid (Monday first) with trained days filled in; tap a day to list its workouts. */
function MonthCalendar({ workouts, day, onDay }: { workouts: Workout[]; day: number | null; onDay: (d: number) => void }) {
  const t = useTheme();
  const [offset, setOffset] = useState(0); // months back from now
  const trained = useMemo(() => {
    const m = new Map<number, number>();
    for (const w of workouts) m.set(dayStart(w.startedAt), (m.get(dayStart(w.startedAt)) ?? 0) + 1);
    return m;
  }, [workouts]);
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1).getTime())];
  while (cells.length % 7) cells.push(null);
  const today = dayStart(Date.now());
  const count = cells.filter((c) => c != null && trained.has(c)).length;
  const oldest = workouts.length ? new Date(workouts[workouts.length - 1]!.startedAt) : now;
  const maxOffset = (now.getFullYear() - oldest.getFullYear()) * 12 + now.getMonth() - oldest.getMonth();
  return (
    <Card>
      <View style={styles.rowBetween}>
        <IconButton name="chevron-back" label="Previous month" onPress={() => setOffset(Math.min(maxOffset, offset + 1))} />
        <View style={{ alignItems: 'center' }}>
          <T bold>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</T>
          <T small muted>
            {count} day{count === 1 ? '' : 's'} trained
          </T>
        </View>
        <IconButton name="chevron-forward" label="Next month" onPress={() => setOffset(Math.max(0, offset - 1))} />
      </View>
      <View style={[styles.row, { marginTop: 8, gap: 0 }]}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', color: t.muted, fontSize: 11, fontWeight: '700' }}>
            {d}
          </Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, r) => (
        <View key={r} style={[styles.row, { gap: 0 }]}>
          {cells.slice(r * 7, r * 7 + 7).map((c, i) => {
            if (c == null) return <View key={i} style={{ flex: 1 }} />;
            const n = trained.get(c) ?? 0;
            const picked = c === day;
            return (
              <Pressable
                key={i}
                disabled={!n}
                onPress={() => onDay(c)}
                accessibilityRole="button"
                accessibilityState={{ selected: picked, disabled: !n }}
                accessibilityLabel={`${new Date(c).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}${n ? `, ${n} workout${n === 1 ? '' : 's'}` : ''}`}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 3 }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: picked ? t.accent : n ? t.accentSoft : 'transparent',
                  }}
                >
                  {/* Today's ring is its own layer: Android drops the fill of a rounded view that also has a border. */}
                  {c === today && <View pointerEvents="none" style={[local.todayRing, { borderColor: t.accentText }]} />}
                  <Text style={{ color: picked ? t.onAccent : n ? t.text : t.muted, fontWeight: n ? '800' : '500', fontSize: 14 }}>{new Date(c).getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </Card>
  );
}

const local = StyleSheet.create({
  todayRing: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 21, borderWidth: 1.5 },
  date: { width: 50, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  notes: { borderRadius: 12, padding: 10, marginTop: 8 },
});
