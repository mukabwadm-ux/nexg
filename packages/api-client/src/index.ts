/**
 * The NexG API client: typed calls to https://api.nexgapp.com, and the check
 * for the order events NexG posts to your endpoints.
 *
 *   const nexg = new NexgClient({ apiKey: process.env.NEXG_API_KEY });
 *   const trip = await nexg.delivery.check({ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng });
 *   const event = await verifyWebhook(rawBody, request.headers.get('NexG-Signature'), secret);
 */
export {
  DEFAULT_BASE_URL,
  NexgClient,
  type BookingRequest,
  type CatalogueChange,
  type CatalogueItemChange,
  type ExperienceListParams,
  type MerchantListParams,
  type NexgClientOptions,
  type Page,
  type PageParams,
  type TestStage,
  type TestStatus,
} from './client';
export { NexgApiError, NexgConnectionError, NexgWebhookError, type WebhookFailure } from './errors';
export { verifyWebhook, type VerifyWebhookOptions } from './webhooks';
export type {
  ApiOrder,
  ApiService,
  BookingReceipt,
  BookingStatus,
  CatalogueItem,
  DeliveryCheck,
  DeliveryCheckRequest,
  PublicBranch,
  PublicEvent,
  PublicMerchant,
  PublicZone,
  WebhookEvent,
} from '@nexg/contracts/api';
