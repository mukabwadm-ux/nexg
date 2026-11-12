import type { CinemaConnector } from './cinema';
import { standInConnector, type StandInData } from './standInCinema';

/** Set by vite.config.ts. Tests run without Vite, so it is absent there and the stand-in stays available. */
declare const __NEXG_CINEMA_STAND_IN__: boolean;
const standInBuilt = typeof __NEXG_CINEMA_STAND_IN__ === 'boolean' ? __NEXG_CINEMA_STAND_IN__ : true;

/** The sample programme, only in builds that asked for it: a constant test, so other builds drop the data file. */
const loadStandIn = (): Promise<StandInData> => standInBuilt
  ? import('../../../demo-seed/cinema/stand-in-cinema.json').then((module) => module.default as unknown as StandInData)
  : Promise.reject(new Error('This build has no stand-in cinema system'));

/**
 * The cinema system this build reads. Unset: none yet, so cinema pages say showtimes aren't on NexG yet.
 * "stand-in": the sample programme for the local demo cinemas (refused in deploy builds by vite.config.ts).
 * Derrick NexG's cinema API (one format for every ticketing system) becomes the next value here.
 */
export function cinemaConnector(source = import.meta.env?.VITE_CINEMA_SOURCE): CinemaConnector | undefined {
  if (source === 'stand-in') return standInConnector(loadStandIn);
  return undefined;
}
