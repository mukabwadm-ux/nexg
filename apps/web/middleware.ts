import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * The scan happens here, not in the page.
 *
 * A scan has to do two things at once: record itself, and leave the
 * browser holding a session cookie and a signed token for the rest
 * of the visit. A React Server Component can do the first and not
 * the second — Next refuses `cookies().set()` outside a Route
 * Handler, Server Action or middleware, and it refuses it at runtime
 * with a 500, which on this route means a guest standing in a
 * kitchen looking at an error page.
 *
 * So the whole thing happens in one pass here: resolve, set the
 * cookies on the response, and hand the already-resolved payload to
 * the page on a request header. One round trip to the database, no
 * flash of a loading state, and the page stays a pure rendering of
 * what it was given.
 */

const SESSION_COOKIE = 'nxg_sid';
const CONTEXT_COOKIE = 'nxg_ctx';
export const SCAN_HEADER = 'x-nxg-scan';

/*
 * Base64, because a header value is a ByteString — latin-1 — and
 * this payload is full of real typography: an en-dash in a delivery
 * window, a curly apostrophe in a host's hand-off sentence. Setting
 * one of those directly throws at runtime, which turned the one path
 * that matters (a card that resolves) into a 500 while every error
 * path rendered perfectly.
 */
function encodePayload(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

const CODE_PATTERN = /^NXG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

export const config = {
  /*
   * `/q/:code*`, not `/q/:code`.
   *
   * Next silently ignores a matcher it cannot compile, and the
   * single-segment form is one of them: middleware simply never
   * runs, the page renders its "couldn't read that card" state, and
   * nothing anywhere says why. Found by reducing it to a one-line
   * middleware and watching for the compile line in the dev log.
   *
   * The wildcard also matches `/q/{code}/card`, which must NOT
   * record a scan — a host previewing their own card would inflate
   * the number they are previewing. The guard for that is the first
   * thing in the function.
   */
  matcher: ['/q/:code*'],
};

export async function middleware(request: NextRequest) {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);

  /* /q/{code} and nothing below it. The printable card lives at
     /q/{code}/card and must not count as somebody scanning it. */
  if (segments.length !== 2) return NextResponse.next();

  const raw = segments[1] ?? '';
  const bare = decodeURIComponent(raw).toUpperCase().trim();
  const code = bare.startsWith('NXG-') ? bare : `NXG-${bare}`;

  const headers = new Headers(request.headers);

  if (!CODE_PATTERN.test(code)) {
    headers.set(SCAN_HEADER, encodePayload({ ok: false, reason: 'not_found' }));
    return NextResponse.next({ request: { headers } });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    headers.set(SCAN_HEADER, encodePayload({ ok: false, reason: 'unavailable' }));
    return NextResponse.next({ request: { headers } });
  }

  const ua = request.headers.get('user-agent') ?? '';
  const existing = request.cookies.get(SESSION_COOKIE)?.value ?? null;

  let payload: Record<string, unknown> = { ok: false, reason: 'unavailable' };

  try {
    const res = await fetch(`${url}/rest/v1/rpc/rpc_resolve_qr`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        p_code: code,
        p_session_id: existing,
        p_device: {
          /* Families, not versions. A version string is most of a
             fingerprint, and none of this is worth one. */
          ua_family: uaFamily(ua),
          os: osFamily(ua),
          is_mobile: /Mobile|Android|iPhone/i.test(ua),
          lang: (request.headers.get('accept-language') ?? '').split(',')[0]?.slice(0, 5) ?? null,
          is_headless: /HeadlessChrome|PhantomJS|puppeteer/i.test(ua),
        },
        p_referrer: referrerKind(request.headers.get('referer')),
        p_ip_country: request.headers.get('x-vercel-ip-country') ?? null,
      }),
      cache: 'no-store',
    });

    if (res.ok) payload = (await res.json()) as Record<string, unknown>;
  } catch {
    /* A database that cannot be reached is a page that says so, not
       a page that pretends the card is unknown. */
    payload = { ok: false, reason: 'unavailable' };
  }

  headers.set(SCAN_HEADER, encodePayload(payload));
  const response = NextResponse.next({ request: { headers } });

  const secure = process.env.NODE_ENV === 'production';
  const sessionId = payload.session_id as string | undefined;

  if (sessionId && sessionId !== existing) {
    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: 60 * 60 * 24 * 90,
      path: '/',
    });
  }

  /*
   * The ordering context for the rest of the visit, including the
   * signed token checkout hands back so the order service can
   * attribute the order to this exact card. httpOnly: the token is
   * the thing that makes attribution trustworthy, and script that
   * could read it could forge an order's origin.
   */
  if (payload.ok) {
    response.cookies.set(
      CONTEXT_COOKIE,
      JSON.stringify({
        kind: payload.kind,
        label: payload.label,
        qr_id: payload.qr_id,
        scan_token: payload.scan_token,
        context: payload.context ?? null,
      }),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      },
    );
  }

  return response;
}

function uaFamily(ua: string): string {
  if (/HeadlessChrome/i.test(ua)) return 'HeadlessChrome';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV/i.test(ua)) return 'Facebook';
  if (/WhatsApp/i.test(ua)) return 'WhatsApp';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/OPR|Opera/i.test(ua)) return 'Opera';
  if (/Edg/i.test(ua)) return 'Edge';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Chrome|CriOS/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'Other';
}

function osFamily(ua: string): string {
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iOS/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Other';
}

/*
 * A camera scan sends no referrer. That absence is the signal that
 * somebody actually pointed a phone at the card, rather than opening
 * a link somebody forwarded — a different and much less valuable
 * kind of visit, and one worth being able to tell apart.
 */
function referrerKind(referer: string | null): string {
  if (!referer) return 'camera';
  if (/instagram|facebook|whatsapp|t\.co|tiktok/i.test(referer)) return 'in_app_browser';
  return 'copied_link';
}
