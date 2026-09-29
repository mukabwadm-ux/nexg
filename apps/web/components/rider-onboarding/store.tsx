'use client';

import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import type { CityOption, RiderDraft, RiderReadiness, Vehicle } from './types';

/**
 * The rider draft, and the promise that it is saved.
 *
 * Same shape as the merchant store, for the same reason: a rider standing
 * next to their bike on mobile data will not finish in one sitting, and a
 * Save button they have to find is a Save button they will miss. Optimistic
 * locally, debounced to the server, flushed on `pagehide`.
 */

interface SaveState {
  saving: boolean;
  savedAt: number | null;
  error: string | null;
}

interface Store {
  draft: RiderDraft | null;
  readiness: RiderReadiness | null;
  cities: CityOption[];
  areas: string[];
  save: SaveState;
  patch: (fields: Partial<RiderDraft>, step?: number) => void;
  /** Commits anything still debounced. Await before navigating. */
  flushNow: () => Promise<void>;
  setVehicle: (vehicle: Vehicle) => Promise<void>;
  setDraft: (draft: RiderDraft) => void;
  refresh: () => Promise<void>;
}

const StoreContext = React.createContext<Store | null>(null);

export function useRiderOnboarding(): Store {
  const store = React.useContext(StoreContext);
  if (!store) throw new Error('useRiderOnboarding must be used inside RiderOnboardingProvider');
  return store;
}

/** Only the columns rpc_rider_save_step will accept. */
const SAVEABLE: readonly string[] = [
  'first_name',
  'last_name',
  'city_id',
  'plate_no',
  'ownership',
  'owner_name',
  'owner_phone',
  'insurance',
  'years_riding',
  'bike_max_km',
  'areas',
  'shifts',
  'cash_ok',
  'kit_has',
  'notes',
  'payout_msisdn',
];

export function RiderOnboardingProvider({
  initialDraft,
  initialReadiness,
  cities,
  areas,
  children,
}: {
  initialDraft: RiderDraft | null;
  initialReadiness: RiderReadiness | null;
  cities: CityOption[];
  areas: string[];
  children: React.ReactNode;
}) {
  const [draft, setDraftState] = React.useState<RiderDraft | null>(initialDraft);
  const [readiness, setReadiness] = React.useState<RiderReadiness | null>(initialReadiness);
  const [save, setSave] = React.useState<SaveState>({
    saving: false,
    savedAt: null,
    error: null,
  });

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
    const { data, error } = await supabase.rpc('rpc_rider_save_step', {
      p_rider_id: draftId,
      p_step: step || 1,
      p_patch: fields as never,
    });

    if (error) {
      /* Put the fields back so the next flush retries them. Losing a save
         silently is the one failure this flow cannot have. */
      pending.current = { ...fields, ...pending.current };
      pendingStep.current = Math.max(step, pendingStep.current);
      setSave({ saving: false, savedAt: null, error: error.message });
      return;
    }

    setReadiness(data as unknown as RiderReadiness);
    setSave({ saving: false, savedAt: Date.now(), error: null });
  }, [draftId]);

  const patch = React.useCallback(
    (fields: Partial<RiderDraft>, step?: number) => {
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

  React.useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  /*
   * The vehicle is its own call because changing it throws away the answers
   * that hung off the old one — a rider who switches to a bicycle should not
   * keep a plate and an insurance type that no longer apply.
   */
  const setVehicle = React.useCallback(
    async (vehicle: Vehicle) => {
      if (!draftId) return;
      setDraftState((c) =>
        c
          ? {
              ...c,
              vehicle,
              ...(vehicle === 'bicycle' ? { plate_no: null, insurance: null } : {}),
            }
          : c,
      );
      setSave((s) => ({ ...s, saving: true }));

      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_rider_set_vehicle', {
        p_rider_id: draftId,
        p_vehicle: vehicle as never,
      });

      if (error) {
        setSave({ saving: false, savedAt: null, error: error.message });
        return;
      }
      setReadiness(data as unknown as RiderReadiness);
      setSave({ saving: false, savedAt: Date.now(), error: null });
    },
    [draftId],
  );

  /*
   * Continue must not outrun the save.
   *
   * Each step's server layout reads the draft to decide what to show — the
   * areas step asks for the zones in the rider's city. With only the 400 ms
   * debounce, tapping a city and pressing Continue in under 400 ms rendered
   * the next step against a row that had no city yet, and the area chips
   * came back empty. Awaiting a flush makes Continue mean saved.
   */
  const flushNow = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await flush();
  }, [flush]);

  const refresh = React.useCallback(async () => {
    if (!draftId) return;
    const supabase = createClient();
    const [{ data: row }, { data: r }] = await Promise.all([
      supabase.from('rider').select('*').eq('id', draftId).maybeSingle(),
      supabase.rpc('fn_rider_readiness', { p_rider_id: draftId }),
    ]);
    if (row) setDraftState(row as unknown as RiderDraft);
    if (r) setReadiness(r as unknown as RiderReadiness);
  }, [draftId]);

  const value = React.useMemo<Store>(
    () => ({
      draft,
      readiness,
      cities,
      areas,
      save,
      patch,
      flushNow,
      setVehicle,
      setDraft: setDraftState,
      refresh,
    }),
    [draft, readiness, cities, areas, save, patch, flushNow, setVehicle, refresh],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
