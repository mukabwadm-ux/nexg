import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Merchant } from '../../providers/DiscoveryProvider';
import { ImageWithFallback } from '../ImageWithFallback';

/**
 * The header every storefront shares: a full-width cover, a back pill, and the merchant's identity over the
 * bottom of the cover. Facts are only what the catalogue confirms (place, count, open state when known);
 * empty facts are dropped, so callers can pass `condition && <>…</>`. Styles live in store.css.
 */
export function StoreHero({ merchant, cover, eyebrow, facts, onBack, backLabel = 'Back', children }: {
  merchant: Merchant;
  /** A cover other than the merchant's own hero image. */
  cover?: string;
  /** A short label above the name, such as the subcategory. */
  eyebrow?: string;
  facts?: ReactNode[];
  onBack: () => void;
  backLabel?: string;
  /** Actions beside the name (right-aligned on wide screens). */
  children?: ReactNode;
}) {
  const shown = (facts ?? []).filter(Boolean);
  return <header className="store-hero">
    <ImageWithFallback src={cover || merchant.heroImage} alt="" width={1800} height={600} className="store-hero__image" fetchPriority="high" referrerPolicy="no-referrer" />
    <div className="store-hero__shade" aria-hidden="true" />
    <button type="button" className="store-hero__back" onClick={onBack}><ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />{backLabel}</button>
    <div className="store-hero__identity">
      {merchant.logoUrl && <ImageWithFallback src={merchant.logoUrl} alt="" width={96} height={96} className="store-hero__logo" referrerPolicy="no-referrer" />}
      <div className="store-hero__text">
        {eyebrow && <p className="store-hero__eyebrow">{eyebrow}</p>}
        <h1>{merchant.name}</h1>
        {shown.length > 0 && <ul className="store-hero__facts">{shown.map((fact, index) => <li key={index}>{fact}</li>)}</ul>}
      </div>
      {children && <div className="store-hero__actions">{children}</div>}
    </div>
  </header>;
}
