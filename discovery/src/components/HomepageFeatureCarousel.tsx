import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type TransitionEvent } from 'react';
import { Binoculars, CarFront, ChevronLeft, ChevronRight, ConciergeBell, Flower2, Pause, Pill, Plane, Play, Shirt, ShoppingBasket, Smartphone,
  Sparkles, Store, Ticket, UtensilsCrossed, WashingMachine, Wine, type LucideIcon } from 'lucide-react';
import { homepageFeatures } from '../data/homepageFeatures';
import './homepage.css';

const ROTATION_INTERVAL = 6000;
const TRACK_GAP = 18;
const CARD_PEEK = 30;
/** The page's content column (1424px less its 32px gutters); wide screens line the first card up with it. */
const CONTENT_WIDTH = 1360;

function displayCategoryLabel(label: string) {
  return label.replace(/\s+and\s+/gi, ' & ');
}

const iconByCategory: Record<string, LucideIcon> = {
  'restaurants-food': UtensilsCrossed,
  'groceries-essentials': ShoppingBasket,
  marketplace: Store,
  'health-pharmacy': Pill,
  'beauty-wellness': Sparkles,
  'fashion-apparel': Shirt,
  'tech-electronics': Smartphone,
  'vehicle-rentals': CarFront,
  'airport-transfers': Plane,
  'flowers-gifts': Flower2,
  experiences: Ticket,
  'laundry-cleaning': WashingMachine,
  'concierge-services': ConciergeBell,
  'travel-tours': Binoculars,
  'alcohol-beverages': Wine,
};

function initialCardCount() {
  if (typeof window === 'undefined') return 3;
  if (window.innerWidth <= 640) return 1;
  if (window.innerWidth <= 1080) return 2;
  return 3;
}

function TagIcon({ categoryId }: { categoryId: string }) {
  const Icon = iconByCategory[categoryId] ?? Sparkles;
  return <Icon className="homepage-feature-card__tag-icon" size={15} strokeWidth={2} aria-hidden="true" />;
}

