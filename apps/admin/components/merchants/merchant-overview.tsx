import { cn, StatusBadge, type StatusKey } from '@nexg/ui';
import {
  CalendarDays,
  FileCheck2,
  type LucideIcon,
  Mail,
  MapPin,
  Phone,
  Star,
  Store,
  UtensilsCrossed,
  Users,
} from 'lucide-react';

const AVATAR_TONES = [
  'bg-gold-soft text-gold-text',
  'bg-info-bg text-info',
  'bg-success-bg text-success',
  'bg-warning-bg text-warning',
];

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '·';
}

/** `2026-03-04T…` to `4 Mar 2026`, the same on the server and in the browser. */
function shortDate(at: string | null) {
  if (!at) return null;
  const d = new Date(at);
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${d.getUTCDate()} ${month[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function Figure({
  icon: Icon,
  tone,
  label,
  value,
  note,
  href,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: string;
  note: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="border-border bg-surface hover:border-border-strong focus-visible:ring-gold flex items-start gap-3 rounded-2xl border p-4 shadow-[0_1px_2px_rgb(20_20_20/0.04)] transition-[border-color,box-shadow] hover:shadow-[0_10px_30px_-18px_rgb(20_20_20/0.35)] focus-visible:outline-none focus-visible:ring-2"
    >
      <span
        aria-hidden="true"
        className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tone)}
      >
        <Icon className="h-[1.125rem] w-[1.125rem]" />
      </span>
      <span className="min-w-0">
        <span className="text-muted block text-[0.75rem] font-bold">{label}</span>
        <span className="mt-0.5 block truncate text-xl font-extrabold tabular-nums tracking-tight">
          {value}
        </span>
        <span className="text-muted-light block truncate text-[0.6875rem] font-semibold">
          {note}
        </span>
      </span>
    </a>
  );
}

export const MERCHANT_SECTIONS = [
  { id: 'performance', label: 'Performance' },
  { id: 'documents', label: 'Documents' },
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'onboarding', label: 'Onboarding answers' },
  { id: 'business', label: 'Business & actions' },
] as const;

/**
 * Who this merchant is and how they stand, before any detail: contact
 * details to act on, and five figures that each jump to their section.
 */
