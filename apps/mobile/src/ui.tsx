import { useEffect, useState, type ReactNode } from 'react';
import {
  AppState,
  InputAccessoryView,
  Keyboard,
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
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { buildTheme, formatNumber, fromKg, type ThemeColors } from '@open-workouts/shared';
import type { Prefs } from './state';
import { useAppearance } from './appearance';

export type Theme = ThemeColors;
export type IconName = keyof typeof Ionicons.glyphMap;

const themeCache = new Map<string, Theme>();
export function useTheme(): Theme {
  const a = useAppearance();
  const systemDark = useColorScheme() === 'dark';
  const key = `${a.mode}|${a.accent}|${systemDark}`;
  let t = themeCache.get(key);
  if (!t) themeCache.set(key, (t = buildTheme(a, systemDark)));
  return t;
}

/** Text-selection highlight: the accent at about a third opacity so selected digits stay readable. */
export function selectionTint(c: string): string {
  const h = c.trim().replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (x) => x + x) : h;
  return /^[0-9a-f]{6}$/i.test(full) ? `#${full}55` : c;
}

export function Screen({
  children,
  title,
  subtitle,
  right,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {title != null && <Title title={title} subtitle={subtitle} right={right} />}
      {children}
    </ScrollView>
  );
}

/** Large page title with an optional muted line under it. */
export function Title({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.titleBlock}>
      <View style={styles.rowBetween}>
        <Text style={[styles.h1, { color: t.text }]}>{title}</Text>
        {right}
      </View>
      {subtitle != null && (typeof subtitle === 'string' ? <Text style={{ color: t.muted, fontSize: 15 }}>{subtitle}</Text> : subtitle)}
    </View>
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
  const s = [styles.card, { backgroundColor: t.surface, borderColor: t.border, borderWidth: t.dark ? StyleSheet.hairlineWidth : 0 }, style];
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s, pressed && { transform: [{ scale: 0.985 }], opacity: 0.85 }]}>
      {children}
    </Pressable>
  ) : (
    <View style={s}>{children}</View>
  );
}

type Variant = 'default' | 'primary' | 'soft' | 'danger' | 'ghost';
export function Button({
  title,
  onPress,
  variant = 'default',
  small,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  small?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = { default: t.surface2, primary: t.accent, soft: t.accentSoft, danger: 'transparent', ghost: 'transparent' }[variant];
  const fg = { default: t.text, primary: t.onAccent, soft: t.accentText, danger: t.danger, ghost: t.accentText }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1, transform: [{ scale: pressed && !disabled ? 0.97 : 1 }] },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      selectionColor={selectionTint(t.accent)}
      selectionHandleColor={t.accent}
      cursorColor={t.accentText}
      {...props}
      style={[styles.input, { color: t.text, backgroundColor: t.surface2 }, props.style]}
    />
  );
}

/** Search field with a magnifier icon and, once there is text, a button that clears it. */
export function SearchInput(props: TextInputProps) {
  const t = useTheme();
  const canClear = !!props.value && !!props.onChangeText;
  return (
    <View style={[styles.search, { backgroundColor: t.surface2 }]}>
      <Ionicons name="search" size={18} color={t.muted} />
      <TextInput
        placeholderTextColor={t.muted}
        selectionColor={selectionTint(t.accent)}
        selectionHandleColor={t.accent}
        cursorColor={t.accentText}
        autoCorrect={false}
        {...props}
        style={[{ flex: 1, color: t.text, fontSize: 15, paddingVertical: 11 }, props.style]}
      />
      {canClear && (
        <Pressable
          onPress={() => props.onChangeText!('')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Ionicons name="close-circle" size={20} color={t.muted} />
        </Pressable>
      )}
    </View>
  );
}

const NUMPAD_ACCESSORY = 'numpad-done';

/**
 * Keeps text fields from staying focused after the keyboard is gone. Android
 * leaves a field focused when the keyboard is hidden with Back or the hide key,
 * so the cursor sits there and the keyboard pops up again every time the app is
 * reopened. Mount once near the root.
 */
export function KeyboardFocusGuard() {
  const t = useTheme();
  useEffect(() => {
    const blur = () => TextInput.State.currentlyFocusedInput()?.blur();
    const hide = Keyboard.addListener('keyboardDidHide', blur);
    const app = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        Keyboard.dismiss();
        blur();
      }
    });
    return () => {
      hide.remove();
      app.remove();
    };
  }, []);
  // iOS number pads have no return key; give them a Done button.
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={NUMPAD_ACCESSORY}>
      <View style={[styles.accessory, { backgroundColor: t.surface2, borderColor: t.border }]}>
        <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Done">
          <Text style={{ color: t.accentText, fontSize: 16, fontWeight: '700' }}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

