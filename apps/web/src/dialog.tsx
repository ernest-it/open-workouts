import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * In-app replacements for window.confirm / prompt / alert, styled like the rest of the UI,
 * plus a small toast for non-blocking messages (with an optional action such as Undo).
 */

export interface Dialogs {
  confirm(o: { title: string; message?: string; confirmText?: string; cancelText?: string; destructive?: boolean }): Promise<boolean>;
  alert(title: string, message?: string): Promise<void>;
  prompt(o: { title: string; message?: string; defaultValue?: string; placeholder?: string; confirmText?: string; allowEmpty?: boolean }): Promise<string | null>;
  toast(message: string, action?: { text: string; onClick: () => void }): void;
}

interface State {
  title: string;
  message?: string;
  input?: { value: string; placeholder?: string; allowEmpty?: boolean };
  confirmText: string;
  cancelText: string | null;
  destructive?: boolean;
  resolve: (v: unknown) => void;
  cancelValue: unknown;
}

const Ctx = createContext<Dialogs | null>(null);

export function useDialog(): Dialogs {
  const d = useContext(Ctx);
  if (!d) throw new Error('useDialog must be used inside <DialogProvider>');
  return d;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string; action?: { text: string; onClick: () => void } } | null>(null);
  const cur = useRef<State | null>(null);
  cur.current = state;

  const open = useCallback((s: Omit<State, 'resolve'>) => {
    cur.current?.resolve(cur.current.cancelValue);
    return new Promise<unknown>((resolve) => setState({ ...s, resolve }));
  }, []);
  const close = useCallback((v: unknown) => {
    const s = cur.current;
    setState(null);
    s?.resolve(v);
  }, []);

  const api = useMemo<Dialogs>(
    () => ({
      confirm: (o) =>
        open({
          title: o.title,
          message: o.message,
          confirmText: o.confirmText ?? 'OK',
          cancelText: o.cancelText ?? 'Cancel',
          destructive: o.destructive,
          cancelValue: false,
        }) as Promise<boolean>,
      alert: (title, message) => open({ title, message, confirmText: 'OK', cancelText: null, cancelValue: undefined }).then(() => {}),
      prompt: (o) =>
        open({
          title: o.title,
          message: o.message,
          input: { value: o.defaultValue ?? '', placeholder: o.placeholder, allowEmpty: o.allowEmpty },
          confirmText: o.confirmText ?? 'Save',
          cancelText: 'Cancel',
          cancelValue: null,
        }) as Promise<string | null>,
      toast: (message, action) => setToast({ id: Date.now(), message, action }),
    }),
    [open],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((x) => (x?.id === toast.id ? null : x)), toast.action ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {state && <DialogBox s={state} close={close} />}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.action && (
            <button
              className="link"
              onClick={() => {
                toast.action!.onClick();
                setToast(null);
              }}
            >
              {toast.action.text}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

function DialogBox({ s, close }: { s: State; close: (v: unknown) => void }) {
  const [text, setText] = useState(s.input?.value ?? '');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const submit = () => close(s.input ? text.trim() || (s.input.allowEmpty ? '' : null) : s.cancelText === null ? undefined : true);
  useEffect(() => {
    if (!s.input) confirmRef.current?.focus();
    const on = (e: KeyboardEvent) => e.key === 'Escape' && close(s.cancelValue);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [s, close]);
  return (
    <div className="modal-backdrop dialog-backdrop" onClick={() => close(s.cancelValue)}>
      <form
        className="modal dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={s.title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!s.input || text.trim() || s.input.allowEmpty) submit();
        }}
      >
        <h2>{s.title}</h2>
        {s.message && <p className="muted dialog-message">{s.message}</p>}
        {s.input && <input autoFocus value={text} placeholder={s.input.placeholder} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} />}
        <div className="dialog-actions">
          {s.cancelText !== null && (
            <button type="button" onClick={() => close(s.cancelValue)}>
              {s.cancelText}
            </button>
          )}
          <button ref={confirmRef} type="submit" className={s.destructive ? 'danger-fill' : 'primary'} disabled={!!s.input && !text.trim() && !s.input.allowEmpty}>
            {s.confirmText}
          </button>
        </div>
      </form>
    </div>
  );
}
