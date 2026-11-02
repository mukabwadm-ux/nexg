import { createHash } from 'node:crypto';
export * from './security';

export const GOOGLE_PORTAL_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export const GOOGLE_FREE_BUSY_SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';
export const GOOGLE_TIMEZONE = 'Africa/Nairobi' as const;
const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleErrorCode =
  | 'authorization_revoked'
  | 'permission_denied'
  | 'rate_limited'
  | 'unavailable'
  | 'not_found'
  | 'conflict'
  | 'not_owned'
  | 'invalid_input'
  | 'invalid_response';
export class GoogleCalendarError extends Error {
  constructor(
    public readonly code: GoogleErrorCode,
    message: string,
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'GoogleCalendarError';
  }
}
export interface GoogleTokens {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
  scopes: string[];
  refreshToken?: string;
}
export interface PortalCalendarReference {
  id: string;
  businessId: string;
  userId: string;
  createdByNexg: true;
}
export interface GoogleBookingEventInput {
  accessToken: string;
  calendar: PortalCalendarReference;
  businessId: string;
  bookingId: string;
  revision: number;
  start: string;
  end: string;
  summary?: string;
}
export interface GoogleEventResult {
  eventId: string;
  revision: number;
  outcome: 'created' | 'updated' | 'unchanged' | 'superseded';
}
export interface BusyInterval {
  calendarId: string;
  start: string;
  end: string;
}
export type BusyResult =
  | { state: 'CURRENT'; intervals: BusyInterval[]; observedAt: string }
  | { state: 'DISABLED'; reason: string }
  | { state: 'UNKNOWN'; reason: GoogleErrorCode; retryAfterSeconds?: number; observedAt: string };
export interface GoogleCalendarAdapterOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  requestTimeoutMs?: number;
}
interface ApiEvent {
  id: string;
  etag: string;
  status?: string;
  extendedProperties?: { private?: Record<string, string> };
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function invalid(message: string): never {
  throw new GoogleCalendarError('invalid_input', message);
}
function requireText(value: string, label: string): void {
  if (!value || value.length > 1000) invalid(`${label} is required and must be bounded.`);
}
function instant(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return false;
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10));
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day &&
    Number(value.slice(11, 13)) <= 23 &&
    Number(value.slice(14, 16)) <= 59 &&
    Number(value.slice(17, 19)) <= 59
  );
}
function requireInterval(start: string, end: string): void {
  if (!instant(start) || !instant(end) || Date.parse(start) >= Date.parse(end))
    invalid('Use an increasing RFC3339 interval with explicit UTC offset.');
}
function errorFor(
  status: number,
  body: unknown,
  retryAfter: string | null,
  now: number,
): GoogleCalendarError {
  let retry: number | undefined;
  if (retryAfter) {
    const parsed = Number(retryAfter);
    retry = Number.isFinite(parsed)
      ? Math.max(0, parsed)
      : Math.max(0, (Date.parse(retryAfter) - now) / 1000);
    if (!Number.isFinite(retry)) retry = undefined;
  }
  const reason =
    record(body) && record(body.error) && Array.isArray(body.error.errors)
      ? body.error.errors.map((item) => (record(item) ? item.reason : undefined))
      : [];
  if (
    status === 429 ||
    reason.some((item) => item === 'rateLimitExceeded' || item === 'userRateLimitExceeded')
  )
    return new GoogleCalendarError(
      'rate_limited',
      'Google Calendar rate limit reached.',
      status,
      retry,
    );
  if (status === 401 || (record(body) && body.error === 'invalid_grant'))
    return new GoogleCalendarError(
      'authorization_revoked',
      'Google authorization must be renewed.',
      status,
    );
  if (status === 403)
    return new GoogleCalendarError(
      'permission_denied',
      'Google Calendar permission is unavailable.',
      status,
    );
  if (status === 404 || status === 410)
    return new GoogleCalendarError('not_found', 'Google Calendar item no longer exists.', status);
  if (status === 409 || status === 412)
    return new GoogleCalendarError(
      'conflict',
      'Google Calendar changed concurrently; retry after reading it.',
      status,
    );
  return new GoogleCalendarError('unavailable', 'Google Calendar request failed.', status, retry);
}

