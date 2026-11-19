import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ui';

/**
 * In-app dialogs, action sheets and toasts, drawn with the app's own theme instead of the
 * system Alert. Rendered as an overlay at the root (not a native Modal), so a dialog can be
 * opened from any screen without fighting other modals, and it follows light/dark mode.
 */

type Tone = 'default' | 'primary' | 'destructive';

interface DialogState {
  kind: 'dialog' | 'menu';
  title: string;
  message?: string;
  input?: { value: string; placeholder?: string };
  actions: { text: string; tone: Tone; value: unknown }[];
  cancelValue: unknown;
  resolve: (v: unknown) => void;
}

interface Toast {
  id: number;
  message: string;
  action?: { text: string; onPress: () => void };
}

export interface Dialogs {
  /** Ask a yes/no question. Resolves true when the confirm button is tapped. */
  confirm(o: { title: string; message?: string; confirmText?: string; cancelText?: string; destructive?: boolean }): Promise<boolean>;
  /** Show a message with a single OK button. */
  alert(title: string, message?: string): Promise<void>;
  /** Ask for a line of text. Resolves null when cancelled. */
  prompt(o: { title: string; message?: string; defaultValue?: string; placeholder?: string; confirmText?: string }): Promise<string | null>;
  /** Bottom action sheet. Resolves the chosen option's value, or null when dismissed. */
  menu<T extends string>(o: { title: string; message?: string; options: { text: string; value: T; destructive?: boolean }[] }): Promise<T | null>;
  /** Short, non-blocking message just above the tab bar, optionally with one action (e.g. Undo). */
  toast(message: string, action?: { text: string; onPress: () => void }): void;
}

const DialogContext = createContext<Dialogs | null>(null);

export function useDialog(): Dialogs {
  const d = useContext(DialogContext);
  if (!d) throw new Error('useDialog must be used inside <DialogProvider>');
  return d;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const current = useRef<DialogState | null>(null);
  current.current = dialog;

  const open = useCallback((d: Omit<DialogState, 'resolve'>) => {
    // Only one dialog at a time: a new one cancels the previous.
    current.current?.resolve(current.current.cancelValue);
    return new Promise<unknown>((resolve) => setDialog({ ...d, resolve }));
  }, []);

  const close = useCallback((value: unknown) => {
    const d = current.current;
    setDialog(null);
    d?.resolve(value);
  }, []);

  const api = useMemo<Dialogs>(
    () => ({
      confirm: (o) =>
        open({
          kind: 'dialog',
          title: o.title,
          message: o.message,
          cancelValue: false,
          actions: [
            { text: o.cancelText ?? 'Cancel', tone: 'default', value: false },
            { text: o.confirmText ?? 'OK', tone: o.destructive ? 'destructive' : 'primary', value: true },
          ],
        }) as Promise<boolean>,
      alert: (title, message) =>
        open({ kind: 'dialog', title, message, cancelValue: undefined, actions: [{ text: 'OK', tone: 'primary', value: undefined }] }).then(() => {}),
      prompt: (o) =>
        open({
          kind: 'dialog',
          title: o.title,
          message: o.message,
          input: { value: o.defaultValue ?? '', placeholder: o.placeholder },
          cancelValue: null,
          actions: [
            { text: 'Cancel', tone: 'default', value: null },
            { text: o.confirmText ?? 'Save', tone: 'primary', value: '__input__' },
          ],
        }) as Promise<string | null>,
      menu: (o) =>
        open({
          kind: 'menu',
          title: o.title,
          message: o.message,
          cancelValue: null,
          actions: o.options.map((x) => ({ text: x.text, tone: x.destructive ? 'destructive' : 'default', value: x.value })),
        }) as Promise<never>,
      toast: (message, action) => setToast({ id: Date.now(), message, action }),
    }),
    [open],
  );

  // Android back button dismisses the dialog instead of leaving the screen.
  useEffect(() => {
    if (!dialog) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close(dialog.cancelValue);
      return true;
    });
    return () => sub.remove();
  }, [dialog, close]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {toast && <ToastView key={toast.id} toast={toast} onDone={() => setToast((t) => (t?.id === toast.id ? null : t))} />}
      {dialog && <DialogView d={dialog} close={close} />}
    </DialogContext.Provider>
  );
}

