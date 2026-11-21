import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ACCENT_PRESETS, THEME_MODES, hueColor, hueOf, isHexColor, type ThemeColors } from '@open-workouts/shared';
import { setAppearance, useAppearance } from '../appearance';
import { useDialog } from '../dialog';
import { Button, Card, Eyebrow, Segmented, T, styles, useTheme } from '../ui';
import { SetBadge } from './Workout';

const HUES = Array.from({ length: 30 }, (_, i) => i * 12);
const SHADES = [0.4, 0.48, 0.56, 0.64, 0.72];

/** Theme settings: light/dark/black, an accent preset, or any custom colour. */
export function AppearanceCard() {
  const t = useTheme();
  const a = useAppearance();
  const dialog = useDialog();
  const custom = isHexColor(a.accent);
  const [showCustom, setShowCustom] = useState(custom);
  const pos = custom ? hueOf(a.accent) : { hue: 24, lightness: 0.56 };
  const shade = SHADES.reduce((best, s) => (Math.abs(s - pos.lightness) < Math.abs(best - pos.lightness) ? s : best), SHADES[2]!);

  return (
    <Card>
      <Preview t={t} />

      <Eyebrow>Mode</Eyebrow>
      <Segmented options={THEME_MODES} value={a.mode} onChange={(mode) => setAppearance({ mode })} />

      <Eyebrow style={{ marginTop: 16 }}>Colour</Eyebrow>
      <View style={local.grid}>
        {ACCENT_PRESETS.map((p) => (
          <Swatch
            key={p.id}
            name={p.name}
            color={p.color ?? t.text}
            mono={!p.color}
            selected={a.accent === p.id}
            onPress={() => {
              setAppearance({ accent: p.id });
              setShowCustom(false);
            }}
          />
        ))}
      </View>
      <Pressable
        onPress={() => {
          setShowCustom(true);
          if (!custom) setAppearance({ accent: hueColor(pos.hue, 0.82, shade) });
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: custom }}
        style={[local.customRow, { backgroundColor: custom ? t.accentSoft : t.surface2 }]}
      >
        <View style={[local.customDot, { backgroundColor: custom ? a.accent : t.border }]}>
          {!custom && <Ionicons name="color-palette" size={16} color={t.muted} />}
        </View>
        <View style={{ flex: 1 }}>
          <T bold>Custom colour</T>
          <T small muted>
            {custom ? a.accent.toUpperCase() : 'Pick any colour you like'}
          </T>
        </View>
        {custom && <Ionicons name="checkmark-circle" size={22} color={t.accentText} />}
      </Pressable>

      {showCustom && (
        <View style={{ marginTop: 12 }}>
          <T small muted>
            Hue
          </T>
          <View style={local.hueStrip} accessibilityLabel="Hue">
            {HUES.map((h, i) => {
              const on = custom && Math.abs(((pos.hue - h + 540) % 360) - 180) < 6;
              return (
                <Pressable
                  key={h}
                  accessibilityRole="button"
                  accessibilityLabel={`Hue ${h} degrees`}
                  onPress={() => setAppearance({ accent: hueColor(h, 0.82, shade) })}
                  style={[
                    local.hue,
                    { backgroundColor: hueColor(h) },
                    i === 0 && { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
                    i === HUES.length - 1 && { borderTopRightRadius: 12, borderBottomRightRadius: 12 },
                  ]}
                >
                  {on && <View style={[local.hueMark, { borderColor: '#fff' }]} />}
                </Pressable>
              );
            })}
          </View>
          <T small muted style={{ marginTop: 10 }}>
            Shade
          </T>
          <View style={[styles.row, { marginTop: 6 }]}>
            {SHADES.map((l) => {
              const c = hueColor(pos.hue, 0.82, l);
              const on = custom && l === shade;
              return (
                <Pressable
                  key={l}
                  onPress={() => setAppearance({ accent: c })}
                  accessibilityRole="button"
                  accessibilityLabel={`Shade ${SHADES.indexOf(l) + 1} of ${SHADES.length}`}
                  accessibilityState={{ selected: on }}
                  style={[local.shade, { backgroundColor: c, borderColor: on ? t.text : 'transparent' }]}
                />
              );
            })}
          </View>
          <Button
            small
            variant="ghost"
            icon="code-slash"
            title="Enter a hex code"
            style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 0 }}
            onPress={async () => {
              const v = await dialog.prompt({
                title: 'Custom colour',
                message: 'A hex colour code, like #FF5B2E.',
                defaultValue: custom ? a.accent : '#',
                placeholder: '#FF5B2E',
              });
              if (v == null) return;
              const hex = v.startsWith('#') ? v : `#${v}`;
              if (isHexColor(hex)) setAppearance({ accent: hex.toLowerCase() });
              else void dialog.alert('Not a colour code', 'Use 3 or 6 hex digits, like #F52 or #FF5B2E.');
            }}
          />
        </View>
      )}
      <T small muted style={{ marginTop: 8 }}>
        Saved on this device. Text is adjusted automatically so every colour stays readable.
      </T>
    </Card>
  );
}

