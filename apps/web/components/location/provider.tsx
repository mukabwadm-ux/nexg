'use client';

import { LocationProvider, type LocationActions, type Place, type ResolutionStep } from '@nexg/location';
import * as React from 'react';

import {
  confirmPlace,
  coverageFor,
  deletePlace,
  listPlaces,
  noteLocationEvent,
  resolveLocation,
} from '@/app/location-actions';

/**
 * Binds the location layer to this app's server actions.
 *
 * The package knows nothing about Supabase, Next, or how a place
 * is stored — it is handed a set of functions and calls them.
 * That boundary is what lets the geolocation rule be enforced by
 * a directory-scoped lint rule rather than by everybody
 * remembering it.
 */
export function SiteLocationProvider({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial: { place: Place | null; step: ResolutionStep } | null;
}) {
  const sessionRef = React.useRef<string>('');

  const actions = React.useMemo<LocationActions>(
    () => ({
      resolve: async (context) => {
        const result = await resolveLocation(context);
        return {
          step: result.step as ResolutionStep,
          chip_state: result.chip_state as never,
          place: (result.place as Place | null) ?? null,
        };
      },
      confirm: async (payload) => {
        const result = await confirmPlace(payload);
        return result as { ok: boolean; stored: boolean; id?: string };
      },
      coverage: async (lat, lng) =>
        (await coverageFor(lat, lng)) as Partial<Place> & { coverage: string },
      note: async (action, detail) => {
        if (!sessionRef.current) {
          try {
            sessionRef.current = window.sessionStorage.getItem('nexg.loc.session') ?? 'anonymous';
          } catch {
            sessionRef.current = 'anonymous';
          }
        }
        /*
         * Fire and forget, and swallowed on failure. This is
         * analytics on the path somebody is walking to order
         * dinner; it must never be the reason a button appears
         * to do nothing.
         */
        try {
          await noteLocationEvent(
            sessionRef.current,
            window.location.pathname,
            action,
            detail?.band,
            detail?.step,
          );
        } catch {
          /* ignore */
        }
      },
      listSaved: async () => {
        const rows = await listPlaces();
        return rows as never;
      },
      remove: async (id) => deletePlace(id),
    }),
    [],
  );

  return (
    <LocationProvider actions={actions} initial={initial}>
      {children}
    </LocationProvider>
  );
}