function DialogView({ d, close }: { d: DialogState; close: (v: unknown) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(d.input?.value ?? '');
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  }, [fade]);
  const valueOf = (v: unknown) => (v === '__input__' ? text.trim() || null : v);
  const color = (tone: Tone) => (tone === 'destructive' ? t.danger : tone === 'primary' ? t.accent : t.text);

  if (d.kind === 'menu') {
    return (
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} accessibilityViewIsModal>
        <Pressable style={local.menuBackdrop} onPress={() => close(d.cancelValue)} accessibilityLabel="Close menu">
          <Pressable style={[local.sheet, { backgroundColor: t.surface, paddingBottom: insets.bottom + 8 }]}>
            <View style={[local.grabber, { backgroundColor: t.border }]} />
            <Text style={[local.title, { color: t.text, textAlign: 'center' }]}>{d.title}</Text>
            {d.message ? <Text style={[local.message, { color: t.muted, textAlign: 'center' }]}>{d.message}</Text> : null}
            {d.actions.map((a) => (
              <Pressable
                key={String(a.value)}
                accessibilityRole="button"
                onPress={() => close(a.value)}
                style={({ pressed }) => [local.menuRow, { borderColor: t.border, backgroundColor: pressed ? t.surface2 : 'transparent' }]}
              >
                <Text style={{ color: color(a.tone), fontSize: 17, fontWeight: a.tone === 'destructive' ? '600' : '400' }}>{a.text}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => close(d.cancelValue)}
              style={({ pressed }) => [local.menuCancel, { backgroundColor: pressed ? t.border : t.surface2 }]}
            >
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} accessibilityViewIsModal>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={local.backdrop} onPress={() => close(d.cancelValue)} accessibilityLabel="Close dialog">
          <Pressable style={[local.box, { backgroundColor: t.surface }]} accessibilityRole="alert">
            <Text style={[local.title, { color: t.text }]}>{d.title}</Text>
            {d.message ? <Text style={[local.message, { color: t.muted }]}>{d.message}</Text> : null}
            {d.input && (
              <TextInput
                autoFocus
                value={text}
                onChangeText={setText}
                placeholder={d.input.placeholder}
                placeholderTextColor={t.muted}
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={() => text.trim() && close(text.trim())}
                style={[local.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
              />
            )}
            <View style={local.actions}>
              {d.actions.map((a) => {
                const disabled = a.value === '__input__' && !text.trim();
                return (
                  <Pressable
                    key={String(a.value)}
                    accessibilityRole="button"
                    disabled={disabled}
                    onPress={() => close(valueOf(a.value))}
                    style={({ pressed }) => [
                      local.action,
                      {
                        backgroundColor: a.tone === 'default' ? t.surface2 : a.tone === 'destructive' ? t.danger : t.accent,
                        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: a.tone === 'default' ? t.text : '#fff', fontWeight: '600', fontSize: 15 }}>{a.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

function ToastView({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(
      () => Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(onDone),
      toast.action ? 5000 : 2800,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={[
        local.toastWrap,
        { bottom: insets.bottom + 76, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
      ]}
    >
      <View style={[local.toast, { backgroundColor: t.text }]}>
        <Text style={{ color: t.bg, flex: 1, fontSize: 15 }}>{toast.message}</Text>
        {toast.action && (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              toast.action!.onPress();
              onDone();
            }}
          >
            <Text style={{ color: t.bg, fontWeight: '700', fontSize: 15 }}>{toast.action.text}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const local = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  box: { borderRadius: 16, padding: 20, width: '100%', maxWidth: 420, alignSelf: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  message: { fontSize: 15, marginTop: 6, lineHeight: 21 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 16, marginTop: 14 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  action: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 8, width: '100%', maxWidth: 720, alignSelf: 'center' },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  menuRow: { paddingVertical: 15, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  menuCancel: { paddingVertical: 14, alignItems: 'center', borderRadius: 12, marginTop: 8 },
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, width: '100%', maxWidth: 520, elevation: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10 },
});
