import { failureFrom, type ReadFailure } from './readState';

export interface ReadSnapshot<T> { key: string; value?: T; failure?: ReadFailure; loading: boolean }
/** Shared by the hook and behavior tests. Superseded reads cannot publish. */
export function startProviderRead<T>(key: string, read: (signal: AbortSignal) => Promise<T>, publish: (value: ReadSnapshot<T>) => void): () => void {
  const controller = new AbortController();
  publish({ key, loading: true });
  void (async () => {
    try {
      const value = await read(controller.signal);
      if (!controller.signal.aborted) publish({ key, value, loading: false });
    } catch (error) {
      if (!controller.signal.aborted) publish({ key, failure: failureFrom(error), loading: false });
    }
  })();
  return () => controller.abort();
}
