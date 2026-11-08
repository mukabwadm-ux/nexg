import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import './rail.css';

/**
 * A horizontal row people scroll through (merchants, trips, a store's items). Touch and trackpads scroll it
 * natively and keyboard users tab through its cards. On devices with a fine pointer, round arrows page it one
 * screenful at a time and show only while there is more to see. Styles live in rail.css: size the items with
 * `--rail-item` (and `--rail-item-phone`), and add `rail--bleed` to let a rail run to a phone's edges.
 */
export function Rail({ label, children, className = '', style }: { label: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const update = () => {
    const element = track.current;
    if (!element) return;
    const start = element.scrollLeft <= 2;
    const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2;
    setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
  };
  // New children change the scroll width without resizing the track, so measure after every render as well.
  useEffect(update);
  useEffect(() => {
    const element = track.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const move = (direction: number) => {
    const element = track.current;
    if (!element) return;
    // Page by whole cards, so the next screenful starts on a card edge.
    const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
    const card = element.firstElementChild?.getBoundingClientRect().width;
    const step = card ? card + gap : element.clientWidth;
    const distance = Math.max(1, Math.floor((element.clientWidth + gap) / step)) * step;
    element.scrollBy({ left: direction * distance, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return <div className={`rail ${className}`.trim()} style={style}>
    <div ref={track} className="rail__track" role="group" aria-label={label} onScroll={update}>{children}</div>
    <button type="button" className="rail__arrow rail__arrow--previous" tabIndex={-1} aria-hidden="true" hidden={edges.start} onClick={() => move(-1)}><ChevronLeft size={20} strokeWidth={2} aria-hidden="true" /></button>
    <button type="button" className="rail__arrow rail__arrow--next" tabIndex={-1} aria-hidden="true" hidden={edges.end} onClick={() => move(1)}><ChevronRight size={20} strokeWidth={2} aria-hidden="true" /></button>
  </div>;
}

/**
 * The heading row above a rail or grid: a title, an optional quiet count and one action such as "View all".
 * The action's accessible name repeats the title, so screen readers can tell several "View all" buttons apart.
 */
export function RailHeading({ id, title, meta, action, level = 2 }: {
  id?: string; title: string; meta?: ReactNode; level?: 2 | 3;
  action?: { label: string; onClick: () => void };
}) {
  const Heading = level === 3 ? 'h3' : 'h2';
  return <div className="rail-heading">
    <Heading id={id}>{title}</Heading>
    {meta !== undefined && meta !== null && meta !== '' && <span className="rail-heading__meta">{meta}</span>}
    {action && <button type="button" className="rail-heading__action" onClick={action.onClick}>
      {action.label}<span className="sr-only">: {title}</span><ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
    </button>}
  </div>;
}

/** The last tile of a rail that shows only part of a list: "See all dishes". */
export function RailMore({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="rail-more" onClick={onClick}>
    <span aria-hidden="true"><ArrowRight size={20} strokeWidth={2} /></span>{label}
  </button>;
}
