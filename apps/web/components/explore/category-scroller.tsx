'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/** A single-row, swipeable list with arrow buttons that appear only when there is more to scroll to. */
export function CategoryScroller({
  children,
  className = 'mt-7',
  itemClass = '[&>li]:w-[5.75rem]',
  label = 'categories',
}: {
  children: React.ReactNode;
  className?: string;
  itemClass?: string;
  label?: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  const scrollBy = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const arrow =
    'absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-raised transition-colors hover:bg-bg sm:flex';

  return (
    <div className={`relative ${className}`}>
      {canLeft && (
        <button
          type="button"
          aria-label={`Scroll ${label} left`}
          onClick={() => scrollBy(-1)}
          className={`${arrow} -left-3`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <ul
        ref={ref}
        onScroll={update}
        className={`flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>li]:shrink-0 [&>li]:snap-start ${itemClass}`}
      >
        {children}
      </ul>
      {canRight && (
        <button
          type="button"
          aria-label={`Scroll ${label} right`}
          onClick={() => scrollBy(1)}
          className={`${arrow} -right-3`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
