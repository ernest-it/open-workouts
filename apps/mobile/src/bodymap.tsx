import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { MUSCLES, MUSCLE_LABEL, mix, muscleSets, startOfWeek, type Muscle } from '@open-workouts/shared';
import { useStore } from './state';
import { Card, Segmented, T, styles, useTheme } from './ui';

/** Sets per week at which a muscle shows at full colour (a common hypertrophy target). */
const FULL = 10;

type Shape = { kind: 'e'; cx: number; cy: number; rx: number; ry: number } | { kind: 'p'; d: string } | { kind: 'r'; x: number; y: number; w: number; h: number; r: number };
const e = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: 'e', cx, cy, rx, ry });
const p = (d: string): Shape => ({ kind: 'p', d });
const r = (x: number, y: number, w: number, h: number, rr: number): Shape => ({ kind: 'r', x, y, w, h, r: rr });
/** A shape and its mirror image across the body's centre line (x = 50). */
const pair = (s: Shape): Shape[] =>
  s.kind === 'e' ? [s, { ...s, cx: 100 - s.cx }] : s.kind === 'r' ? [s, { ...s, x: 100 - s.x - s.w }] : [s, p(mirrorPath(s.d))];
function mirrorPath(d: string) {
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${100 - Number(x)},${y}`);
}

// Simplified figures in a 100 × 210 box: front and back.
const FRONT: [Muscle, Shape[]][] = [
  ['traps', pair(p('M42,31 L49,30 L49,36 L38,38 Z'))],
  ['shoulders', pair(e(29, 45, 8, 7.5))],
  ['chest', pair(p('M37,40 Q49,37 49.5,41 L49.5,58 Q41,62 35,56 Q33,47 37,40 Z'))],
  ['biceps', pair(e(25.5, 66, 5, 11))],
  ['forearms', pair(e(21.5, 93, 4.5, 13))],
  ['abs', [r(41.5, 61, 17, 36, 6)]],
  ['quads', pair(e(42, 133, 7.5, 23))],
  ['calves', pair(e(41.5, 177, 4.5, 14))],
];
const BACK: [Muscle, Shape[]][] = [
  ['traps', [p('M50,29 L64,39 L50,54 L36,39 Z')]],
  ['shoulders', pair(e(29, 45, 8, 7.5))],
  ['upper_back', pair(p('M37,45 L49,55 L49,64 L39,62 Z'))],
  ['lats', pair(p('M35,52 Q33,68 42,82 L48,80 L48,67 L38,62 Z'))],
  ['triceps', pair(e(25.5, 66, 5, 11))],
  ['forearms', pair(e(21.5, 93, 4.5, 13))],
  ['lower_back', [r(42, 82, 16, 16, 5)]],
  ['glutes', pair(e(43, 106, 8, 9))],
  ['hamstrings', pair(e(42, 137, 7, 20))],
  ['calves', pair(e(41.5, 176, 5.5, 14))],
];

function Figure({ parts, fill }: { parts: [Muscle, Shape[]][]; fill: (m: Muscle) => string }) {
  const t = useTheme();
  const base = t.surface2;
  return (
    <G>
      {/* Silhouette */}
      <Circle cx={50} cy={16} r={10} fill={base} />
      <Rect x={45} y={24} width={10} height={9} fill={base} />
      <Rect x={32} y={36} width={36} height={66} rx={13} fill={base} />
      {[0, 1].map((i) => (
        <G key={i}>
          <Rect x={i ? 70 : 20} y={40} width={10} height={36} rx={5} fill={base} />
          <Rect x={i ? 73.5 : 17.5} y={74} width={9} height={36} rx={4.5} fill={base} />
          <Rect x={i ? 50.5 : 34} y={96} width={15.5} height={60} rx={7.5} fill={base} />
          <Rect x={i ? 52 : 36} y={152} width={12} height={46} rx={6} fill={base} />
        </G>
      ))}
      {parts.map(([m, shapes]) =>
        shapes.map((s, i) => {
          const props = { key: `${m}${i}`, fill: fill(m), stroke: t.surface, strokeWidth: 1.2 };
          if (s.kind === 'e') return <Ellipse {...props} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />;
          if (s.kind === 'r') return <Rect {...props} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} />;
          return <Path {...props} d={s.d} />;
        }),
      )}
    </G>
  );
}

/**
 * Front and back body map coloured by working sets per muscle: bright = trained a lot, dark =
 * left out. "4 weeks" shows the weekly average over the last four full weeks plus this one.
 */
export function BodyHeatmap() {
  const store = useStore();
  const t = useTheme();
  const [range, setRange] = useState<'week' | 'month'>('week');
  const sets = useMemo(() => {
    const now = Date.now();
    const thisWeek = startOfWeek(now);
    if (range === 'week') return muscleSets(store.dataset, thisWeek, now + 1);
    const total = muscleSets(store.dataset, thisWeek - 28 * 86_400_000, now + 1);
    // Four full weeks plus the part of this one so far.
    const weeks = 4 + (now - thisWeek) / (7 * 86_400_000);
    return Object.fromEntries(MUSCLES.map((m) => [m, total[m] / weeks])) as Record<Muscle, number>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.version, range]);
  const untrained = mix(t.surface2, t.text, 0.12);
  // Light mode ends on the darker accent text colour so the scale gets stronger, not paler.
  const low = mix(t.surface2, t.accent, t.dark ? 0.3 : 0.45);
  const high = t.dark ? t.accent : t.accentText;
  const shade = (f: number) => mix(low, high, Math.min(1, f));
  const fill = (m: Muscle) => (sets[m] <= 0 ? untrained : shade(sets[m] / FULL));
  const sorted = [...MUSCLES].sort((a, b) => sets[b] - sets[a]);
  const left = sorted.filter((m) => sets[m] < 1).reverse();
  const fmt = (v: number) => String(+v.toFixed(1));

  return (
    <Card>
      <View style={styles.rowBetween}>
        <T bold style={{ fontSize: 16 }}>
          Muscle map
        </T>
        <View style={{ width: 170 }}>
          <Segmented
            options={[
              { value: 'week' as const, label: 'This week' },
              { value: 'month' as const, label: '4 weeks' },
            ]}
            value={range}
            onChange={setRange}
          />
        </View>
      </View>
      <View
        style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}
        accessible
        accessibilityLabel={`Muscle map. Most trained: ${sorted
          .slice(0, 3)
          .map((m) => `${MUSCLE_LABEL[m]} ${fmt(sets[m])} sets`)
          .join(', ')}. ${left.length ? `Not trained: ${left.map((m) => MUSCLE_LABEL[m]).join(', ')}.` : ''}`}
      >
        {(['Front', 'Back'] as const).map((side) => (
          <View key={side} style={{ alignItems: 'center', flex: 1 }}>
            <Svg width="100%" height={230} viewBox="0 0 100 210">
              <Figure parts={side === 'Front' ? FRONT : BACK} fill={fill} />
            </Svg>
            <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700' }}>{side.toUpperCase()}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.row, { justifyContent: 'center', gap: 6, marginTop: 10 }]}>
        <Text style={{ color: t.muted, fontSize: 11 }}>0</Text>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <View key={f} style={{ width: 22, height: 8, borderRadius: 4, backgroundColor: f === 0 ? untrained : shade(f) }} />
        ))}
        <Text style={{ color: t.muted, fontSize: 11 }}>{FULL}+ sets{range === 'month' ? ' / week' : ''}</Text>
      </View>
      {left.length > 0 && (
        <T small muted style={{ marginTop: 10, textAlign: 'center' }}>
          {range === 'week' ? 'Little or no work this week' : 'Little or no work lately'}: {left.map((m) => MUSCLE_LABEL[m]).join(', ')}
        </T>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
        {sorted.map((m) => (
          <View key={m} style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3, paddingRight: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fill(m) }} />
            <T small style={{ flex: 1 }} lines={1}>
              {MUSCLE_LABEL[m]}
            </T>
            <T small muted style={{ fontVariant: ['tabular-nums'] }}>
              {fmt(sets[m])}
            </T>
          </View>
        ))}
      </View>
    </Card>
  );
}
