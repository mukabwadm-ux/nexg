import * as React from 'react';

/**
 * Runs a server read once per request, however many times it is asked for.
 *
 * A portal page is a layout and a page rendered together, and both ask who
 * is signed in and what their workspace is. Without this, each asked
 * Supabase again, one call after another.
 *
 * React.cache exists in the React build Next ships for the app router; the
 * plain build the unit tests run on lacks it, and there each call simply
 * runs. Outside a render (a server action) it also just runs.
 */
export const perRequest: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);
