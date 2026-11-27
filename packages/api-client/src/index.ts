/**
 * The NexG API client: typed calls to https://api.nexgapp.com, and the check
 * for the order and reservation events NexG posts to your endpoints.
 *
 *   const nexg = new NexgClient({ apiKey: process.env.NEXG_API_KEY });
 *   const trip = await nexg.delivery.check({ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng });
 *   const event = await verifyWebhook(rawBody, request.headers.get('NexG-Signature'), secret);
 */
export {
  DEFAULT_BASE_URL,
  NexgClient,
  type CatalogueChange,
  type CatalogueItemChange,
  type ExperienceListParams,
  type MerchantListParams,
  type NexgClientOptions,
  type Page,
  type PageParams,
  type ReservationListParams,
  type TestStage,
  type TestStatus,
} from './client.js';
export {
  NexgApiError,
  NexgConnectionError,
  NexgWebhookError,
  type WebhookFailure,
} from './errors.js';
export { verifyWebhook, type VerifyWebhookOptions } from './webhooks.js';
export type {
  ApiBookingRider,
  ApiBookingRiderLocation,
  ApiOrder,
  ApiReservation,
  ApiReservationSummary,
  ApiService,
  BookingReceipt,
  BookingRequest,
  BookingStatus,
  CatalogueItem,
  DeliveryCheck,
  DeliveryCheckRequest,
  DeliveryRefusal,
  PublicBranch,
  PublicEvent,
  PublicMerchant,
  PublicZone,
  WebhookEvent,
  WebhookEventType,
} from './types.js';
