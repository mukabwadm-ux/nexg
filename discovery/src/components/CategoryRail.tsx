import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ImageWithFallback } from './ImageWithFallback';

interface CategoryRailProps {
  items: { id: string; label: string; icon?: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
  label: string;
}

function displayCategoryLabel(item: { id: string; label: string }) {
  if (item.id === 'tech-electronics') return 'Electronics';
  return item.label.replace(/\s+and\s+/gi, ' & ');
}

/** A touch-friendly, full-bleed category rail with native horizontal scrolling. */
export function CategoryRail({ items, selectedId, onSelect, label }: CategoryRailProps) {
  const railId = useId();
  const railRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pageScrollingRef = useRef(false);
  const boundsRef = useRef({ start: 0, end: 0 });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isPageScrolling, setIsPageScrolling] = useState(false);

  useEffect(() => {
    let scrollEndTimer: number | undefined;
    const handlePageScroll = () => {
      if (!pageScrollingRef.current) {
        pageScrollingRef.current = true;
        setIsPageScrolling(true);
      }
      window.clearTimeout(scrollEndTimer);
      scrollEndTimer = window.setTimeout(() => {
        pageScrollingRef.current = false;
        setIsPageScrolling(false);
        scrollEndTimer = undefined;
      }, 220);
    };

    window.addEventListener('scroll', handlePageScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handlePageScroll);
      window.clearTimeout(scrollEndTimer);
    };
  }, []);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const measure = () => {
      const start = 0;
      const end = Math.max(0, rail.scrollWidth - rail.clientWidth);

      boundsRef.current = { start, end };
      const previousBehavior = rail.style.scrollBehavior;
      rail.style.scrollBehavior = 'auto';
      rail.scrollLeft = start;
      rail.style.scrollBehavior = previousBehavior;
      setCanScrollLeft(false);
      setCanScrollRight(end - start > 2);
    };
    const handleScroll = () => {
      const bounds = boundsRef.current;
      const current = rail.scrollLeft;
      setCanScrollLeft(current - bounds.start > 2);
      setCanScrollRight(bounds.end - current > 2);
    };

    measure();
    rail.addEventListener('scroll', handleScroll, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    rail.querySelectorAll('.category-tile').forEach((tile) => observer.observe(tile));
    return () => {
      observer.disconnect();
      rail.removeEventListener('scroll', handleScroll);
    };
  }, [items]);

  const scroll = (direction: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bounds = boundsRef.current;
    const target = Math.min(bounds.end, Math.max(bounds.start, rail.scrollLeft + direction * Math.max(240, rail.clientWidth * 0.65)));
    rail.scrollTo({
      left: target,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = Math.min(index + 1, items.length - 1); break;
      case 'ArrowLeft': next = Math.max(index - 1, 0); break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      default: return;
    }
    event.preventDefault();
    buttonRefs.current[next]?.focus();
    buttonRefs.current[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <section className={`category-rail${isPageScrolling ? ' category-rail--page-scrolling' : ''}`} aria-label={label}>
      <div className="category-rail__controls">
        {canScrollLeft && <button
          type="button"
          className="icon-button category-rail__arrow category-rail__arrow--previous"
          aria-label={`Previous ${label.toLowerCase()}`}
          aria-controls={railId}
          onClick={() => scroll(-1)}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>}
        {canScrollRight && <button
          type="button"
          className="icon-button category-rail__arrow category-rail__arrow--next"
          aria-label={`Next ${label.toLowerCase()}`}
          aria-controls={railId}
          onClick={() => scroll(1)}
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>}
      </div>
      <div id={railId} ref={railRef} className="category-rail__items">
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(button) => { buttonRefs.current[index] = button; }}
            type="button"
            className={`category-tile${item.id === selectedId ? ' category-tile--selected' : ''}`}
            aria-pressed={item.id === selectedId}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => handleKey(event, index)}
          >
            <span className="category-tile__art">
              <ImageWithFallback
                src={item.icon}
                alt=""
                width={100}
                height={100}
                className="category-tile__image"
                loading={index < 5 ? 'eager' : 'lazy'}
                decoding="async"
              />
            </span>
            <span className="category-tile__label">{displayCategoryLabel(item)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
