import { useState, type ReactNode } from 'react';
import { ArrowRight, Bike, Clock, Star } from 'lucide-react';
import type { Merchant, ObservationBinding } from '../providers/DiscoveryProvider';
import { useResultObservation } from '../hooks/useResultObservation';
import { formatPrice } from '../lib/formatPrice';
import { ImageWithFallback } from './ImageWithFallback';
import './discovery.css';

export { formatPrice } from '../lib/formatPrice';

interface MerchantCardProps {
  merchant: Merchant;
  onOpen: (merchantId: string, itemId?: string) => void;
  /** Every mode shares the framed card; `host` is the small profile row used on detail pages. */
  mode?: 'standard' | 'compact' | 'food' | 'host';
  observation?: ObservationBinding;
}

const initial = (name: string) => (/[\p{L}\p{N}]/u.exec(name)?.[0] ?? '•').toLocaleUpperCase('en-KE');

/** The merchant's logo, or its first letter when the catalogue has no logo or the image fails. */
export function MerchantLogo({ merchant, className = '' }: { merchant: Pick<Merchant, 'name' | 'logoUrl'>; className?: string }) {
  const [failed, setFailed] = useState<string>();
  if (merchant.logoUrl && failed !== merchant.logoUrl) {
    return <img className={`merchant-logo ${className}`.trim()} src={merchant.logoUrl} alt="" width={96} height={96} loading="lazy" decoding="async"
      referrerPolicy="no-referrer" onError={() => setFailed(merchant.logoUrl)} />;
  }
  return <span className={`merchant-logo merchant-logo--initial ${className}`.trim()} aria-hidden="true">{initial(merchant.name)}</span>;
}

/** "Restaurant · Westlands": the merchant's type and place, with separators hidden from screen readers. */
export function MerchantMeta({ merchant, className }: { merchant: Merchant; className?: string }) {
  const parts = [merchant.subcategory || merchant.category, merchant.area || merchant.address].filter((part): part is string => Boolean(part));
  if (!parts.length) return null;
  return <span className={className}>{parts.map((part, index) => <span key={index}>{index > 0 && <span aria-hidden="true"> · </span>}{part}</span>)}</span>;
}

/**
 * What a card may say beyond the name: only facts the catalogue confirms (`displayFacts`). The ranking-only
 * fields (rating, delivery minutes, "featured") are never shown, so nothing here is estimated.
 */
export function merchantFacts(merchant: Merchant): { key: string; content: ReactNode }[] {
  const facts = merchant.displayFacts;
  const list: { key: string; content: ReactNode }[] = [];
  const rating = facts?.rating;
  if (rating && Number.isFinite(rating.value) && rating.value >= 0 && rating.value <= 5) {
    const count = rating.count !== undefined && Number.isFinite(rating.count) && rating.count >= 0 ? rating.count : undefined;
    list.push({ key: 'rating', content: <><Star size={14} strokeWidth={2} fill="currentColor" aria-hidden="true" /><span className="sr-only">Rated </span>{rating.value.toFixed(1)}
      <span className="sr-only"> out of 5</span>{count !== undefined && <small>({new Intl.NumberFormat('en-KE', { notation: 'compact' }).format(count)}<span className="sr-only"> reviews</span>)</small>}</> });
  }
  const fee = facts?.deliveryFee && formatPrice(facts.deliveryFee, 'code');
  if (fee) list.push({ key: 'fee', content: <><Bike size={15} strokeWidth={1.75} aria-hidden="true" />{fee} delivery</> });
  if (facts?.deliveryTime) list.push({ key: 'time', content: <><Clock size={14} strokeWidth={1.75} aria-hidden="true" /><span className="sr-only">Delivery in </span>{facts.deliveryTime}</> });
  return list;
}

/**
 * The one merchant card: a framed cover, the logo beside the name, type and place, confirmed facts, and
 * "View store". Rails and grids size it; `host` keeps the compact profile row detail pages use.
 */
export function MerchantCard({ merchant, onOpen, mode = 'standard', observation }: MerchantCardProps) {
  const observed = useResultObservation(observation);
  const host = mode === 'host';
  const facts = merchantFacts(merchant);
  const promotion = merchant.displayFacts?.promotion;
  return <article ref={observed.ref} className={`merchant-card merchant-card--${mode}`} data-discovery-merchant={merchant.id}>
    <button type="button" className="merchant-card__main" onClick={() => { observed.detailOpened(); onOpen(merchant.id); }}>
      <span className="merchant-card__cover">
        <ImageWithFallback src={host ? merchant.logoUrl || merchant.heroImage : merchant.heroImage} alt="" width={640} height={400}
          className="merchant-card__hero" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        {promotion && !host && <span className="merchant-card__promotion">{promotion}</span>}
      </span>
      <span className="merchant-card__body">
        <span className="merchant-card__identity">
          {!host && <MerchantLogo merchant={merchant} className="merchant-card__logo" />}
          <span className="merchant-card__text">
            <span className="merchant-card__name">{merchant.name}</span>
            <MerchantMeta merchant={merchant} className="merchant-card__meta" />
          </span>
        </span>
        {facts.length > 0 && <span className="merchant-card__facts">{facts.map((fact) => <span key={fact.key}>{fact.content}</span>)}</span>}
        <span className="merchant-card__action">View store<ArrowRight size={16} strokeWidth={2} aria-hidden="true" /></span>
      </span>
    </button>
  </article>;
}
