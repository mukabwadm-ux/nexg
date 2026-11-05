'use client';

import { useEffect, useState } from 'react';
import { AVIATION_STORAGE_KEY, initialAviationState, type AviationState } from './model';

export function useAviationDemoState() {
  const [state, setSnapshot] = useState<AviationState>(initialAviationState);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AVIATION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AviationState;
        if (
          parsed.version === 1 &&
          Array.isArray(parsed.flights) &&
          Array.isArray(parsed.blocks) &&
          parsed.flights.every(
            (f) =>
              f &&
              typeof f.id === 'string' &&
              f.quote &&
              Array.isArray(f.quote.stops) &&
              typeof f.quote.totalUsd === 'number',
          )
        )
          setSnapshot(parsed);
      }
    } catch {
      setStorageWarning(
        'Your browser could not restore the saved demo. The sample records are ready to use.',
      );
    }
    setReady(true);
  }, []);
  function setState(next: AviationState) {
    setSnapshot(next);
    try {
      localStorage.setItem(AVIATION_STORAGE_KEY, JSON.stringify(next));
      setStorageWarning('');
    } catch {
      setStorageWarning(
        'Changes are available in this view, but this browser could not save the demo.',
      );
    }
  }
  return { state, setState, ready, storageWarning, reset: () => setState(initialAviationState()) };
}
