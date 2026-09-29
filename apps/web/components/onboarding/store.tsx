'use client';

import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import type { CategoryConfig, Draft, DraftBranch, Readiness } from './types';

/**
 * The onboarding draft, and the promise that it is saved.
 *
 * Every tap in this flow is a write. That is the point of it — a merchant on
 * a phone between two orders should be able to close the tab and come back
 * without losing anything, and should never have to find a Save button. So
 * the state here is optimistic locally and debounced to the server, and the
 * top bar says "Saved" once the write lands.
 *
 * Debounced rather than immediate, because a slider that fires an RPC per
 * pixel is worse on a slow connection than one that fires when you let go.
 * 400 ms coalesces a burst of chip taps; a flush on `pagehide` covers the tab
 * that closes straight after one.
 */

interface SaveState {
  saving: boolean;
  savedAt: number | null;
  error: string | null;
}

interface Store {
  draft: Draft | null;
  readiness: Readiness | null;
  categories: CategoryConfig[];
  save: SaveState;

  /** Local update plus a debounced write of the same fields. */
  patch: (fields: Partial<Draft>, step?: number) => void;
  /** Category changes reset the answers, so they are their own call. */
  setCategory: (category: string, answers: Record<string, string | string[]>) => Promise<void>;
  setAnswers: (answers: Record<string, string | string[]>) => void;
  /** Replaces the branch list and returns it with each pin's zone resolved. */
  setBranches: (branches: DraftBranch[]) => Promise<DraftBranch[]>;
  setDraft: (draft: Draft) => void;
  refresh: () => Promise<void>;
}

const StoreContext = React.createContext<Store | null>(null);

export function useOnboarding(): Store {
  const store = React.useContext(StoreContext);
  if (!store) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return store;
}

/** Only the columns rpc_merchant_save_step will accept. */
const SAVEABLE: readonly string[] = [
  'trading_name',
  'legal_name',
  'contact_name',
  'contact_email',
  'cover_photo_path',
  'pickup_instructions',
  'rider_parking',
  'landmark',
  'branch_count_band',
  'hours_pattern',
  'hours',
  'late_night_until',
  'prep_minutes',
  'order_channels',
  'when_busy',
  'packaging',
  'has_own_riders',
  'fleet_dispatch_preference',
  'payout_rail',
  'payout_account',
  'onboarding_call_at',
];

export function OnboardingProvider({
  initialDraft,
  initialReadiness,
  categories,
  children,
}: {
  initialDraft: Draft | null;
  initialReadiness: Readiness | null;
  categories: CategoryConfig[];
  children: React.ReactNode;
}) {
  const [draft, setDraftState] = React.useState<Draft | null>(initialDraft);
  const [readiness, setReadiness] = React.useState<Readiness | null>(initialReadiness);
  const [save, setSave] = React.useState<SaveState>({
    saving: false,
    savedAt: null,
    error: null,
  });

  /* Fields waiting to go, and the highest step reached, held across ticks. */
  const pending = React.useRef<Record<string, unknown>>({});
  const pendingStep = React.useRef<number>(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftId = draft?.id ?? null;

  const flush = React.useCallback(async () => {
    if (!draftId) return;
    const fields = pending.current;
    const step = pendingStep.current;
    if (Object.keys(fields).length === 0 && step === 0) return;

    pending.current = {};
    pendingStep.current = 0;
    setSave((s) => ({ ...s, saving: true, error: null }));

    const supabase = createClient();
    const { data, error } = await supabase.rpc('rpc_merchant_save_step', {
      p_merchant_id: draftId,
      p_step: step || 1,
      /* The generated type for a jsonb argument is Json, and a patch of
         mixed-shape draft fields does not narrow to it. */
      p_patch: fields as never,
    });

    if (error) {
      /*
       * Put the fields back so the next flush retries them. A save that
       * disappears quietly is the one failure this flow cannot have: the
       * merchant was told it saves as they go.
       */
      pending.current = { ...fields, ...pending.current };
      pendingStep.current = Math.max(step, pendingStep.current);
      setSave({ saving: false, savedAt: null, error: error.message });
      return;
    }

    setReadiness(data as unknown as Readiness);
    setSave({ saving: false, savedAt: Date.now(), error: null });
  }, [draftId]);

  const patch = React.useCallback(
    (fields: Partial<Draft>, step?: number) => {
      setDraftState((current) => (current ? { ...current, ...fields } : current));

      for (const [key, value] of Object.entries(fields)) {
        if (SAVEABLE.includes(key)) pending.current[key] = value;
      }
      if (step) pendingStep.current = Math.max(pendingStep.current, step);

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 400);
    },
    [flush],
  );

  /* A tab closing mid-debounce would otherwise drop the last tap. */
  React.useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  const setCategory = React.useCallback(
    async (category: string, answers: Record<string, string | string[]>) => {
      if (!draftId) return;
      setDraftState((c) => (c ? { ...c, category, answers } : c));
      setSave((s) => ({ ...s, saving: true }));

      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_merchant_set_category', {
        p_merchant_id: draftId,
        p_category: category as never,
        p_answers: answers,
      });

      if (error) {
        setSave({ saving: false, savedAt: null, error: error.message });
        return;
      }
      setReadiness(data as unknown as Readiness);
      setSave({ saving: false, savedAt: Date.now(), error: null });
    },
    [draftId],
  );

  /*
   * Answers go through the category RPC rather than the generic patch: the
   * price band on the card is derived from one of them, and a derived value
   * is not the merchant's to set directly.
   */
  const answerTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const category = draft?.category ?? null;

  const setAnswers = React.useCallback(
    (answers: Record<string, string | string[]>) => {
      setDraftState((c) => (c ? { ...c, answers } : c));
      if (answerTimer.current) clearTimeout(answerTimer.current);
      answerTimer.current = setTimeout(() => {
        if (category) void setCategory(category, answers);
      }, 400);
    },
    [category, setCategory],
  );

  const setBranches = React.useCallback(
    async (branches: DraftBranch[]): Promise<DraftBranch[]> => {
      if (!draftId) return branches;
      setSave((s) => ({ ...s, saving: true }));

      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_merchant_set_branches', {
        p_merchant_id: draftId,
        p_branches: branches.map((b) => ({
          address_text: b.address_text,
          lat: b.lat,
          lng: b.lng,
          inherits_hours: b.inherits_hours,
          source: b.source,
        })),
      });

      if (error) {
        setSave({ saving: false, savedAt: null, error: error.message });
        return branches;
      }

      const result = data as unknown as { branches: DraftBranch[]; readiness: Readiness };
      setReadiness(result.readiness);
      setSave({ saving: false, savedAt: Date.now(), error: null });

      /* The server decided the zones; merge them onto what is on screen. */
      return branches.map((b, i) => ({ ...b, ...(result.branches[i] ?? {}) }));
    },
    [draftId],
  );

  const refresh = React.useCallback(async () => {
    if (!draftId) return;
    const supabase = createClient();
    const [{ data: row }, { data: r }] = await Promise.all([
      supabase.from('merchant').select('*').eq('id', draftId).maybeSingle(),
      supabase.rpc('fn_merchant_readiness', { p_merchant_id: draftId }),
    ]);
    if (row) setDraftState(row as Draft);
    if (r) setReadiness(r as unknown as Readiness);
  }, [draftId]);

  const value = React.useMemo<Store>(
    () => ({
      draft,
      readiness,
      categories,
      save,
      patch,
      setCategory,
      setAnswers,
      setBranches,
      setDraft: setDraftState,
      refresh,
    }),
    [draft, readiness, categories, save, patch, setCategory, setAnswers, setBranches, refresh],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
