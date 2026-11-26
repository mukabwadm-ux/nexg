import { isMeasurementId } from '@/lib/consent/cookie';

export const dynamic = 'force-dynamic';

/*
 * GET /api/public/analytics: whether this deployment has a Google Analytics 4
 * measurement ID, for the console's Integrations page (a separate Vercel
 * project that cannot read this one's environment).
 *
 * The ID itself is public: once analytics is allowed it is in every page's
 * script URL. Nothing else is said.
 */
export function GET() {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const configured = isMeasurementId(id);
  return Response.json(
    {
      provider: 'google_analytics_4',
      configured,
      measurementId: configured ? id : null,
      /* Set but not in the G-XXXX form, so the site ignores it. */
      invalid: Boolean(id) && !configured,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
