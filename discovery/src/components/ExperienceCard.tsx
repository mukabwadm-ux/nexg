import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CatalogItem, Merchant } from '../providers/DiscoveryProvider';
import { experienceLabel } from '../data/experiencePresentation';
import { isTourOperator, tourLabel } from '../data/tourPresentation';
import { offeringKind, type OfferingKind } from '../data/offeringKinds';
import { OfferingCard } from './cards/OfferingCard';
import { Rail } from './Rail';

/*
 * Hearts on discovery cards. They are kept in memory for this visit only, so a heart stays filled while the
 * shopper moves between discovery pages, and nothing is stored or sent anywhere (SavedNotice says so).
 */
let savedState: { ids: ReadonlySet<string>; savedAt: number } = { ids: new Set(), savedAt: 0 };
const savedListeners = new Set<() => void>();
const subscribeSaved = (listener: () => void) => { savedListeners.add(listener); return () => { savedListeners.delete(listener); }; };
const readSaved = () => savedState;
function toggleSaved(id: string) {
  const ids = new Set(savedState.ids);
  const adding = !ids.has(id);
  if (adding) ids.add(id); else ids.delete(id);
  savedState = { ids, savedAt: adding ? Date.now() : savedState.savedAt };
  savedListeners.forEach((listener) => listener());
}
export function useSavedItems(): { saved: ReadonlySet<string>; savedAt: number; toggle: (id: string) => void } {
  const state = useSyncExternalStore(subscribeSaved, readSaved, readSaved);
  return { saved: state.ids, savedAt: state.savedAt, toggle: toggleSaved };
}

/** One short line after a heart is filled: where the choice is kept. Place it once per page. */
export function SavedNotice() {
  const { savedAt } = useSavedItems();
  const [visible, setVisible] = useState(false);
  const seen = useRef(savedAt);
  useEffect(() => {
    if (savedAt === seen.current) return;
    seen.current = savedAt;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, [savedAt]);
  return <p className={`saved-notice${visible ? ' is-visible' : ''}`} role="status" aria-live="polite">{visible ? 'Saved on this device for this visit only.' : ''}</p>;
}

/** Trips and tickets are activities; a photographer's shoots follow their own journey (a request). */
function experienceKind(merchant: Merchant): OfferingKind {
  const kind = offeringKind(merchant);
  return kind === 'product' || kind === 'dish' ? 'activity' : kind;
}

/** A trip or experience in the one card family. Merchant identity stays with the merchant's own card. */
export function ExperienceCard({ item, merchant, onOpen, merchantContext = false, saved, onSave, omitTag }: {
  item: CatalogItem; merchant: Merchant; onOpen: (merchantId: string, itemId?: string) => void;
  merchantContext?: boolean; saved?: boolean; onSave?: (id: string) => void;
  /** A tag the page already says, such as the subcategory being browsed; it is left off the photo. */
  omitTag?: string;
}) {
  const shared = useSavedItems();
  const tour = isTourOperator(merchant);
  const label = (tour ? tourLabel(merchant) : experienceLabel(merchant)) ?? undefined;
  const tag = label && omitTag && label.toLocaleLowerCase('en-KE') === omitTag.toLocaleLowerCase('en-KE') ? undefined : label;
  const byline = merchantContext ? undefined : `By ${merchant.name}${merchant.area ? ` · ${merchant.area}` : ''}`;
  return <OfferingCard item={item} kind={experienceKind(merchant)} saved={onSave ? Boolean(saved) : shared.saved.has(item.id)} onSave={onSave ?? shared.toggle}
    onOpen={() => onOpen(merchant.id, item.id)} tag={tag} byline={byline} actionLabel={tour ? 'View trip' : 'View details'} describe={merchantContext} />;
}

/** Each host's first offering before any host's second, so one busy host can't fill a preview. */
export function interleaveOfferings(merchants: readonly Merchant[]): { merchant: Merchant; item: CatalogItem }[] {
  return merchants
    .flatMap((merchant) => merchant.items.filter((item) => item.merchantId === merchant.id).map((item, index) => ({ merchant, item, index })))
    .sort((a, b) => a.index - b.index)
    .map(({ merchant, item }) => ({ merchant, item }));
}

export function ExperienceGrid({ merchants = [], offerings, onOpen, preview = false, previewCount = 8, merchantContext = false, layout = 'grid', label, railClassName, omitTag }: {
  merchants?: Merchant[]; offerings?: { merchant: Merchant; item: CatalogItem }[];
  onOpen: (merchantId: string, itemId?: string) => void; preview?: boolean;
  previewCount?: number; merchantContext?: boolean;
  /** `rail` shows the cards in one horizontal row (see Rail). */
  layout?: 'grid' | 'rail';
  /** The rail's accessible name. */
  label?: string;
  railClassName?: string;
  omitTag?: string;
}) {
  const { saved, toggle } = useSavedItems();
  const ordered = offerings ?? interleaveOfferings(merchants);
  const visible = preview ? ordered.slice(0, previewCount) : ordered;
  const cards = visible.map(({ merchant, item }) => <ExperienceCard key={`${merchant.id}:${item.id}`} item={item} merchant={merchant} onOpen={onOpen}
    merchantContext={merchantContext} saved={saved.has(item.id)} onSave={toggle} omitTag={omitTag} />);
  return layout === 'rail'
    ? <Rail label={label ?? 'Experiences'} className={railClassName}>{cards}</Rail>
    : <div className="offering-grid">{cards}</div>;
}
