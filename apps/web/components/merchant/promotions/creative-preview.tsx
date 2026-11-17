'use client';

import { cn, Tag } from '@nexg/ui';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import * as React from 'react';

import { categoryIcon } from '@/components/explore/merchant-card';
import {
  FeaturedCard,
  featuredCardWords,
  type CardMedia,
} from '@/components/home/featured-merchants';
import { CreativeVideo } from '@/components/promo-media/creative-video';
import { translator } from '@/lib/i18n/dictionaries';

import styles from './creative-preview.module.css';

/**
 * What a merchant sees before they send their own image or video: the
 * homepage featured card, or their store's promotion banner in Discovery, at
 * a phone's width and a desktop's, with the media playing from memory before
 * anything is uploaded. The homepage card is the real component; the store is
 * mirrored from Discovery's styles (see creative-preview.module.css).
 */

const t = translator('en');

/**
 * Draws its children at a fixed screen width and scales them down to fit, so
 * a 1280-pixel homepage shows whole in a dialog and stays a true miniature.
 */
function Scaled({ width, children }: { width: number; children: React.ReactNode }) {
  const outer = React.useRef<HTMLDivElement>(null);
  const inner = React.useRef<HTMLDivElement>(null);
  const [fit, setFit] = React.useState<{ scale: number; height: number } | null>(null);

  React.useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    const measure = () => {
      const scale = Math.min(1, box.clientWidth / width);
      setFit({ scale, height: content.offsetHeight * scale });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div
      ref={outer}
      style={{ position: 'relative', overflow: 'hidden', height: fit ? fit.height : undefined }}
    >
      <div
        ref={inner}
        style={{
          width,
          transform: `scale(${fit?.scale ?? 1})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Frame({
  kind,
  address,
  children,
}: {
  kind: 'phone' | 'desktop';
  address: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="m-0 min-w-0">
      <figcaption className={styles.frameLabel}>
        {kind === 'phone' ? 'Phone' : 'Desktop'}
        <span>{kind === 'phone' ? '390 px wide' : '1280 px wide, shown smaller'}</span>
      </figcaption>
      {kind === 'phone' ? (
        <div className={styles.phone}>
          <Scaled width={390}>{children}</Scaled>
        </div>
      ) : (
        <div className={styles.browser}>
          <div className={styles.browserBar} aria-hidden="true">
            <i />
            <i />
            <i />
            <b>{address}</b>
          </div>
          <Scaled width={1280}>{children}</Scaled>
        </div>
      )}
    </figure>
  );
}

// ───────────────────────────────────────────── the homepage card

export interface CardSubject {
  name: string;
  category: string | null;
  branchName: string | null;
  coverPhoto: string | null;
  prepMinutes: number | null;
}

/** The homepage band around the card, as components/home/home-page draws it. */
function Band({ variant, children }: { variant: 'phone' | 'desktop'; children: React.ReactNode }) {
  const desktop = variant === 'desktop';
  return (
    <section
      className={cn('bg-ink font-sans text-white', desktop ? 'px-[30px] py-20' : 'px-4 py-16')}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Tag tone="goldOutline" className="px-4 py-2 uppercase tracking-[0.18em]">
            {t('home.featured.eyebrow')}
          </Tag>
          <h2
            className={cn(
              'mt-5 font-extrabold tracking-tight',
              desktop ? 'text-[2.375rem]' : 'text-3xl',
            )}
          >
            {t('home.featured.heading')}
          </h2>
        </div>
        <div className={cn('flex items-center', desktop ? 'gap-3' : 'gap-2')} aria-hidden="true">
          {desktop && (
            <div className="flex gap-2">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 opacity-35">
                <ArrowLeft className="h-4 w-4" />
              </span>
              <span className="bg-gold text-ink flex h-11 w-11 items-center justify-center rounded-full">
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-white/20 text-sm font-bold',
              desktop ? 'h-12 px-6' : 'h-11 px-5',
            )}
          >
            {t('home.featured.exploreAll')}
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
      <ul className={cn('mt-8 flex gap-4 overflow-hidden', desktop ? '' : '-mx-4 px-4')}>
        {children}
      </ul>
    </section>
  );
}

function Neighbour({ variant }: { variant: 'phone' | 'desktop' }) {
  return (
    <li
      aria-hidden="true"
      className={cn('shrink-0', variant === 'phone' ? 'w-[68%]' : 'w-[calc((100%-3rem)/4)]')}
    >
      <div
        className={cn(
          'flex aspect-[15/14] items-center justify-center rounded-[1.75rem] border border-dashed border-white/15 p-6 text-center text-[0.8125rem] font-semibold text-white/35',
          variant === 'phone' ? 'max-h-[21rem]' : 'max-h-[25rem]',
        )}
      >
        Another featured business, when there is one
      </div>
    </li>
  );
}

export function FeaturedCardPreview({
  subject,
  media,
  blurb,
}: {
  subject: CardSubject;
  media: CardMedia | null;
  blurb: string | null;
}) {
  const words = featuredCardWords(
    { merchant_category: subject.category, branch_name: subject.branchName, blurb },
    t,
  );
  const card = (variant: 'phone' | 'desktop') => (
    <FeaturedCard
      href={null}
      photo={subject.coverPhoto}
      media={media}
      icon={categoryIcon(words.category) ?? Sparkles}
      sponsored={t('merchant.sponsored')}
      minutes={subject.prepMinutes}
      minUnit={t('merchant.min')}
      meta={words.meta}
      name={subject.name}
      cta={words.cta}
      variant={variant}
      reveal={false}
    />
  );
  return (
    <div className={styles.frames}>
      <Frame kind="phone" address="nexgapp.com">
        <Band variant="phone">
          {card('phone')}
          <Neighbour variant="phone" />
        </Band>
      </Frame>
      <Frame kind="desktop" address="nexgapp.com">
        <Band variant="desktop">
          {card('desktop')}
          <Neighbour variant="desktop" />
          <Neighbour variant="desktop" />
          <Neighbour variant="desktop" />
        </Band>
      </Frame>
    </div>
  );
}

// ───────────────────────────────────────────── the store banner

export interface StoreSubject {
  id: string;
  name: string;
  /** The kind of business, as Discovery labels the store. */
  type: string | null;
}

export interface BannerWords {
  name: string;
  /** "15% off" or "KES 200 off". */
  benefit: string;
  /** "On everything" or "On {item}". */
  scope: string;
  endsAt: string | null;
}

const ENDS = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Nairobi',
});

/** As Discovery's promotionDetail: what it is on, that it comes off at checkout, and when it ends. */
export function bannerDetail(banner: Pick<BannerWords, 'scope' | 'endsAt'>): string {
  const ends = banner.endsAt ? Date.parse(banner.endsAt) : Number.NaN;
  return [
    banner.scope,
    'Taken off at checkout',
    Number.isFinite(ends) ? `Ends ${ENDS.format(ends)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function Store({
  variant,
  store,
  banner,
  media,
}: {
  variant: 'phone' | 'desktop';
  store: StoreSubject;
  banner: BannerWords;
  media: CardMedia;
}) {
  return (
    <div
      className={cn(styles.store, variant === 'phone' ? styles.storePhone : styles.storeDesktop)}
    >
      {/* A real merchant's store has no cover photo or logo in Discovery yet: the
          gradient, and on phones the first letter, stand in, as they do there. */}
      <div className={styles.hero}>
        <div className={styles.heroImage} />
        <div className={styles.heroShade} />
        <span className={styles.heroBack}>Back</span>
        <div className={styles.heroIdentity}>
          {variant === 'phone' && (
            /* Discovery's MerchantLogo initial: the first letter or digit. */
            <span className={styles.heroLogo}>
              {(/[\p{L}\p{N}]/u.exec(store.name)?.[0] ?? '•').toLocaleUpperCase('en-KE')}
            </span>
          )}
          <div className={styles.heroText}>
            {variant === 'desktop' && store.type && (
              <p className={styles.heroEyebrow}>{store.type}</p>
            )}
            <h1 className={styles.heroName}>{store.name}</h1>
            {variant === 'phone' && store.type && (
              <p style={{ marginTop: 6, color: 'var(--muted)', fontSize: 13 }}>{store.type}</p>
            )}
          </div>
        </div>
      </div>
      <section className={styles.promo} aria-label={`Offer: ${banner.benefit}, ${banner.name}`}>
        <div className={styles.promoMedia}>
          {media.kind === 'video' ? (
            <CreativeVideo
              src={media.src}
              poster={media.poster}
              buttonClassName="h-10 w-10 bg-[rgba(8,13,15,0.68)]"
              label={`${banner.name} video`}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a file in memory, shown as Discovery shows it.
            <img src={media.src} alt="" />
          )}
        </div>
        <div className={styles.promoText}>
          <p className={styles.promoEyebrow}>Offer</p>
          <p className={styles.promoBenefit}>{banner.benefit}</p>
          <h2 className={styles.promoName}>{banner.name}</h2>
          <p className={styles.promoDetail}>{bannerDetail(banner)}</p>
        </div>
      </section>
      <div className={styles.shelf} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function PromotionBannerPreview({
  store,
  banner,
  media,
}: {
  store: StoreSubject;
  banner: BannerWords;
  media: CardMedia;
}) {
  const address = `nexgapp.com/discover?merchant=${store.id}`;
  return (
    <div className={styles.frames}>
      <Frame kind="phone" address={address}>
        <Store variant="phone" store={store} banner={banner} media={media} />
      </Frame>
      <Frame kind="desktop" address={address}>
        <Store variant="desktop" store={store} banner={banner} media={media} />
      </Frame>
    </div>
  );
}

// ───────────────────────────────────────────── the dialog

/**
 * The preview step, in a modal dialog (the browser's own, so focus stays in
 * it and Escape closes it). The submit button is in its footer: nothing is
 * sent until the merchant has seen the preview and pressed it.
 */
export function PreviewDialog({
  open,
  title,
  intro,
  notes,
  busy,
  progress,
  status,
  error,
  submitLabel,
  onSubmit,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  intro: string;
  notes: string[];
  busy: boolean;
  /** 0–1 while files upload. */
  progress: number | null;
  status: string | null;
  error: string | null;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      {open && (
        <>
          <header className={styles.head}>
            <div>
              <h2 id={titleId}>{title}</h2>
              <p>{intro}</p>
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              disabled={busy}
              aria-label="Close preview"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className={styles.body}>
            {children}
            {notes.length > 0 && (
              <div className={styles.notes}>
                {notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            )}
          </div>
          <footer className={styles.foot}>
            <p
              className={cn(styles.status, error && styles.error)}
              role="status"
              aria-live="polite"
            >
              {error ?? status ?? ''}
              {progress !== null && (
                <span className={styles.progress} aria-hidden="true">
                  <span style={{ width: `${Math.round(progress * 100)}%` }} />
                </span>
              )}
            </p>
            <button type="button" className={styles.button} onClick={onClose} disabled={busy}>
              Back to edit
            </button>
            <button
              type="button"
              className={cn(styles.button, styles.primary)}
              onClick={onSubmit}
              disabled={busy}
            >
              {busy ? 'Sending…' : submitLabel}
            </button>
          </footer>
        </>
      )}
    </dialog>
  );
}
