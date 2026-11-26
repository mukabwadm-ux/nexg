/**
 * Whether the public site (the nexg web project in Vercel) has a Google
 * Analytics 4 measurement ID. The console is a separate project and cannot
 * read the web project's environment, so it asks the site, which answers at
 * /api/public/analytics with a yes or no and the public measurement ID.
 */

export type WebAnalyticsStatus =
  | { kind: 'configured'; measurementId: string }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'unknown'; reason: string };

export const GA_ENV_NAME = 'NEXT_PUBLIC_GA_MEASUREMENT_ID';

function webOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_WEB_ORIGIN ??
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://nexgapp.com')
  ).replace(/\/$/, '');
}

export async function webAnalyticsStatus(): Promise<WebAnalyticsStatus> {
  try {
    const response = await fetch(`${webOrigin()}/api/public/analytics`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    /* An older deployment of the site, from before this check existed. */
    if (response.status === 404) return { kind: 'unknown', reason: 'not_deployed' };
    if (!response.ok) return { kind: 'unknown', reason: `HTTP ${response.status}` };
    const body = (await response.json()) as {
      configured?: unknown;
      measurementId?: unknown;
      invalid?: unknown;
    };
    if (body.configured === true && typeof body.measurementId === 'string') {
      return { kind: 'configured', measurementId: body.measurementId };
    }
    return body.invalid === true ? { kind: 'invalid' } : { kind: 'missing' };
  } catch {
    return { kind: 'unknown', reason: 'unreachable' };
  }
}
