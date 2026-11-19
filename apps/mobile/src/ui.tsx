import { useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
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
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
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

/**
 * Full-screen sheet. Android draws modals edge-to-edge, so pad for the status bar there; iOS
 * page sheets already sit below it. Both need room for the home indicator / gesture bar.
 */
export function Sheet({ visible = true, onClose, children }: { visible?: boolean; onClose: () => void; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: t.bg,
          paddingTop: (Platform.OS === 'android' ? insets.top : 0) + 8,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <View style={styles.sheetBody}>{children}</View>
      </View>
    </Modal>
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
export function NumInput({
  value,
  onChange,
  style,
  placeholder,
  accessibilityLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  style?: StyleProp<ViewStyle>;
  placeholder?: string;
  accessibilityLabel?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    const parsed = Number(text.replace(',', '.'));
    if (value == null ? text !== '' : parsed !== value) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      value={text}
      placeholder={placeholder}
      accessibilityLabel={accessibilityLabel}
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

export function T({
  children,
  muted,
  small,
  bold,
  style,
  lines,
}: {
  children: ReactNode;
  muted?: boolean;
  small?: boolean;
  bold?: boolean;
  style?: object;
  lines?: number;
}) {
  const t = useTheme();
  return (
    <Text numberOfLines={lines} style={[{ color: muted ? t.muted : t.text, fontSize: small ? 13 : 15, fontWeight: bold ? '700' : '400' }, style]}>
      {children}
    </Text>
  );
}

/** Round icon-only button with a 44pt touch target. */
export function IconButton({
  name,
  onPress,
  label: a11y,
  color,
  size = 20,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: t.surface2 }]}
    >
      <Ionicons name={name} size={size} color={color ?? t.muted} />
    </Pressable>
  );
}

export function H2({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.h2, { color: t.text }]}>{children}</Text>;
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    // flexGrow/flexShrink 0: inside a flex column (e.g. above a FlatList) the row would otherwise
    // be squeezed and clip the chip labels.
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ alignItems: 'center' }}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.value }}
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

/** "today", "yesterday", "3 days ago", else a short date (year only when it differs). */
export function relativeDay(ms: number, now = Date.now()) {
  const day = (x: number) => Math.floor((x - new Date(x).getTimezoneOffset() * 60_000) / 86_400_000);
  const diff = day(now) - day(ms);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return `${diff} days ago`;
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}

export const styles = StyleSheet.create({
  // Content is capped and centred so tablets don't get edge-to-edge lines.
  screen: { padding: 16, paddingBottom: 120, width: '100%', maxWidth: 720, alignSelf: 'center' },
  sheetBody: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  chips: { flexGrow: 0, flexShrink: 0, marginVertical: 6 },
  h1: { fontSize: 28, fontWeight: '700', marginVertical: 8 },
  h2: { fontSize: 19, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginVertical: 6 },
  btn: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 10, marginVertical: 0 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 15, marginVertical: 4 },
  num: { minWidth: 62, textAlign: 'center', paddingVertical: 6, marginVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 },
});
