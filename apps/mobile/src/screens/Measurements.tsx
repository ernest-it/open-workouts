import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  MEASUREMENT_KINDS,
  MEASURE_GROUPS,
  formatNumber,
  fromKg,
  measureName,
  measureUnit as unitFor,
  measurementChange,
  measurementsByKind,
  toKg,
  type MeasurementKind,
} from '@open-workouts/shared';
import { usePrefs, useStore, type Prefs } from '../state';
import { useNav } from '../nav';
import { Button, Card, Eyebrow, H2, IconButton, NumInput, Screen, Segmented, T, formatDate, relativeDay, styles, useTheme } from '../ui';
import { LineChart, RANGES, inRange, type Range } from '../chart';
import { useDialog } from '../dialog';

const measureUnit = (k: MeasurementKind, prefs: Prefs) => unitFor(k, prefs.weightUnit);

/** Stored value → the number shown (body weight is stored in kg). */
const shown = (k: MeasurementKind, v: number, prefs: Prefs) => (k === 'body_weight' ? +fromKg(v, prefs.weightUnit).toFixed(2) : v);
const stored = (k: MeasurementKind, v: number, prefs: Prefs) => (k === 'body_weight' ? toKg(v, prefs.weightUnit) : v);
const fmt = (k: MeasurementKind, v: number, prefs: Prefs) => `${formatNumber(shown(k, v, prefs), 1)} ${measureUnit(k, prefs)}`;

/** "Oct 20", with the year when it differs from this one. */
const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(new Date(ms).getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) });

