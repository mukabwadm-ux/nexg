import { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import './store-booking.css';

/**
 * "Book online" for a store whose owner has published services in the NexG booking engine.
 *
 * This replaces the Book button on the retired Explore page. It reads the same public catalog the booking page
 * reads, through the NexG website (`/api/public/booking/:id/catalog`), and draws nothing until that catalog has at
 * least one published service. Standalone Discovery has no such route, so the bar simply never shows there.
 */
export function StoreBookingBar({ merchantId }: { merchantId: string }) {
  const [published, setPublished] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/public/booking/${encodeURIComponent(merchantId)}/catalog`, { signal: controller.signal, headers: { accept: 'application/json' } })
      .then(response => (response.ok ? response.json() : null))
      .then((catalog: { business?: { id?: string }; offerings?: unknown[] } | null) => {
        if (!controller.signal.aborted && catalog?.business?.id === merchantId && Array.isArray(catalog.offerings) && catalog.offerings.length > 0)
          setPublished(merchantId);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [merchantId]);

  if (published !== merchantId) return null;
  return <aside className="store-booking" aria-label="Online booking">
    <CalendarCheck size={18} strokeWidth={2} aria-hidden="true" />
    <span className="store-booking__text">This business takes bookings online.</span>
    <a className="button button--primary store-booking__action" href={`/book/${encodeURIComponent(merchantId)}`}>View booking options</a>
  </aside>;
}
