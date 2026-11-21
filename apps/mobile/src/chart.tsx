import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from './ui';

export interface ChartPoint {
  at: number;
  value: number;
}

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Line chart over time with a soft area fill. Touch and drag to read a point; the latest point
 * is marked. Points are placed by date, so gaps in training show as gaps.
 */
export function LineChart({
  points,
  height = 180,
  format = (v) => String(+v.toFixed(1)),
  label,
}: {
  points: ChartPoint[];
  height?: number;
  format?: (v: number) => string;
  /** Screen reader summary, e.g. "Estimated 1RM". */
  label: string;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  if (points.length < 2)
    return (
      <View style={{ height: 80, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.muted }}>Not enough data yet. Log it twice to see a trend.</Text>
      </View>
    );

  const pad = { top: 14, bottom: 22, left: 9, right: 9 };
  const ys = points.map((p) => p.value);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  // Some headroom so a flat line doesn't sit on the edge.
  const span = hi - lo || Math.max(1, hi * 0.1);
  lo -= span * 0.12;
  hi += span * 0.12;
  const t0 = points[0]!.at;
  const t1 = points[points.length - 1]!.at;
  const w = Math.max(1, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;
  const x = (at: number) => pad.left + (t1 === t0 ? w / 2 : ((at - t0) / (t1 - t0)) * w);
  const y = (v: number) => pad.top + h - ((v - lo) / (hi - lo)) * h;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(t1).toFixed(1)},${pad.top + h} L${x(t0).toFixed(1)},${pad.top + h} Z`;
  const last = points[points.length - 1]!;
  const best = points.reduce((a, b) => (b.value > a.value ? b : a));
  const shown = sel != null ? points[sel]! : last;

  const pick = (px: number) => {
    let bestI = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.at) - px);
      if (d < bestD) (bestD = d), (bestI = i);
    });
    setSel(bestI);
  };

  return (
    <View
      accessible
      accessibilityLabel={`${label} chart: ${points.length} points from ${fmtDay(t0)} to ${fmtDay(t1)}. Latest ${format(last.value)}, best ${format(best.value)}.`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ color: t.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{format(shown.value)}</Text>
        <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>
          {sel != null ? fmtDay(shown.at) : `Latest · best ${format(best.value)}`}
        </Text>
      </View>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        onResponderRelease={() => setSel(null)}
        onResponderTerminate={() => setSel(null)}
        style={{ height }}
      >
        {width > 0 && (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={t.accent} stopOpacity={0.35} />
                <Stop offset="1" stopColor={t.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[0, 0.5, 1].map((f) => (
              <Line key={f} x1={pad.left} x2={pad.left + w} y1={pad.top + h * f} y2={pad.top + h * f} stroke={t.border} strokeWidth={1} strokeDasharray={f === 1 ? undefined : '3 5'} />
            ))}
            <Path d={area} fill="url(#fill)" />
            <Path d={line} stroke={t.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {points.length <= 40 && points.map((p) => <Circle key={p.at} cx={x(p.at)} cy={y(p.value)} r={2.5} fill={t.accent} />)}
            <Circle cx={x(best.at)} cy={y(best.value)} r={4.5} fill={t.bg} stroke={t.accent} strokeWidth={2} />
            {sel != null && <Line x1={x(shown.at)} x2={x(shown.at)} y1={pad.top} y2={pad.top + h} stroke={t.muted} strokeWidth={1} />}
            <Circle cx={x(shown.at)} cy={y(shown.value)} r={6} fill={t.accent} stroke={t.bg} strokeWidth={2} />
          </Svg>
        )}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: t.muted, fontSize: 11 }}>{fmtDay(t0)}</Text>
          <Text style={{ color: t.muted, fontSize: 11 }}>{fmtDay(t1)}</Text>
        </View>
      </View>
    </View>
  );
}

export type Range = '1m' | '3m' | '1y' | 'all';
export const RANGES: { value: Range; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];
export function inRange<T extends { at: number }>(points: T[], range: Range, now = Date.now()): T[] {
  const days = { '1m': 31, '3m': 92, '1y': 366, all: Infinity }[range];
  return points.filter((p) => p.at >= now - days * 86_400_000);
}
