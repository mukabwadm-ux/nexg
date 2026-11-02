'use client';

import { loadMerchantWorkspaceAccess, type MerchantAccessClient, type MerchantWorkspaceAccess } from './merchant-access';

type Query = ReturnType<MerchantAccessClient['rpc']> & { abortSignal?: (signal: AbortSignal) => Query };

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
  const sameAuthority = (access: MerchantWorkspaceAccess) => access.state === options.initial.state &&
    access.setup === options.initial.setup && access.operations === options.initial.operations;
  const stop = () => {
    active = false;
    controller?.abort();
    clearInterval(timer);
  };
  const check = async (): Promise<'unchanged' | 'changed' | 'unavailable' | 'skipped'> => {
    if (!active || !options.visible() || controller) return 'skipped';
    const request = new AbortController();
    controller = request;
    const client: MerchantAccessClient = { rpc(name, args) {
      const query = (options.client as { rpc: (name: string, args: { p_merchant_id: string }) => Query }).rpc(name, args);
      return query.abortSignal ? query.abortSignal(request.signal) : query;
    } };
    try {
      const access = await loadMerchantWorkspaceAccess(client, options.merchantId);
      if (!active || request.signal.aborted) return 'skipped';
      if (!sameAuthority(access)) {
        stop();
        options.onChange();
        return 'changed';
      }
      return 'unchanged';
    } catch {
      if (!active || request.signal.aborted) return 'skipped';
      stop();
      options.onInvalid();
      return 'unavailable';
    } finally {
      if (controller === request) controller = undefined;
    }
  };
  const timer = setInterval(() => { void check(); }, 30_000);
  return { check, stop };
}