function signed(k: MeasurementKind, diff: number, prefs: Prefs) {
  const v = k === 'body_weight' ? fromKg(diff, prefs.weightUnit) : diff;
  const r = +v.toFixed(1);
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${formatNumber(Math.abs(r), 1)} ${measureUnit(k, prefs)}`;
}

/** Profile card: a tile per tracked measurement and a button to log new ones. */
export function MeasurementsCard() {
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const t = useTheme();
  const groups = measurementsByKind(store.all('measurements'));
  const tracked = MEASUREMENT_KINDS.filter((k) => k === 'body_weight' || groups.has(k));
  return (
    <View>
      <H2>Measurements</H2>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tracked.map((k) => {
            const list = groups.get(k) ?? [];
            const latest = list[0];
            const c = measurementChange(list);
            return (
              <Pressable
                key={k}
                onPress={() => nav.push({ name: 'measurement', id: k })}
                accessibilityRole="button"
                accessibilityLabel={`${measureName(k)}${latest ? `, ${fmt(k, latest.value, prefs)}` : ', not logged yet'}`}
                style={({ pressed }) => ({
                  flexBasis: '48%',
                  flexGrow: 1,
                  backgroundColor: t.surface2,
                  borderRadius: 16,
                  padding: 12,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                  {measureName(k).toUpperCase()}
                </Text>
                <Text style={{ color: t.text, fontSize: 20, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                  {latest ? fmt(k, latest.value, prefs) : '—'}
                </Text>
                <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {!latest ? 'Not logged yet' : c ? `${signed(k, c.diff, prefs)} since ${shortDate(c.since)}` : relativeDay(latest.takenAt)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Button title="Log measurements" icon="create-outline" style={{ marginTop: 12 }} onPress={() => nav.push({ name: 'measureLog' })} />
      </Card>
    </View>
  );
}

/** One measurement: trend, quick add and full history. */
export function MeasurementScreen({ id }: { id: string }) {
  const kind = id as MeasurementKind;
  const store = useStore();
  const prefs = usePrefs();
  const dialog = useDialog();
  const t = useTheme();
  const [value, setValue] = useState<number | null>(null);
  const [range, setRange] = useState<Range>('3m');
  const [all, setAll] = useState(false);
  const unit = measureUnit(kind, prefs);
  const list = store
    .all('measurements')
    .filter((m) => m.kind === kind)
    .sort((a, b) => b.takenAt - a.takenAt);
  const points = inRange(list.map((m) => ({ at: m.takenAt, value: shown(kind, m.value, prefs) })).reverse(), range);
  const shownList = all ? list : list.slice(0, 15);

  return (
    <Screen title={measureName(kind)} subtitle={list[0] ? `Latest ${fmt(kind, list[0].value, prefs)} · ${relativeDay(list[0].takenAt)}` : 'Not logged yet'}>
      <Card>
        <View style={[styles.row, { gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <NumInput
              value={value}
              onChange={setValue}
              placeholder={list[0] ? String(shown(kind, list[0].value, prefs)) : `New ${measureName(kind).toLowerCase()}`}
              accessibilityLabel={`New ${measureName(kind)} in ${unit}`}
            />
          </View>
          <T muted>{unit}</T>
          <Button
            title="Add"
            icon="add"
            small
            variant="primary"
            disabled={value == null}
            onPress={() => {
              store.insert('measurements', { kind, value: stored(kind, value!, prefs), takenAt: Date.now(), note: null });
              setValue(null);
            }}
          />
        </View>
      </Card>
      {list.length >= 2 && (
        <Card>
          <Segmented options={RANGES} value={range} onChange={setRange} />
          <View style={{ marginTop: 12 }}>
            <LineChart label={measureName(kind)} height={170} points={points} format={(v) => `${formatNumber(v, 1)} ${unit}`} />
          </View>
        </Card>
      )}
      {list.length > 0 && <H2>History</H2>}
      {list.length > 0 && (
        <Card>
          {shownList.map((m, i) => {
            const prev = list[i + 1];
            return (
              <View key={m.id} style={[styles.rowBetween, { paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }]}>
                <View style={{ flex: 1 }}>
                  <T bold style={{ fontVariant: ['tabular-nums'] }}>
                    {fmt(kind, m.value, prefs)}
                  </T>
                  <T small muted>
                    {formatDate(m.takenAt)}
                    {prev ? `  ·  ${signed(kind, m.value - prev.value, prefs)}` : ''}
                  </T>
                </View>
                <IconButton
                  name="trash-outline"
                  label={`Delete ${fmt(kind, m.value, prefs)}`}
                  onPress={() => {
                    // Delete straight away, with Undo, rather than asking first.
                    store.remove('measurements', m.id);
                    dialog.toast(`Deleted ${fmt(kind, m.value, prefs)}`, {
                      text: 'Undo',
                      onPress: () => store.insert('measurements', { kind: m.kind, value: m.value, takenAt: m.takenAt, note: m.note }),
                    });
                  }}
                />
              </View>
            );
          })}
          {list.length > shownList.length && <Button title={`Show all ${list.length}`} variant="ghost" small onPress={() => setAll(true)} />}
        </Card>
      )}
    </Screen>
  );
}

/** Log several measurements at once, grouped by body area. Empty fields are skipped. */
export function LogMeasurementsScreen() {
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const dialog = useDialog();
  const t = useTheme();
  const [values, setValues] = useState<Partial<Record<MeasurementKind, number | null>>>({});
  const groups = measurementsByKind(store.all('measurements'));
  const filled = MEASUREMENT_KINDS.filter((k) => values[k] != null);
  const save = () => {
    const at = Date.now();
    for (const k of filled) store.insert('measurements', { kind: k, value: stored(k, values[k]!, prefs), takenAt: at, note: null });
    dialog.toast(filled.length === 1 ? `Saved ${measureName(filled[0]!).toLowerCase()}` : `Saved ${filled.length} measurements`);
    nav.pop();
  };
  const input = (k: MeasurementKind, side?: 'L' | 'R') => {
    const last = groups.get(k)?.[0];
    return (
      <View key={k} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {side && <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', width: 12 }}>{side}</Text>}
        <View style={{ flex: 1 }}>
          <NumInput
            value={values[k] ?? null}
            onChange={(v) => setValues((s) => ({ ...s, [k]: v }))}
            placeholder={last ? String(shown(k, last.value, prefs)) : '–'}
            accessibilityLabel={`${measureName(k)} in ${measureUnit(k, prefs)}${last ? `, last ${fmt(k, last.value, prefs)}` : ''}`}
            style={{ paddingVertical: 8 }}
          />
        </View>
      </View>
    );
  };
  return (
    <Screen title="Log measurements" subtitle="Fill in what you measured. Grey numbers are your last values.">
      {MEASURE_GROUPS.map((g) => (
        <View key={g.title}>
          <Eyebrow>{g.title}</Eyebrow>
          <Card>
            {g.rows.map((r, i) => (
              <View key={r.label} style={[styles.row, { gap: 10, paddingVertical: 5, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }]}>
                <View style={{ width: 92 }}>
                  <T>{r.label}</T>
                  <T small muted>
                    {measureUnit(r.kinds[0]!, prefs)}
                  </T>
                </View>
                {r.kinds.length === 2 ? (
                  <>
                    {input(r.kinds[0]!, 'L')}
                    {input(r.kinds[1]!, 'R')}
                  </>
                ) : (
                  input(r.kinds[0]!)
                )}
              </View>
            ))}
          </Card>
        </View>
      ))}
      <Button
        title={filled.length ? `Save ${filled.length === 1 ? '1 measurement' : `${filled.length} measurements`}` : 'Save'}
        icon="checkmark"
        variant="primary"
        disabled={!filled.length}
        style={{ marginTop: 8 }}
        onPress={save}
      />
    </Screen>
  );
}