/** Numeric input that tolerates partial text ("1.", "") while typing. */
export function NumInput({
  value,
  onChange,
  style,
  placeholder,
  accessibilityLabel,
  onFocus,
  onBlur,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  accessibilityLabel?: string;
  onFocus?: () => void;
  onBlur?: () => void;
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
      onFocus={onFocus}
      onBlur={onBlur}
      keyboardType="decimal-pad"
      returnKeyType="done"
      inputAccessoryViewID={Platform.OS === 'ios' ? NUMPAD_ACCESSORY : undefined}
      selectTextOnFocus
      onChangeText={(s) => {
        setText(s);
        const v = s.replace(',', '.');
        if (v.trim() === '') onChange(null);
        else if (!Number.isNaN(Number(v))) onChange(Number(v));
      }}
      style={[styles.num, style]}
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
  style?: StyleProp<TextStyle>;
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
  filled,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
  filled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, (filled || pressed) && { backgroundColor: t.surface2 }, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={name} size={size} color={color ?? t.muted} />
    </Pressable>
  );
}

export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  const h = <Text style={[styles.h2, { color: t.text }]}>{children}</Text>;
  return right ? (
    <View style={[styles.rowBetween, { marginTop: 18, marginBottom: 4 }]}>
      <Text style={[styles.h2, { color: t.text, marginTop: 0, marginBottom: 0 }]}>{children}</Text>
      {right}
    </View>
  ) : (
    h
  );
}

/** Small uppercase label above a group of fields. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[styles.eyebrow, { color: t.muted }, style]}>{children}</Text>;
}

/** Rounded tinted label, e.g. a timer or a count. */
export function Pill({ icon, text, tone = 'accent' }: { icon?: IconName; text: string; tone?: 'accent' | 'neutral' | 'warn' }) {
  const t = useTheme();
  const bg = tone === 'accent' ? t.accentSoft : t.surface2;
  const fg = tone === 'accent' ? t.accentText : tone === 'warn' ? t.warn : t.muted;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={13} color={fg} />}
      <Text style={{ color: fg, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{text}</Text>
    </View>
  );
}

/** Big number with a caption, for summary rows. */
export function Stat({ value, caption }: { value: string; caption: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: t.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>{caption}</Text>
    </View>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    // flexGrow/flexShrink 0: inside a flex column (e.g. above a FlatList) the row would otherwise
    // be squeezed and clip the chip labels.
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ alignItems: 'center' }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, { backgroundColor: on ? t.accent : t.surface2 }]}
          >
            <Text style={{ color: on ? t.onAccent : t.text, fontSize: 13, fontWeight: on ? '700' : '500' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** iOS-style segmented control for 2–4 short options. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.surface2 }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[styles.segment, on && [styles.segmentOn, { backgroundColor: t.dark ? t.border : t.surface }]]}
          >
            <Text style={{ color: on ? t.text : t.muted, fontWeight: on ? '700' : '500', fontSize: 13 }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A tappable settings-style row: icon, label, value and a chevron. */
export function ListRow({
  icon,
  title,
  value,
  onPress,
  last,
  danger,
}: {
  icon?: IconName;
  title: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.listRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border }, pressed && { opacity: 0.6 }]}
    >
      {icon && (
        <View style={[styles.listIcon, { backgroundColor: danger ? t.surface2 : t.accentSoft }]}>
          <Ionicons name={icon} size={17} color={danger ? t.danger : t.accentText} />
        </View>
      )}
      <Text style={{ flex: 1, color: danger ? t.danger : t.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
      {value != null && <Text style={{ color: t.muted, fontSize: 14 }}>{value}</Text>}
      {onPress && !danger && <Ionicons name="chevron-forward" size={16} color={t.muted} />}
    </Pressable>
  );
}

export const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const showWeight = (kg: number | null | undefined, prefs: Prefs) => (kg == null ? '' : String(+fromKg(kg, prefs.weightUnit).toFixed(2)));
/** A total (volume) with thousands separators: "8,087.5". */
export const showVolume = (kg: number, prefs: Prefs) => formatNumber(fromKg(kg, prefs.weightUnit), 1);
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
  screen: { padding: 16, paddingTop: 12, paddingBottom: 120, width: '100%', maxWidth: 720, alignSelf: 'center' },
  sheetBody: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  titleBlock: { marginTop: 8, marginBottom: 10 },
  chips: { flexGrow: 0, flexShrink: 0, marginVertical: 6 },
  h1: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8, flexShrink: 1 },
  h2: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginTop: 18, marginBottom: 6 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 },
  card: { borderRadius: 20, padding: 16, marginVertical: 6 },
  btn: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  btnSmall: { minHeight: 34, paddingVertical: 7, paddingHorizontal: 14, marginVertical: 0 },
  input: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, marginVertical: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, marginVertical: 4 },
  num: { minWidth: 62, textAlign: 'center', paddingVertical: 8, marginVertical: 0, fontWeight: '600', fontSize: 16, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  accessory: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, marginRight: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 9 },
  segmentOn: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 52 },
  listIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
