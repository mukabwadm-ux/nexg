import { expectTypeOf, it } from 'vitest';
import type * as C from '@nexg/contracts/api';
import type { z } from 'zod';

import type * as T from './types.js';

/*
 * The plain types in types.ts must stay equal to the API's schemas. These
 * checks run in the type check (tsc), which CI runs: when a schema in
 * @nexg/contracts changes, it fails until
 * `pnpm --filter @nexg-org/api-client generate` writes the types again.
 */
it('matches the schemas the API uses', () => {
  expectTypeOf<T.ApiOrder>().toEqualTypeOf<C.ApiOrder>();
  expectTypeOf<T.ApiService>().toEqualTypeOf<C.ApiService>();
  expectTypeOf<T.BookingReceipt>().toEqualTypeOf<C.BookingReceipt>();
  expectTypeOf<T.BookingRequest>().toEqualTypeOf<z.input<typeof C.ServiceBooking>>();
  expectTypeOf<T.BookingStatus>().toEqualTypeOf<C.BookingStatus>();
  expectTypeOf<T.CatalogueItem>().toEqualTypeOf<C.CatalogueItem>();
  expectTypeOf<T.DeliveryCheck>().toEqualTypeOf<C.DeliveryCheck>();
  expectTypeOf<T.DeliveryCheckRequest>().toEqualTypeOf<C.DeliveryCheckRequest>();
  expectTypeOf<T.DeliveryRefusal>().toEqualTypeOf<C.DeliveryRefusal>();
  expectTypeOf<T.PublicBranch>().toEqualTypeOf<C.PublicBranch>();
  expectTypeOf<T.PublicEvent>().toEqualTypeOf<C.PublicEvent>();
  expectTypeOf<T.PublicMerchant>().toEqualTypeOf<C.PublicMerchant>();
  expectTypeOf<T.PublicZone>().toEqualTypeOf<C.PublicZone>();
  expectTypeOf<T.WebhookEvent>().toEqualTypeOf<C.WebhookEvent>();
  expectTypeOf<T.WebhookEventType>().toEqualTypeOf<C.WebhookEventType>();
});
