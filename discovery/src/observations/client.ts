import type { DiscoveryProvider, EngineSchemas, ObservationBinding, ResultObservation } from '../providers/DiscoveryProvider';

export function observationFor(provider: DiscoveryProvider, deliveries: ResultObservation[] | undefined, merchantId: string): ObservationBinding | undefined {
  const delivery = deliveries?.find(value => value.ref.kind === 'merchant' && value.ref.id === merchantId);
  return delivery && provider.observe ? { delivery, send: provider.observe.bind(provider) } : undefined;
}
/** No queue/retry/storage. A failed measurement must not prevent navigation. */
export function sendObservation(binding: ObservationBinding | undefined, type: 'result_exposed' | 'detail_opened', exposure?: EngineSchemas['ClientEvent']['exposure']): void {
  if (!binding) return;
  const { delivery } = binding;
  try {
    void binding.send({ eventId: crypto.randomUUID(), type, ref: delivery.ref, exposureToken: delivery.token, position: delivery.position,
      occurredAt: new Date().toISOString(), ...(exposure ? { exposure } : {}) }).catch(() => {});
  } catch { /* A disconnected/disabled adapter must not interrupt navigation. */ }
}
