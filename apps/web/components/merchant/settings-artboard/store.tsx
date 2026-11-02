'use client';

import * as React from 'react';
import { z } from 'zod';

import {
  DEFAULT_PREFERENCES,
  initialState,
  kenyaTime,
  type Preferences,
  type SettingsIdentity,
  type SettingsState,
  type Tone,
} from './model';

const preferencesSchema = z.object({
  language: z.literal('English'),
  dateFormat: z.enum(['long', 'numeric']),
  timeFormat: z.enum(['12', '24']),
  density: z.enum(['Comfortable', 'Compact']),
  reduceMotion: z.boolean(),
});
interface SettingsContextValue {
  identity: SettingsIdentity;
  state: SettingsState;
  busy: boolean;
  ready: boolean;
  message: { text: string; tone: Tone } | null;
  notify: (text: string, tone?: Tone) => void;
  commit: (update: (previous: SettingsState) => SettingsState, label: string) => Promise<boolean>;
  savePreferences: (preferences: Preferences) => Promise<boolean>;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
}
const Context = React.createContext<SettingsContextValue | null>(null);
export function SettingsProvider({
  identity,
  children,
}: {
  identity: SettingsIdentity;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState(() => initialState(identity));
  const stateRef = React.useRef(state);
  const [busy, setBusy] = React.useState(false);
  const locked = React.useRef(false);
  const [ready, setReady] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [message, setMessage] = React.useState<SettingsContextValue['message']>(null);
  const storageKey = identity.sample
    ? 'nexg.settings.sample.v1'
    : `nexg.settings.preferences.v1.${identity.userId}`;
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (
          identity.sample &&
          typeof parsed === 'object' &&
          parsed !== null &&
          'version' in parsed &&
          parsed.version === 1
        ) {
          const candidate = parsed as SettingsState;
          if (
            Array.isArray(candidate.alerts) &&
            Array.isArray(candidate.routingRules) &&
            Array.isArray(candidate.connections) &&
            Array.isArray(candidate.activity) &&
            Array.isArray(candidate.requests) &&
            Array.isArray(candidate.credentials) &&
            Array.isArray(candidate.webhooks) &&
            Array.isArray(candidate.sessions) &&
            preferencesSchema.safeParse(candidate.preferences).success
          ) {
            stateRef.current = candidate;
            setState(candidate);
          }
        } else {
          const prefs = preferencesSchema.safeParse(parsed);
          if (prefs.success) {
            stateRef.current = { ...stateRef.current, preferences: prefs.data };
            setState(stateRef.current);
          }
        }
      }
    } catch {
      setMessage({
        text: 'Saved settings could not be read. The last available defaults are shown.',
        tone: 'warning',
      });
    }
    setReady(true);
  }, [identity.sample, storageKey]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const notify = React.useCallback(
    (text: string, tone: Tone = 'info') => setMessage({ text, tone }),
    [],
  );
  async function persist(next: SettingsState, label: string, preferencesOnly = false) {
    if (locked.current) return false;
    if (!identity.sample && !preferencesOnly) {
      notify(
        'This operation is not connected for this workspace. Contact support to continue.',
        'warning',
      );
      return false;
    }
    locked.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, identity.sample ? 350 : 0));
      localStorage.setItem(storageKey, JSON.stringify(identity.sample ? next : next.preferences));
      stateRef.current = next;
      setState(next);
      setDirty(false);
      notify(
        identity.sample
          ? `${label} Sample changes are saved in this browser.`
          : 'Display preferences saved on this device.',
        'success',
      );
      return true;
    } catch {
      notify(
        'Your changes could not be saved on this device. Keep this page open and try again.',
        'danger',
      );
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function commit(update: (previous: SettingsState) => SettingsState, label: string) {
    const next = update(stateRef.current);
    return persist(
      {
        ...next,
        activity: [{ id: crypto.randomUUID(), label, time: kenyaTime() }, ...next.activity].slice(
          0,
          50,
        ),
      },
      label,
    );
  }
  async function savePreferences(value: Preferences) {
    const result = preferencesSchema.safeParse(value);
    if (!result.success) {
      notify('Choose one of the supported display options.', 'danger');
      return false;
    }
    return persist({ ...stateRef.current, preferences: result.data }, 'Preferences saved.', true);
  }
  return (
    <Context.Provider
      value={{
        identity,
        state,
        busy,
        ready,
        message,
        notify,
        commit,
        savePreferences,
        dirty,
        setDirty,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSettings() {
  const context = React.useContext(Context);
  if (!context) throw new Error('SettingsProvider is required');
  return context;
}
export function useDraft<T>(saved: T) {
  const { setDirty } = useSettings();
  const [draft, setDraft] = React.useState(saved);
  React.useEffect(() => {
    setDraft(saved);
  }, [saved]);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  React.useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  return { draft, setDraft, dirty, reset: () => setDraft(saved) };
}
export { DEFAULT_PREFERENCES };