/** A stable ID permits safe insertion retry after a network failure. Hex is a valid subset of Google's base32hex alphabet. */
export function googleBookingEventId(businessId: string, bookingId: string): string {
  requireText(businessId, 'Business ID');
  requireText(bookingId, 'Booking ID');
  return `be${createHash('sha256')
    .update(JSON.stringify([businessId, bookingId]))
    .digest('hex')}`;
}

/** Server-only adapter. It never mutates native bookings and does not use primary calendars. */
export class GoogleCalendarAdapter {
  private readonly http: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly timeout: number;
  constructor(private readonly options: GoogleCalendarAdapterOptions) {
    requireText(options.clientId, 'Google client ID');
    requireText(options.clientSecret, 'Google client secret');
    const redirect = new URL(options.redirectUri);
    if (
      redirect.protocol !== 'https:' &&
      !(redirect.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(redirect.hostname))
    )
      invalid('OAuth redirect URI must use HTTPS or local development HTTP.');
    this.http = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.timeout = options.requestTimeoutMs ?? 10_000;
  }
  authorizationUrl(input: { state: string; includeFreeBusy?: boolean }): string {
    requireText(input.state, 'OAuth state');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state: input.state,
      scope: [
        GOOGLE_PORTAL_SCOPE,
        ...(input.includeFreeBusy === true ? [GOOGLE_FREE_BUSY_SCOPE] : []),
      ].join(' '),
    }).toString();
    return url.toString();
  }
  private async request(url: string, init: RequestInit, accessToken?: string): Promise<unknown> {
    const headers = new Headers(init.headers);
    if (accessToken) {
      requireText(accessToken, 'Google access token');
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    let response: Response;
    try {
      response = await this.http(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch {
      throw new GoogleCalendarError('unavailable', 'Google Calendar could not be reached.');
    }
    let body: unknown;
    if (response.status !== 204) {
      try {
        body = await response.json();
      } catch {
        if (response.ok)
          throw new GoogleCalendarError(
            'invalid_response',
            'Google returned an invalid JSON response.',
            response.status,
          );
      }
    }
    if (!response.ok)
      throw errorFor(response.status, body, response.headers.get('Retry-After'), this.now());
    return body;
  }
  private async tokens(
    parameters: Record<string, string>,
    previousRefreshToken?: string,
  ): Promise<GoogleTokens> {
    const body = await this.request(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        ...parameters,
      }).toString(),
    });
    if (
      !record(body) ||
      !nonempty(body.access_token) ||
      body.token_type !== 'Bearer' ||
      typeof body.expires_in !== 'number' ||
      body.expires_in <= 0
    )
      throw new GoogleCalendarError('invalid_response', 'Google returned invalid token metadata.');
    return {
      accessToken: body.access_token,
      tokenType: 'Bearer',
      expiresAt: new Date(this.now() + body.expires_in * 1000).toISOString(),
      scopes: typeof body.scope === 'string' ? body.scope.split(' ').filter(Boolean) : [],
      ...(nonempty(body.refresh_token)
        ? { refreshToken: body.refresh_token }
        : previousRefreshToken
          ? { refreshToken: previousRefreshToken }
          : {}),
    };
  }
  exchangeCode(input: { code: string }): Promise<GoogleTokens> {
    requireText(input.code, 'Authorization code');
    return this.tokens({
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: this.options.redirectUri,
    });
  }
  refreshAccessToken(input: { refreshToken: string }): Promise<GoogleTokens> {
    requireText(input.refreshToken, 'Refresh token');
    return this.tokens(
      { refresh_token: input.refreshToken, grant_type: 'refresh_token' },
      input.refreshToken,
    );
  }
  async createPortalCalendar(input: {
    accessToken: string;
    businessId: string;
    userId: string;
    name: string;
  }): Promise<PortalCalendarReference> {
    requireText(input.businessId, 'Business ID');
    requireText(input.userId, 'User ID');
    requireText(input.name, 'Calendar name');
    const result = await this.request(
      `${API}/calendars`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: input.name,
          timeZone: GOOGLE_TIMEZONE,
          description:
            'Optional NEXG booking mirror. Manage bookings in your NEXG merchant portal.',
        }),
      },
      input.accessToken,
    );
    if (!record(result) || !nonempty(result.id) || result.id === 'primary')
      throw new GoogleCalendarError(
        'invalid_response',
        'Google did not return a secondary calendar ID.',
      );
    return {
      id: result.id,
      businessId: input.businessId,
      userId: input.userId,
      createdByNexg: true,
    };
  }
  private calendar(input: { calendar: PortalCalendarReference; businessId: string }): string {
    if (
      input.calendar.createdByNexg !== true ||
      input.calendar.businessId !== input.businessId ||
      !input.calendar.id ||
      input.calendar.id === 'primary'
    )
      invalid('Use the persisted NEXG-created calendar for this business.');
    return `${API}/calendars/${encodeURIComponent(input.calendar.id)}/events`;
  }
  private async getEvent(url: string, accessToken: string): Promise<ApiEvent | undefined> {
    try {
      const event = await this.request(url, { method: 'GET' }, accessToken);
      if (!record(event) || !nonempty(event.id) || !nonempty(event.etag))
        throw new GoogleCalendarError('invalid_response', 'Google returned an incomplete event.');
      return event as unknown as ApiEvent;
    } catch (error) {
      if (error instanceof GoogleCalendarError && error.code === 'not_found') return undefined;
      throw error;
    }
  }
  private ownedRevision(event: ApiEvent, businessId: string, bookingId: string): number {
    const properties = event.extendedProperties?.private;
    if (
      !properties ||
      properties.nexgBusinessId !== businessId ||
      properties.nexgBookingId !== bookingId
    )
      throw new GoogleCalendarError(
        'not_owned',
        'The Google event is not owned by this NEXG booking.',
      );
    const revision = Number(properties.nexgRevision);
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw new GoogleCalendarError('invalid_response', 'Google event revision is invalid.');
    return revision;
  }
  async upsertBookingEvent(input: GoogleBookingEventInput): Promise<GoogleEventResult> {
    requireInterval(input.start, input.end);
    if (!Number.isSafeInteger(input.revision) || input.revision < 1)
      invalid('A positive monotonic booking revision is required.');
    const eventId = googleBookingEventId(input.businessId, input.bookingId);
    const base = this.calendar(input);
    const url = `${base}/${eventId}`;
    const payload = {
      id: eventId,
      summary: input.summary ?? 'NEXG booking',
      start: { dateTime: input.start, timeZone: GOOGLE_TIMEZONE },
      end: { dateTime: input.end, timeZone: GOOGLE_TIMEZONE },
      extendedProperties: {
        private: {
          nexgBusinessId: input.businessId,
          nexgBookingId: input.bookingId,
          nexgRevision: String(input.revision),
        },
      },
    };
    const existing = await this.getEvent(url, input.accessToken);
    if (existing) return this.updateExisting(existing, input, payload, url, eventId);
    try {
      const created = await this.request(
        `${base}?sendUpdates=none`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        input.accessToken,
      );
      if (!record(created) || created.id !== eventId)
        throw new GoogleCalendarError(
          'invalid_response',
          'Google did not confirm the stable event ID.',
        );
      return { eventId, revision: input.revision, outcome: 'created' };
    } catch (error) {
      if (!(error instanceof GoogleCalendarError) || error.status !== 409) throw error;
      const raced = await this.getEvent(url, input.accessToken);
      if (!raced) throw error;
      return this.updateExisting(raced, input, payload, url, eventId);
    }
  }
  private async updateExisting(
    existing: ApiEvent,
    input: GoogleBookingEventInput,
    payload: object,
    url: string,
    eventId: string,
  ): Promise<GoogleEventResult> {
    const previous = this.ownedRevision(existing, input.businessId, input.bookingId);
    if (previous >= input.revision)
      return {
        eventId,
        revision: previous,
        outcome: previous > input.revision ? 'superseded' : 'unchanged',
      };
    // A cancelled Google tombstone is never revived implicitly: the mirror needs operator repair.
    if (existing.status === 'cancelled')
      throw new GoogleCalendarError(
        'conflict',
        'The Google mirror was deleted; reconnect or repair the mirror.',
      );
    const updated = await this.request(
      `${url}?sendUpdates=none`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': existing.etag },
        body: JSON.stringify(payload),
      },
      input.accessToken,
    );
    if (!record(updated) || updated.id !== eventId)
      throw new GoogleCalendarError(
        'invalid_response',
        'Google did not confirm the updated event ID.',
      );
    return { eventId, revision: input.revision, outcome: 'updated' };
  }
  async deleteBookingEvent(input: {
    accessToken: string;
    calendar: PortalCalendarReference;
    businessId: string;
    bookingId: string;
    revision: number;
  }): Promise<{ eventId: string; outcome: 'deleted' | 'absent' | 'superseded' }> {
    if (!Number.isSafeInteger(input.revision) || input.revision < 1)
      invalid('A positive monotonic booking revision is required.');
    const eventId = googleBookingEventId(input.businessId, input.bookingId);
    const url = `${this.calendar(input)}/${eventId}`;
    const existing = await this.getEvent(url, input.accessToken);
    if (!existing) return { eventId, outcome: 'absent' };
    if (this.ownedRevision(existing, input.businessId, input.bookingId) > input.revision)
      return { eventId, outcome: 'superseded' };
    if (existing.status === 'cancelled') return { eventId, outcome: 'absent' };
    try {
      await this.request(
        `${url}?sendUpdates=none`,
        { method: 'DELETE', headers: { 'If-Match': existing.etag } },
        input.accessToken,
      );
    } catch (error) {
      if (!(error instanceof GoogleCalendarError) || error.code !== 'not_found') throw error;
    }
    return { eventId, outcome: 'deleted' };
  }
  async readBusyIntervals(input: {
    accessToken: string;
    freeBusyEnabled: boolean;
    selectedCalendarIds: string[];
    timeMin: string;
    timeMax: string;
  }): Promise<BusyResult> {
    if (!input.freeBusyEnabled)
      return { state: 'DISABLED', reason: 'External busy-time checking has not been enabled.' };
    requireInterval(input.timeMin, input.timeMax);
    const ids = [...new Set(input.selectedCalendarIds)];
    if (ids.length < 1 || ids.length > 50 || ids.some((id) => !id || id.length > 1000))
      invalid('Explicitly select between 1 and 50 calendars for busy-time checking.');
    const observedAt = new Date(this.now()).toISOString();
    try {
      const result = await this.request(
        `${API}/freeBusy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeMin: input.timeMin,
            timeMax: input.timeMax,
            timeZone: GOOGLE_TIMEZONE,
            items: ids.map((id) => ({ id })),
          }),
        },
        input.accessToken,
      );
      if (!record(result) || !record(result.calendars))
        throw new GoogleCalendarError(
          'invalid_response',
          'Google did not return calendar availability.',
        );
      const intervals: BusyInterval[] = [];
      for (const calendarId of ids) {
        const calendar = result.calendars[calendarId];
        if (
          !record(calendar) ||
          (Array.isArray(calendar.errors) && calendar.errors.length > 0) ||
          !Array.isArray(calendar.busy)
        )
          throw new GoogleCalendarError(
            'unavailable',
            'At least one selected Google calendar could not be read.',
          );
        for (const busy of calendar.busy) {
          if (
            !record(busy) ||
            !instant(busy.start) ||
            !instant(busy.end) ||
            Date.parse(busy.start) >= Date.parse(busy.end)
          )
            throw new GoogleCalendarError(
              'invalid_response',
              'Google returned an invalid busy interval.',
            );
          intervals.push({ calendarId, start: busy.start, end: busy.end });
        }
      }
      return { state: 'CURRENT', intervals, observedAt };
    } catch (error) {
      if (!(error instanceof GoogleCalendarError)) throw error;
      return {
        state: 'UNKNOWN',
        reason: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
        observedAt,
      };
    }
  }
}