function Swatch({ name, color, mono, selected, onPress }: { name: string; color: string; mono?: boolean; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name} theme`} accessibilityState={{ selected }} style={local.swatchCell}>
      <View style={[local.ring, { borderColor: selected ? t.text : 'transparent' }]}>
        <View style={[local.swatch, { backgroundColor: color }]}>
          {mono && <View style={[local.monoHalf, { backgroundColor: t.surface }]} />}
          {selected && <Ionicons name="checkmark" size={20} color={mono ? t.dark ? '#111' : '#fff' : contrastOn(color)} style={{ position: 'absolute' }} />}
        </View>
      </View>
      <Text style={{ color: selected ? t.text : t.muted, fontSize: 12, fontWeight: selected ? '700' : '500', marginTop: 4 }}>{name}</Text>
    </Pressable>
  );
}

const contrastOn = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const y = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return y > 0.62 ? '#111' : '#fff';
};

/** A miniature set row and button, so the effect of a choice is visible straight away. */
function Preview({ t }: { t: ThemeColors }) {
  return (
    <View style={[local.preview, { backgroundColor: t.bg, borderColor: t.border }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.rowBetween, { marginBottom: 8 }]}>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>Bench Press</Text>
        <View style={[local.previewPill, { backgroundColor: t.accentSoft }]}>
          <Text style={{ color: t.accentText, fontSize: 12, fontWeight: '700' }}>PR</Text>
        </View>
      </View>
      {[
        { n: '1', v: '80 kg × 8', done: true },
        { n: '2', v: '82.5 kg × 6', done: false },
      ].map((r) => (
        <View key={r.n} style={[styles.row, local.previewRow, { backgroundColor: r.done ? t.doneRow : 'transparent' }]}>
          <SetBadge kind="normal" text={r.n} />
          <Text style={{ color: t.text, flex: 1, fontWeight: '600' }}>{r.v}</Text>
          <View style={[local.previewCheck, { backgroundColor: r.done ? t.accent : t.surface2 }]}>
            <Ionicons name="checkmark" size={16} color={r.done ? t.onAccent : t.muted} />
          </View>
        </View>
      ))}
      <View style={[local.previewBtn, { backgroundColor: t.accent }]}>
        <Text style={{ color: t.onAccent, fontWeight: '700' }}>Finish workout</Text>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  swatchCell: { width: '25%', alignItems: 'center', paddingVertical: 6 },
  ring: { borderWidth: 2.5, borderRadius: 30, padding: 3 },
  swatch: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  monoHalf: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 22 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12, marginTop: 8 },
  customDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  hueStrip: { flexDirection: 'row', height: 40, marginTop: 6 },
  hue: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hueMark: { width: 10, height: 30, borderRadius: 5, borderWidth: 3 },
  shade: { flex: 1, height: 36, borderRadius: 12, borderWidth: 3 },
  preview: { borderRadius: 18, padding: 14, marginBottom: 4, borderWidth: StyleSheet.hairlineWidth },
  previewPill: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  previewRow: { borderRadius: 12, padding: 5, marginTop: 3 },
  previewCheck: { width: 34, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  previewBtn: { borderRadius: 99, alignItems: 'center', paddingVertical: 11, marginTop: 10 },
});