export function HomepageFeatureCarousel({ onCategory }: { onCategory: (id: string) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const observedCount = useRef(initialCardCount());
  const [layout, setLayout] = useState(() => ({ width: 0, count: initialCardCount(), step: 0, leadingInset: 0, cardWidth: 0 }));
  const [position, setPosition] = useState(() => initialCardCount());
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const [playing, setPlaying] = useState(() => typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [hasMovedFromStart, setHasMovedFromStart] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const activeIndex = ((position - layout.count) % homepageFeatures.length + homepageFeatures.length) % homepageFeatures.length;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const width = viewport.clientWidth;
      const count = width <= 640 ? 1 : width <= 1080 ? 2 : 3;
      // The neighbouring cards peek in from both sides; on wide screens the first card lines up with the page.
      const inset = Math.max(CARD_PEEK + TRACK_GAP, (width - CONTENT_WIDTH) / 2);
      const leadingInset = width <= 640 ? 28 : inset;
      const trailingPeek = width <= 640 ? 12 : inset - TRACK_GAP;
      const cardWidth = Math.max(0, (width - leadingInset - trailingPeek - TRACK_GAP * count) / count);
      const step = cardWidth + TRACK_GAP;
      setTransitionEnabled(false);
      if (observedCount.current !== count) {
        observedCount.current = count;
        setPosition(count);
        setHasMovedFromStart(false);
      }
      setLayout({ width, count, step, leadingInset, cardWidth });
      requestAnimationFrame(() => requestAnimationFrame(() => setTransitionEnabled(true)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // Reduced-motion CSS produces no transitionend event, so looping must not depend on it.
  useLayoutEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (position >= layout.count && position < layout.count + homepageFeatures.length) return;
    setTransitionEnabled(false);
    setPosition(layout.count + activeIndex);
    const frame = requestAnimationFrame(() => setTransitionEnabled(true));
    return () => cancelAnimationFrame(frame);
  }, [position, layout.count, activeIndex]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      if (preference.matches) setPlaying(false);
    };
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (!playing || hovered || focused || pageHidden) return;
    const rotate = window.setInterval(() => {
      setHasMovedFromStart(true);
      setPosition((current) => current + 1);
    }, ROTATION_INTERVAL);
    return () => window.clearInterval(rotate);
  }, [playing, hovered, focused, pageHidden]);

  useEffect(() => {
    const pauseWhenHidden = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const firstCloneIndex = layout.count + homepageFeatures.length;
    if (position >= firstCloneIndex || position < layout.count) {
      setTransitionEnabled(false);
      setPosition(layout.count + activeIndex);
      requestAnimationFrame(() => requestAnimationFrame(() => setTransitionEnabled(true)));
    }
  };

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  };

  const move = (direction: number) => {
    setHasMovedFromStart(true);
    const next = position + direction;
    // Repeated clicks can arrive before transitionend. Keep the track inside its clone buffer.
    if (next < layout.count - 1 || next > layout.count + homepageFeatures.length) {
      setTransitionEnabled(false);
      setPosition(layout.count + ((next - layout.count) % homepageFeatures.length + homepageFeatures.length) % homepageFeatures.length);
      requestAnimationFrame(() => requestAnimationFrame(() => setTransitionEnabled(true)));
      return;
    }
    setPosition(next);
  };

  const clonesBefore = homepageFeatures.slice(-layout.count);
  const clonesAfter = homepageFeatures.slice(0, layout.count);
  const trackItems = [
    ...clonesBefore.map((feature) => ({ feature, clone: true, key: `before-${feature.id}` })),
    ...homepageFeatures.map((feature) => ({ feature, clone: false, key: feature.id })),
    ...clonesAfter.map((feature) => ({ feature, clone: true, key: `after-${feature.id}` })),
  ];

  return (
    <section
      className="homepage-feature-carousel"
      aria-label="Featured discovery ideas"
      aria-roledescription="carousel"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={handleBlur}
    >
      <div className="homepage-feature-carousel__stage">
        {/* Phones swipe between ideas; a mostly vertical move stays a page scroll. */}
        <div
          className="homepage-feature-carousel__viewport"
          ref={viewportRef}
          onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            const touch = event.changedTouches[0];
            touchStart.current = null;
            if (!start || !touch) return;
            const dx = touch.clientX - start.x;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(touch.clientY - start.y)) move(dx < 0 ? 1 : -1);
          }}
        >
          <div
            className={`homepage-feature-carousel__track${transitionEnabled ? '' : ' homepage-feature-carousel__track--still'}`}
            onTransitionEnd={handleTransitionEnd}
            style={{ transform: `translate3d(-${position * layout.step - layout.leadingInset}px, 0, 0)` }}
          >
            {trackItems.map(({ feature, clone, key }, index) => {
              const exposed = index >= position && index < position + layout.count;
              return (
              <button
                key={key}
                type="button"
                className={`homepage-feature-card${clone && !hasMovedFromStart && position === layout.count && index === layout.count - 1 ? ' homepage-feature-card--start-hidden' : ''}`}
                style={{
                  width: layout.cardWidth ? `${layout.cardWidth}px` : undefined,
                  '--feature-accent': feature.accent,
                } as CSSProperties}
                onClick={() => onCategory(feature.category.id)}
                aria-label={`${feature.action}: ${feature.title}, ${displayCategoryLabel(feature.category.label)}`}
                aria-hidden={!exposed || undefined}
                disabled={!exposed}
                tabIndex={exposed ? 0 : -1}
              >
                <img
                  className="homepage-feature-card__image"
                  src={feature.image}
                  alt=""
                  aria-hidden="true"
                  loading={index >= layout.count && index < layout.count * 2 ? 'eager' : 'lazy'}
                  decoding="async"
                />
                <span className="homepage-feature-card__shade" aria-hidden="true" />
                <span className="homepage-feature-card__tag">
                  <TagIcon categoryId={feature.category.id} />
                  <span className="homepage-feature-card__tag-label">{displayCategoryLabel(feature.category.label)}</span>
                </span>
                <span className="homepage-feature-card__copy">
                  <span className="homepage-feature-card__text">
                    <span className="homepage-feature-card__title">{feature.title}</span>
                    <span className="homepage-feature-card__description">{feature.description}</span>
                  </span>
                  <span className="homepage-feature-card__action">{feature.action}<ChevronRight size={17} strokeWidth={2} aria-hidden="true" /></span>
                </span>
              </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className="homepage-feature-carousel__arrow homepage-feature-carousel__arrow--previous"
          aria-label="Previous featured ideas"
          onClick={() => move(-1)}
        >
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="homepage-feature-carousel__arrow homepage-feature-carousel__arrow--next"
          aria-label="Next featured ideas"
          onClick={() => move(1)}
        >
          <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="homepage-feature-carousel__footer">
        <div className="homepage-feature-carousel__progress" aria-hidden="true">
          {homepageFeatures.map((feature, index) => (
            <span key={feature.id} className={index === activeIndex ? 'is-active' : ''} />
          ))}
        </div>
        <div className="homepage-feature-carousel__meta">
          <button
            type="button"
            className="homepage-feature-carousel__toggle"
            aria-label={playing ? 'Pause featured ideas' : 'Play featured ideas'}
            title={playing ? 'Pause featured ideas' : 'Play featured ideas'}
            onClick={() => setPlaying((current) => !current)}
          >
            {playing ? <Pause size={16} strokeWidth={2} aria-hidden="true" /> : <Play size={16} strokeWidth={2} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </section>
  );
}

