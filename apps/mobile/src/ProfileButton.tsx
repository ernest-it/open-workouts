import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNav } from './nav';
import { useStore } from './state';
import { useTheme } from './ui';

/**
 * Round avatar button in the top-right of each tab's first screen; opens Profile (stats, measurements,
 * and Settings behind its gear). A dot shows when sync is failing, so problems are visible everywhere.
 */
export function ProfileButton() {
  const nav = useNav();
  const store = useStore();
  const t = useTheme();
  const problem = !!store.server && !!store.lastSyncError;
  return (
    <Pressable
      onPress={() => nav.push({ name: 'profile' })}
      accessibilityRole="button"
      accessibilityLabel={problem ? 'Profile and settings. Sync problem.' : 'Profile and settings'}
      hitSlop={8}
      style={({ pressed }) => [
        { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name="person" size={20} color={t.text} />
      {problem && <View style={{ position: 'absolute', top: 1, right: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: t.warn, borderWidth: 2, borderColor: t.bg }} />}
    </Pressable>
  );
}

/** Puts the profile button after a screen's own header actions. */
export function HeaderActions({ children }: { children?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {children}
      <ProfileButton />
    </View>
  );
}