export function MerchantOverview({
  name,
  legalName,
  status,
  category,
  city,
  contactName,
  phone,
  email,
  phoneVerified,
  joinedAt,
  liveSince,
  documents,
  branches,
  offerings,
  team,
  rating,
}: {
  name: string;
  legalName: string | null;
  status: string;
  category: string | null;
  city: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  phoneVerified: boolean;
  joinedAt: string | null;
  liveSince: string | null;
  documents: { onFile: number; total: number; outstanding: number };
  branches: number;
  offerings: { live: number; total: number };
  team: number | null;
  rating: { value: number | null; count: number };
}) {
  const key = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (
    <section aria-label="Merchant overview" className="space-y-4">
      <div className="border-border bg-surface flex flex-wrap items-start gap-4 rounded-2xl border p-5 shadow-[0_1px_2px_rgb(20_20_20/0.04)] sm:p-6">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold',
            AVATAR_TONES[key % AVATAR_TONES.length],
          )}
        >
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight">{name}</h2>
            <StatusBadge status={status as StatusKey} />
          </div>
          <p className="text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
            {legalName && legalName !== name ? <span>{legalName}</span> : null}
            {category ? <span className="capitalize">{category}</span> : null}
            {city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                {city}
              </span>
            ) : null}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {phone ? (
              <a
                href={`tel:${phone}`}
                className="border-border hover:border-ink inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.8125rem] font-bold"
              >
                <Phone aria-hidden="true" className="h-3.5 w-3.5" />
                {phone}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-[0.625rem] font-extrabold',
                    phoneVerified ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning',
                  )}
                >
                  {phoneVerified ? 'Verified' : 'Unverified'}
                </span>
              </a>
            ) : null}
            {email ? (
              <a
                href={`mailto:${email}`}
                className="border-border hover:border-ink inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.8125rem] font-bold"
              >
                <Mail aria-hidden="true" className="h-3.5 w-3.5" />
                {email}
              </a>
            ) : null}
            {contactName ? (
              <span className="text-muted inline-flex items-center px-1 text-[0.8125rem] font-semibold">
                Contact: {contactName}
              </span>
            ) : null}
          </div>
        </div>
        <dl className="text-muted grid gap-1 text-right text-[0.75rem] font-semibold">
          <div className="flex items-center justify-end gap-1.5">
            <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
            <dt className="sr-only">Joined</dt>
            <dd>Joined {shortDate(joinedAt) ?? '—'}</dd>
          </div>
          <div>
            <dt className="sr-only">Live since</dt>
            <dd>{liveSince ? `Live since ${shortDate(liveSince)}` : 'Not live yet'}</dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Figure
          icon={FileCheck2}
          tone={
            documents.outstanding === 0
              ? 'bg-success-bg text-success'
              : 'bg-warning-bg text-warning'
          }
          label="Documents"
          value={documents.total ? `${documents.onFile} of ${documents.total}` : '—'}
          note={
            documents.total === 0
              ? 'nothing asked yet'
              : documents.outstanding === 0
                ? 'all required verified'
                : `${documents.outstanding} required to verify`
          }
          href="#documents"
        />
        <Figure
          icon={UtensilsCrossed}
          tone="bg-gold-soft text-gold-text"
          label="Offerings"
          value={offerings.total ? `${offerings.live} live` : '—'}
          note={offerings.total ? `of ${offerings.total} in the catalogue` : 'none added yet'}
          href="#catalogue"
        />
        <Figure
          icon={Star}
          tone="bg-info-bg text-info"
          label="Rating"
          value={rating.value === null ? 'No data' : `${rating.value.toFixed(1)} ★`}
          note={rating.count ? `${rating.count} ratings in range` : 'no ratings in range'}
          href="#performance"
        />
        <Figure
          icon={Store}
          tone="bg-bg text-ink"
          label="Branches"
          value={branches ? String(branches) : '—'}
          note={branches === 1 ? 'one location' : branches ? 'locations' : 'none added yet'}
          href="#business"
        />
        <Figure
          icon={Users}
          tone="bg-bg text-ink"
          label="Team"
          value={team === null ? 'No data' : String(team)}
          note={team === 1 ? 'person with access' : 'people with access'}
          href="#business"
        />
      </div>

      <nav
        aria-label="On this page"
        className="border-border bg-bg/85 supports-[backdrop-filter]:bg-bg/70 sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto border-b px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8"
      >
        {MERCHANT_SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="text-muted hover:text-ink hover:bg-surface shrink-0 rounded-lg px-3 py-1.5 text-[0.8125rem] font-bold transition-colors"
          >
            {section.label}
          </a>
        ))}
      </nav>
    </section>
  );
}

/** The first dozen things they sell, on the menu first. */
export function MerchantCatalogue({
  items,
  total,
}: {
  items: { id: string; name: string; price_kes: number | null; available: boolean }[];
  total: number;
}) {
  return (
    <section id="catalogue" aria-labelledby="catalogue-title" className="scroll-mt-24">
      <h2 id="catalogue-title" className="text-lg font-extrabold tracking-tight">
        Catalogue
      </h2>
      <p className="text-muted mt-1 text-sm font-semibold">
        {total === 0
          ? 'Nothing added yet.'
          : `${total} ${total === 1 ? 'offering' : 'offerings'}${
              total > items.length ? `, showing the first ${items.length}` : ''
            }.`}
      </p>
      {items.length ? (
        <ul className="border-border bg-surface divide-border mt-4 divide-y overflow-hidden rounded-2xl border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0 truncate text-sm font-bold">{item.name}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-extrabold tabular-nums">
                  {item.price_kes === null ? (
                    <span className="text-muted-light">No price</span>
                  ) : (
                    <>
                      <span className="text-muted-light mr-1 text-[0.6875rem] font-bold">KES</span>
                      {item.price_kes.toLocaleString('en-KE')}
                    </>
                  )}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold',
                    item.available ? 'bg-success-bg text-success' : 'bg-bg text-muted',
                  )}
                >
                  {item.available ? 'On the menu' : 'Hidden'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
