import { useEffect, useRef, useState } from 'react';
import { startProviderRead, type ReadSnapshot } from '../providers/providerReadTask';

export function useProviderRead<T>(key: string, read: (signal: AbortSignal) => Promise<T>) {
  const reader = useRef(read);
  reader.current = read;
  const [snapshot, setSnapshot] = useState<ReadSnapshot<T>>({ key, loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    return startProviderRead(key, reader.current, setSnapshot);
  }, [key, attempt]);
  const current = snapshot.key === key ? snapshot : { key, loading: true };
  const { value, loading, failure } = current;
  useEffect(() => {
    if (!loading) window.dispatchEvent(new Event('discovery:content-ready'));
  }, [loading, value]);
  return { value, loading, error: Boolean(failure), failure, status: loading ? 'loading' as const : failure?.kind ?? 'ready' as const, retry: () => setAttempt((previous) => previous + 1) };
}
