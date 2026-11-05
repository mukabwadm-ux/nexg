'use client';

import { ChevronRight, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useState, type ComponentProps } from 'react';

import { day, kesWhole } from '@/components/partner/bits';
import {
  Featured,
  featuredPlacementLabel,
  type Booking,
} from '@/components/partner/merchant-featured';

import {
  PromotionsFrame,
  PromotionStatus,
  PromotionTable,
  PromotionTabs,
  type PromotionTab,
} from './presentation';

const finished = new Set(['ended', 'declined', 'expired', 'cancelled']);
const tones: Record<string, ComponentProps<typeof PromotionStatus>['tone']> = {
  live: 'green',
  booked: 'blue',
  requested: 'amber',
  quoted: 'amber',
  waitlisted: 'amber',
  paused: 'amber',
  auto_paused: 'amber',
  declined: 'red',
  cancelled: 'red',
};

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ');
}

function period(booking: Booking) {
  if (booking.start_date && booking.end_date) {
    return day(booking.start_date) + ' – ' + day(booking.end_date);
  }
  if (booking.wanted_start) return 'Requested week of ' + day(booking.wanted_start);
  return 'Dates to be confirmed';
}

export function LivePromotionsWorkspace({
  businessName,
  bookings,
  request,
  requestNotice,
}: {
  businessName: string;
  bookings: Booking[] | null;
  request: ComponentProps<typeof Featured> | null;
  requestNotice?: string;
}) {
  const [tab, setTab] = useState<PromotionTab>('Campaigns');
  const [selectedId, setSelectedId] = useState('');
  const records =
    bookings?.filter((booking) => finished.has(booking.status) === (tab === 'History')) ?? [];
  const selected = records.find((booking) => booking.id === selectedId) ?? records[0];

  return (
    <PromotionsFrame
      title="Promotions"
      businessName={businessName}
      action={
        tab === 'Campaigns' &&
        request && (
          <a href="#featured-placement" className="pm-button pm-primary">
            <Megaphone size={16} aria-hidden /> Manage featured placement
          </a>
        )
      }
    >
      <PromotionTabs
        active={tab}
        onSelect={(next) => {
          setTab(next);
          setSelectedId('');
        }}
      />
      <div
        className="pm-grid"
        role="tabpanel"
        id={'pm-panel-' + tab}
        aria-labelledby={'pm-tab-' + tab}
      >
        <section className="pm-panel">
          <h2>{tab === 'Campaigns' ? 'Your campaigns' : 'Promotion history'}</h2>
          <p className="pm-lead">
            {tab === 'Campaigns'
              ? 'Request a featured placement or track one already in progress.'
              : 'See how your most recent featured placements finished.'}
          </p>
          {!bookings ? (
            <div className="pm-empty" role="alert">
              <strong>Campaigns could not be loaded</strong>
              <p>
                <Link href="/merchant/promotions" className="pm-link">
                  Reload Promotions
                </Link>
              </p>
            </div>
          ) : records.length ? (
            <PromotionTable tab={tab}>
              {records.map((booking) => {
                const name = featuredPlacementLabel(booking.placement_kind);
                return (
                  <tr key={booking.id} data-selected={selected?.id === booking.id}>
                    <td>
                      <div className="pm-campaign-cell">
                        <span className="pm-campaign-icon" aria-hidden>
                          <Megaphone size={17} />
                        </span>
                        <button
                          type="button"
                          className="pm-row-button"
                          onClick={() => setSelectedId(booking.id)}
                        >
                          {name}
                        </button>
                      </div>
                    </td>
                    <td>Featured placement</td>
                    <td className="pm-desktop-column">
                      {tab === 'History' ? period(booking) : businessName}
                    </td>
                    <td>
                      <PromotionStatus
                        label={statusLabel(booking.status)}
                        tone={tones[booking.status] ?? 'grey'}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="pm-icon"
                        aria-label={'Open ' + name}
                        onClick={() => setSelectedId(booking.id)}
                      >
                        <ChevronRight size={16} aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </PromotionTable>
          ) : (
            <div className="pm-empty">
              <strong>
                {tab === 'Campaigns'
                  ? 'No current featured campaigns'
                  : 'No featured campaign history yet'}
              </strong>
            </div>
          )}
        </section>
        <div className="space-y-4">
          <aside className="pm-panel" aria-label="Selected promotion details">
            {selected ? (
              <>
                <div className="pm-detail-head">
                  <h2>{featuredPlacementLabel(selected.placement_kind)}</h2>
                  <PromotionStatus
                    label={statusLabel(selected.status)}
                    tone={tones[selected.status] ?? 'grey'}
                    badge
                  />
                </div>
                <p className="pm-lead">{period(selected)}</p>
                <p className="pm-lead">Requested {day(selected.requested_at)}</p>
                <p className="pm-lead">
                  {selected.quoted_price === null
                    ? 'Quote pending'
                    : 'Quoted weekly rate: ' + kesWhole(selected.quoted_price)}
                </p>
              </>
            ) : (
              <>
                <h2>Featured placement</h2>
                <p className="pm-lead">
                  Place a sponsored card in Explore for an eligible business and location.
                </p>
              </>
            )}
          </aside>
          {tab === 'Campaigns' && (
            <section id="featured-placement" aria-label="Manage featured placement">
              {request ? (
                <Featured {...request} showHistory={false} />
              ) : (
                <div className="pm-panel">
                  <h2>Request a placement</h2>
                  <p className="pm-lead">{requestNotice}</p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </PromotionsFrame>
  );
}
