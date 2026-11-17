import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { StorePromotion } from '../../providers/DiscoveryProvider';

const ENDS = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Nairobi',
});

/** "On everything · Taken off at checkout · Ends Sun 16 Nov, 23:59". */
export function promotionDetail(promotion: Pick<StorePromotion, 'scope' | 'endsAt'>): string {
  const ends = promotion.endsAt ? Date.parse(promotion.endsAt) : Number.NaN;
  return [promotion.scope, 'Taken off at checkout', Number.isFinite(ends) ? `Ends ${ENDS.format(ends)}` : '']
    .filter(Boolean).join(' · ');
}

/**
 * The merchant's own video: muted, inline and looping, with its still as the poster. It never plays with sound.
 * It plays only while on screen; visitors who ask for reduced motion see the still, and the button plays or
 * pauses it for anyone (moving content that runs longer than five seconds can be paused).
 */
function BannerVideo({ src, poster, label, onError }: { src: string; poster: string; label: string; onError: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: 0.25 });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const wanted = chosen ?? !reduced;
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    if (wanted && visible) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [wanted, visible, src]);

  return <>
    <video ref={ref} src={src} poster={poster} muted loop playsInline preload={wanted ? 'metadata' : 'none'} disablePictureInPicture
      aria-hidden="true" tabIndex={-1} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={onError} />
    <button type="button" className="store-promo__toggle" onClick={() => setChosen(!playing)} aria-label={playing ? `Pause ${label}` : `Play ${label}`}>
      {playing ? <Pause size={16} strokeWidth={2} aria-hidden="true" /> : <Play size={16} strokeWidth={2} aria-hidden="true" />}
    </button>
  </>;
}

/**
 * A running promotion under the store's hero (migration 20270101120100): the merchant's own picture or video, which
 * NexG approved, beside what the offer is. The discount is taken off at checkout, so the banner says so rather than
 * implying the listed prices already include it. A file that will not load leaves the words on their own.
 *
 * The merchant previews this banner in their workspace (apps/web/components/merchant/promotions/creative-preview.tsx);
 * keep the two in step.
 */
export function PromotionBanner({ promotion }: { promotion: StorePromotion }) {
  const [broken, setBroken] = useState(false);
  const { media } = promotion;
  return <section className={`store-promo${broken ? ' store-promo--words' : ''}`} aria-label={`Offer: ${promotion.benefit}, ${promotion.name}`}>
    {!broken && <div className="store-promo__media">
      {media.kind === 'video'
        ? <BannerVideo src={media.src} poster={media.poster} label={`${promotion.name} video`} onError={() => setBroken(true)} />
        // Right under the hero, so it loads at once rather than lazily.
        : <img src={media.src} alt="" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
    </div>}
    <div className="store-promo__text">
      <p className="store-promo__eyebrow">Offer</p>
      <p className="store-promo__benefit">{promotion.benefit}</p>
      <h2 className="store-promo__name">{promotion.name}</h2>
      <p className="store-promo__detail">{promotionDetail(promotion)}</p>
    </div>
  </section>;
}
