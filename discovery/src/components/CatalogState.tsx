import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { clarificationLabel, clarificationMessage, recoveryCopy, type ReadFailure } from '../providers/readState';
import './discovery.css';

export type SkeletonLayout = 'grid' | 'rail' | 'rows';

/**
 * Placeholders in the shape of what is loading (cards in a grid, a rail, or store rows), at the real cards'
 * size, so the page keeps its layout when the catalogue answers.
 */
export function CatalogSkeleton({ layout = 'grid', shape = 'offering', count, label = 'Loading' }: {
  layout?: SkeletonLayout; shape?: 'offering' | 'merchant'; count?: number; label?: string;
}) {
  const card = (key: number) => <div className={`skeleton-card skeleton-card--${shape}`} key={key} aria-hidden="true">
    <span className="skeleton-card__media" />
    {shape === 'merchant' ? <span className="skeleton-card__identity"><span className="skeleton-card__logo" /><span className="skeleton-card__lines"><span className="skeleton-card__line" /><span className="skeleton-card__line skeleton-card__line--short" /></span></span>
      : <><span className="skeleton-card__line" /><span className="skeleton-card__line skeleton-card__line--short" /></>}
  </div>;
  const cards = (total: number) => Array.from({ length: total }, (_, index) => card(index));
  return <div className={`catalog-skeleton catalog-skeleton--${layout} catalog-skeleton--${shape}`} role="status" aria-busy="true">
    <span className="sr-only">{label}…</span>
    {layout === 'rows' ? Array.from({ length: count ?? 2 }, (_, index) => <div className="skeleton-row" key={index} aria-hidden="true">
      <span className="skeleton-row__header"><span className="skeleton-card__logo" /><span className="skeleton-card__lines"><span className="skeleton-card__line" /><span className="skeleton-card__line skeleton-card__line--short" /></span></span>
      <div className="loading-rail">{cards(6)}</div>
    </div>)
      : <div className={layout === 'rail' ? 'loading-rail' : 'loading-grid'}>{cards(count ?? (layout === 'rail' ? 6 : 4))}</div>}
  </div>;
}

export function CatalogState({ loading, error, failure, retry, restart, emptyTitle, emptyText, skeleton = 'grid', shape, count, loadingLabel }: {
  loading?: boolean; error?: boolean; failure?: ReadFailure; retry?: () => void; restart?: () => void; emptyTitle?: string; emptyText?: string;
  /** The loading placeholder's layout and card shape. */
  skeleton?: SkeletonLayout; shape?: 'offering' | 'merchant'; count?: number; loadingLabel?: string;
}) {
  const [wait, setWait] = useState(failure?.retryAfterSeconds ?? 0);
  useEffect(() => {
    setWait(failure?.retryAfterSeconds ?? 0);
    const timer = setInterval(() => setWait(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [failure]);
  if (loading) return <CatalogSkeleton layout={skeleton} shape={shape} count={count} label={loadingLabel} />;
  if (error || failure) {
    const state = failure ?? { kind: 'unavailable' as const }; const copy = recoveryCopy(state);
    const canRetry = state.kind === 'unavailable' && (!state.detail || state.detail.retryable);
    const labels = state.detail?.clarification?.options.flatMap(option => clarificationLabel(option.labelKey) ?? []) ?? [];
    return <div className="empty-state" role="status" data-read-state={state.kind}><h2>{copy.title}</h2><p>{copy.text}</p>
      {state.detail?.clarification && clarificationMessage(state.detail.clarification.clarificationKey) && <p>{clarificationMessage(state.detail.clarification.clarificationKey)}</p>}
      {labels.length > 0 && <ul aria-label="Search next steps">{labels.map((label, index) => <li key={index}>{label}</li>)}</ul>}
      {state.kind === 'restart' && restart && <button className="button button--primary" type="button" onClick={restart}>Start again with these filters</button>}
      {canRetry && retry && <button className="button button--primary" type="button" disabled={wait > 0} onClick={retry}><RefreshCw size={16} strokeWidth={2} aria-hidden="true" />{wait > 0 ? `Try again in ${wait}s` : 'Try again'}</button>}
    </div>;
  }
  return <div className="empty-state"><h2>{emptyTitle ?? 'No merchants found'}</h2><p>{emptyText ?? 'Try another category, area or search.'}</p></div>;
}
