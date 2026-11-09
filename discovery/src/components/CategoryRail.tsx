import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
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

/**
 * A touch-friendly, full-bleed category rail with native horizontal scrolling. Mouse users get a pair of arrows
 * while the tiles overflow: at the end of the heading row when the rail has one ("Browse by type"), the arrow with
 * nothing further that way dimmed; otherwise at the rail's edges.
 */
export function CategoryRail({ items, selectedId, onSelect, label }: CategoryRailProps) {
  const railId = useId();
  const railRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const boundsRef = useRef({ start: 0, end: 0 });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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
    <section className="category-rail" aria-label={label}>
      {(canScrollLeft || canScrollRight) && <div className="category-rail__controls">
        <button
          type="button"
          className="category-rail__arrow category-rail__arrow--previous"
          aria-label={`Previous ${label.toLowerCase()}`}
          aria-controls={railId}
          disabled={!canScrollLeft}
          onClick={() => scroll(-1)}
        >
          <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="category-rail__arrow category-rail__arrow--next"
          aria-label={`Next ${label.toLowerCase()}`}
          aria-controls={railId}
          disabled={!canScrollRight}
          onClick={() => scroll(1)}
        >
          <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>}
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
