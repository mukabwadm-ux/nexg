import {
  MerchantApplicationRecord,
  MerchantPayoutRecord,
} from '@nexg/contracts/merchant-application';

export async function loadApplicationView(
  client: unknown,
  merchantId: string,
  options: { signal?: AbortSignal; includePayout?: boolean } = {},
) {
  const rpc = (
    client as {
      rpc: (
        name: string,
        args: { p_merchant_id: string },
      ) => PromiseLike<{ data: unknown; error: unknown }> & {
        abortSignal?: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>;
      };
    }
  ).rpc;
  const read = (name: string) => {
    const request = rpc.call(client, name, { p_merchant_id: merchantId });
    return options.signal && request.abortSignal ? request.abortSignal(options.signal) : request;
  };
  const [application, payout] = await Promise.all([
    read('rpc_merchant_application_read'),
    options.includePayout === false
      ? Promise.resolve({
          data: { merchant_id: merchantId, version: 0, payout: null, verification: 'declared' },
          error: null,
        })
      : read('rpc_merchant_application_payout_read'),
  ]);
  if (application.error || payout.error)
    throw new Error(
      'Your saved application could not be loaded. No saved details have been replaced.',
    );
  const saved = {
    record: MerchantApplicationRecord.parse(application.data),
    payout: MerchantPayoutRecord.parse(payout.data),
  };
  if (saved.record.merchant_id !== merchantId || saved.payout.merchant_id !== merchantId)
    throw new Error(
      'The saved application identity could not be confirmed. Refresh before continuing.',
    );
  return saved;
}
