import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Merchant } from '../../providers/DiscoveryProvider';
import { ImageWithFallback } from '../ImageWithFallback';
import { MerchantLogo } from '../MerchantCard';

/**
 * The header every storefront shares: a full-width cover, a back pill, and the merchant's identity. Wider screens
 * set the identity over the bottom of the cover; phones centre the logo on the cover's lower edge with the name
 * and one quiet line of facts under it (Wolt and Uber Eats on an iPhone 14 Pro). Facts are only what the
 * catalogue confirms (place, count, open state when known); empty facts are dropped, so callers can pass
 * `condition && <>…</>`. Styles live in store.css.
 */
export function StoreHero({ merchant, cover, eyebrow, facts, onBack, backLabel = 'Back', children }: {
  merchant: Merchant;
  /** A cover other than the merchant's own hero image. */
  cover?: string;
  /** A short label above the name, such as the subcategory (on phones it opens the facts line). */
  eyebrow?: string;
  facts?: ReactNode[];
  onBack: () => void;
  backLabel?: string;
  /** Actions beside the name (right-aligned on wide screens, centred on phones). */
  children?: ReactNode;
}) {
  const shown = (facts ?? []).filter(Boolean);
  return <header className="store-hero">
    <ImageWithFallback src={cover || merchant.heroImage} alt="" width={1800} height={600} className="store-hero__image" fetchPriority="high" referrerPolicy="no-referrer" />
    <div className="store-hero__shade" aria-hidden="true" />
    <button type="button" className="store-hero__back" onClick={onBack}><ArrowLeft size={17} strokeWidth={1.75} aria-hidden="true" />{backLabel}</button>
    <div className="store-hero__identity">
      <MerchantLogo merchant={merchant} className="store-hero__logo" eager />
      <div className="store-hero__text">
        {eyebrow && <p className="store-hero__eyebrow">{eyebrow}</p>}
        <h1>{merchant.name}</h1>
        {(shown.length > 0 || eyebrow) && <ul className={`store-hero__facts${shown.length ? '' : ' store-hero__facts--type-only'}`}>
          {eyebrow && <li className="store-hero__type">{eyebrow}</li>}
          {shown.map((fact, index) => <li key={index}>{fact}</li>)}
        </ul>}
      </div>
      {children && <div className="store-hero__actions">{children}</div>}
    </div>
  </header>;
}
