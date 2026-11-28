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
  expectTypeOf<T.ApiBookingRider>().toEqualTypeOf<C.ApiBookingRider>();
  expectTypeOf<T.ApiBookingRiderLocation>().toEqualTypeOf<C.ApiBookingRiderLocation>();
  expectTypeOf<T.ApiOrder>().toEqualTypeOf<C.ApiOrder>();
  expectTypeOf<T.ApiClosure>().toEqualTypeOf<C.ApiClosure>();
  expectTypeOf<T.ApiDeparture>().toEqualTypeOf<C.ApiDeparture>();
  expectTypeOf<T.ApiOffering>().toEqualTypeOf<C.ApiOffering>();
  expectTypeOf<T.ApiReservation>().toEqualTypeOf<C.ApiReservation>();
  expectTypeOf<T.ApiReservationDriver>().toEqualTypeOf<C.ApiReservationDriver>();
  expectTypeOf<T.ApiReservationSummary>().toEqualTypeOf<C.ApiReservationSummary>();
  expectTypeOf<T.ApiResource>().toEqualTypeOf<C.ApiResource>();
  expectTypeOf<T.ClosureRequest>().toEqualTypeOf<C.ClosureRequest>();
  expectTypeOf<T.DepartureRequest>().toEqualTypeOf<C.DepartureRequest>();
  expectTypeOf<T.DriverLocationRequest>().toEqualTypeOf<C.DriverLocationRequest>();
  expectTypeOf<T.OfferingCreate>().toEqualTypeOf<C.OfferingCreate>();
  expectTypeOf<T.OfferingUpdate>().toEqualTypeOf<C.OfferingUpdate>();
  expectTypeOf<T.ReservationCreate>().toEqualTypeOf<z.input<typeof C.ReservationCreate>>();
  expectTypeOf<T.ResourceCreate>().toEqualTypeOf<C.ResourceCreate>();
  expectTypeOf<T.TestReservationRequest>().toEqualTypeOf<C.TestReservationRequest>();
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
