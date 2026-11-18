import { useEffect, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { fromKg } from '@open-workouts/shared';
import type { Prefs } from './state';

export interface Theme {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  success: string;
  danger: string;
  warn: string;
  doneRow: string;
}

const light: Theme = {
  bg: '#f4f5f7',
  surface: '#ffffff',
  surface2: '#eef0f3',
  text: '#14161a',
  muted: '#6b7280',
  border: '#dde1e6',
  accent: '#2f6df6',
  success: '#16a34a',
  danger: '#dc2626',
  warn: '#d97706',
  doneRow: '#e8f6ec',
};
const dark: Theme = {
  ...light,
  bg: '#111318',
  surface: '#1b1e25',
  surface2: '#252932',
  text: '#e8eaee',
  muted: '#9aa1ad',
  border: '#2e333d',
  accent: '#4f86ff',
  doneRow: '#16301f',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export function Screen({ children, title, right }: { children: ReactNode; title?: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      {title != null && (
        <View style={styles.rowBetween}>
          <Text style={[styles.h1, { color: t.text }]}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const s = [styles.card, { backgroundColor: t.surface, borderColor: t.border }, style];
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  ) : (
    <View style={s}>{children}</View>
  );
}

type Variant = 'default' | 'primary' | 'success' | 'danger' | 'ghost';
export function Button({
  title,
  onPress,
  variant = 'default',
  small,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  small?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = { default: t.surface2, primary: t.accent, success: t.success, danger: 'transparent', ghost: 'transparent' }[variant];
  const fg = { default: t.text, primary: '#fff', success: '#fff', danger: t.danger, ghost: t.accent }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.border }, props.style]}
    />
  );
}

/** Numeric input that tolerates partial text ("1.", "") while typing. */
export function NumInput({ value, onChange, style }: { value: number | null; onChange: (v: number | null) => void; style?: StyleProp<ViewStyle> }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    const parsed = Number(text.replace(',', '.'));
    if (value == null ? text !== '' : parsed !== value) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      value={text}
      keyboardType="decimal-pad"
      selectTextOnFocus
      onChangeText={(s) => {
        setText(s);
        const v = s.replace(',', '.');
        if (v.trim() === '') onChange(null);
        else if (!Number.isNaN(Number(v))) onChange(Number(v));
      }}
      style={[styles.num, style as object]}
    />
  );
}

export function T({ children, muted, small, bold, style }: { children: ReactNode; muted?: boolean; small?: boolean; bold?: boolean; style?: object }) {
  const t = useTheme();
  return (
    <Text style={[{ color: muted ? t.muted : t.text, fontSize: small ? 13 : 15, fontWeight: bold ? '700' : '400' }, style]}>
      {children}
    </Text>
  );
}

export function H2({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.h2, { color: t.text }]}>{children}</Text>;
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.chip, { borderColor: t.border, backgroundColor: value === o.value ? t.accent : t.surface }]}
        >
          <Text style={{ color: value === o.value ? '#fff' : t.text, fontSize: 13 }}>{o.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const showWeight = (kg: number | null | undefined, prefs: Prefs) => (kg == null ? '' : String(+fromKg(kg, prefs.weightUnit).toFixed(2)));
export const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

export const styles = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '700', marginVertical: 8 },
  h2: { fontSize: 19, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginVertical: 6 },
  btn: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 10, marginVertical: 0 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 15, marginVertical: 4 },
  num: { minWidth: 62, textAlign: 'center', paddingVertical: 6, marginVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 },
});
