'use client';

import {
  loadMerchantWorkspaceAccess,
  MerchantAccessError,
  type MerchantAccessClient,
  type MerchantWorkspaceAccess,
} from './merchant-access';

type Query = ReturnType<MerchantAccessClient['rpc']> & {
  abortSignal?: (signal: AbortSignal) => Query;
};

/**
 * Failed reads in a row before the workspace is closed. One failed read (a
 * dropped connection on a phone, a slow database) used to close it at once,
 * which unmounted whatever the person was typing and then, after the refresh,
 * checked again straight away: on a slow database Home reloaded every few
 * seconds and the registration form lost its input (system test, 18 Nov
 * 2026). An answer that changes or withdraws access still closes it at once.
 */
export const FAILED_READS_BEFORE_CLOSING = 3;

/** Authorization polling is a read. It never advances the person's idle deadline. */
export function watchMerchantWorkspaceAccess(options: {
  client: unknown;
  merchantId: string;
  initial: MerchantWorkspaceAccess;
  visible: () => boolean;
  onChange: () => void;
  onInvalid: () => void;
}) {
  let active = true;
  let controller: AbortController | undefined;
  let failedReads = 0;
  const sameAuthority = (access: MerchantWorkspaceAccess) =>
    access.state === options.initial.state &&
    access.setup === options.initial.setup &&
    access.operations === options.initial.operations;
  const stop = () => {
    active = false;
    controller?.abort();
    clearInterval(timer);
  };
  const check = async (): Promise<
    'unchanged' | 'changed' | 'unavailable' | 'retrying' | 'skipped'
  > => {
    if (!active || !options.visible() || controller) return 'skipped';
    const request = new AbortController();
    controller = request;
    const client: MerchantAccessClient = {
      rpc(name, args) {
        const query = (
          options.client as { rpc: (name: string, args: { p_merchant_id: string }) => Query }
        ).rpc(name, args);
        return query.abortSignal ? query.abortSignal(request.signal) : query;
      },
    };
    try {
      const access = await loadMerchantWorkspaceAccess(client, options.merchantId);
      if (!active || request.signal.aborted) return 'skipped';
      failedReads = 0;
      if (!sameAuthority(access)) {
        stop();
        options.onChange();
        return 'changed';
      }
      return 'unchanged';
    } catch (error) {
      if (!active || request.signal.aborted) return 'skipped';
      // The read failed, which says nothing about access: keep the page and
      // try again on the next tick, unless it keeps failing.
      if (
        error instanceof MerchantAccessError &&
        error.transient &&
        ++failedReads < FAILED_READS_BEFORE_CLOSING
      )
        return 'retrying';
      stop();
      options.onInvalid();
      return 'unavailable';
    } finally {
      if (controller === request) controller = undefined;
    }
  };
  const timer = setInterval(() => {
    void check();
  }, 30_000);
  return { check, stop };
}
