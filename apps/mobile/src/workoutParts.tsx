import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Exercise, SetKind } from '@open-workouts/shared';
import { useStore } from './state';
import { Button, Chips, H2, SearchInput, Sheet, T, label, styles, useTheme } from './ui';

export const KIND_LABEL: Record<SetKind, string> = { normal: '', warmup: 'W', drop: 'D', failure: 'F' };

/** Set number (or W/D/F) in a small rounded badge, coloured by set type. */
export function SetBadge({ kind, text }: { kind: SetKind; text: string }) {
  const t = useTheme();
  const fg = { normal: t.text, warmup: t.warn, drop: t.accentText, failure: t.danger }[kind];
  return (
    <View style={[local.badge, { backgroundColor: kind === 'drop' ? t.accentSoft : t.surface2 }]}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: 13, fontVariant: ['tabular-nums'] }}>{text}</Text>
    </View>
  );
}

/** Initials in a tinted circle, so long exercise lists are easier to scan. */
export function ExerciseAvatar({ name }: { name: string }) {
  const t = useTheme();
  const initials = name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <View style={[local.avatar, { backgroundColor: t.accentSoft }]}>
      <Text style={{ color: t.accentText, fontWeight: '800', fontSize: 14 }}>{initials}</Text>
    </View>
  );
}

export function ExercisePicker({
  visible,
  onClose,
  onPick,
  title = 'Add exercise',
  initialPart = 'all',
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (e: Exercise) => void;
  title?: string;
  /** Start filtered to a body part, e.g. the one of the exercise being replaced. */
  initialPart?: string;
}) {
  const store = useStore();
  const t = useTheme();
  const [q, setQ] = useState('');
  const [part, setPart] = useState(initialPart);
  const all = store.exercises();
  const parts = ['all', ...new Set(all.map((e) => e.bodyPart))];
  const list = all.filter((e) => (part === 'all' || e.bodyPart === part) && e.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <View style={styles.rowBetween}>
          <H2>{title}</H2>
          <Button small variant="ghost" title="Close" onPress={onClose} />
        </View>
        <SearchInput placeholder="Search exercises" value={q} onChangeText={setQ} />
        <Chips options={parts.map((p) => ({ value: p, label: label(p) }))} value={part} onChange={setPart} />
        <FlatList
          data={list}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              style={({ pressed }) => [local.pickRow, pressed && { backgroundColor: t.surface2 }]}
              accessibilityRole="button"
            >
              <ExerciseAvatar name={item.name} />
              <View style={{ flex: 1 }}>
                <T bold>{item.name}</T>
                <T small muted>
                  {label(item.bodyPart)}
                </T>
              </View>
              <Ionicons name="add-circle" size={24} color={t.accentText} />
            </Pressable>
          )}
        />
      </View>
    </Sheet>
  );
}

const local = StyleSheet.create({
  badge: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pickRow: { paddingVertical: 10, paddingHorizontal: 6, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
