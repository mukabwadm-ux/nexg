import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export interface NavSection { anchor: string; title: string; count: number }

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The site header is sticky, so the section bar sits under it. */
function useHeaderHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.discovery-header');
    if (!header) return;
    const measure = () => setHeight(Math.round(header.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return height;
}

/**
 * The sticky section bar every storefront shares (Wolt-style): one chip per section, the chip for the
 * section on screen lights up as you scroll, and a click scrolls to that section. Search sits on the right;
 * on phones it folds into an icon so the chips keep the row, and stays open while it holds a search.
 */
export function SectionNav({ sections, label, search }: {
  sections: NavSection[];
  label: string;
  search?: { value: string; onChange: (value: string) => void; placeholder: string; label: string };
}) {
  const bar = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  // While a chip's own scroll runs, that chip stays lit instead of every section the page passes on the way.
  const target = useRef<{ anchor: string; until: number }>(undefined);
  const fieldId = useId();
  const top = useHeaderHeight();
  const [active, setActive] = useState(sections[0]?.anchor);
  const [searching, setSearching] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: true });
  const key = sections.map((section) => section.anchor).join('|');
  const searchOpen = searching || Boolean(search?.value);
  const offset = () => top + (bar.current?.offsetHeight ?? 0) + 12;

  // Scroll spy: the active section is the last one whose heading has passed under the bar.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const lock = target.current;
      if (lock) {
        const element = document.getElementById(lock.anchor);
        const arrived = !element || Math.abs(element.getBoundingClientRect().top - offset()) < 4;
        if (!arrived && performance.now() < lock.until) { setActive(lock.anchor); return; }
        target.current = undefined;
      }
      const line = offset() + 12;
      let current = sections[0]?.anchor;
      for (const section of sections) {
        const element = document.getElementById(section.anchor);
        if (element && element.getBoundingClientRect().top <= line) current = section.anchor;
      }
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const last = sections[sections.length - 1];
      if (atEnd && last && (document.getElementById(last.anchor)?.getBoundingClientRect().top ?? Infinity) < window.innerHeight) current = last.anchor;
      setActive(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    // The shopper taking over the scroll ends a chip's lock at once.
    const release = () => { target.current = undefined; };
    const settle = () => { if (target.current) { target.current = undefined; schedule(); } };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scrollend', settle);
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchstart', release, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); window.removeEventListener('scrollend', settle);
      window.removeEventListener('wheel', release); window.removeEventListener('touchstart', release); cancelAnimationFrame(frame);
    };
    // offset() reads the bar's live height, and the sections change only when their anchors (the key) do.
  }, [key, top]);

  // Keep the active chip in view inside the rail.
  useEffect(() => {
    const element = rail.current;
    const chip = element?.querySelector<HTMLElement>(`[data-anchor="${active}"]`);
    if (!element || !chip) return;
    element.scrollTo({ left: chip.offsetLeft - (element.clientWidth - chip.offsetWidth) / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [active]);

  // Fade an edge (and offer an arrow to mouse users) only where more chips sit out of view.
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const measure = () => setEdges({ start: element.scrollLeft <= 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 });
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { element.removeEventListener('scroll', measure); observer.disconnect(); };
  }, [key, searchOpen]);

  const go = (anchor: string) => {
    const section = document.getElementById(anchor);
    if (!section) return;
    target.current = { anchor, until: performance.now() + 1200 };
    setActive(anchor);
    window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top - offset(), behavior: reducedMotion() ? 'auto' : 'smooth' });
    section.focus({ preventScroll: true });
  };
  const nudge = (direction: number) => {
    const element = rail.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.7, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const openSearch = () => { setSearching(true); requestAnimationFrame(() => input.current?.focus()); };
  const closeSearch = () => { setSearching(false); search?.onChange(''); requestAnimationFrame(() => toggle.current?.focus()); };

  return <div ref={bar} className={`section-nav${searchOpen ? ' is-searching' : ''}${sections.length < 2 ? ' is-single' : ''}`} style={{ top }}>
    {sections.length > 1 && <div className="section-nav__rail-wrap" data-start={edges.start} data-end={edges.end}>
      <nav className="section-nav__rail" ref={rail} aria-label={label}>
        {sections.map((section) => <a key={section.anchor} href={`#${section.anchor}`} data-anchor={section.anchor} aria-current={active === section.anchor ? 'true' : undefined}
          onClick={(event) => { event.preventDefault(); go(section.anchor); }}>{section.title}<span className="section-nav__count"><span className="sr-only">, </span>{section.count}</span></a>)}
      </nav>
      <button type="button" className="section-nav__arrow section-nav__arrow--previous" tabIndex={-1} aria-label="Earlier sections" hidden={edges.start} onClick={() => nudge(-1)}><ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /></button>
      <button type="button" className="section-nav__arrow section-nav__arrow--next" tabIndex={-1} aria-label="More sections" hidden={edges.end} onClick={() => nudge(1)}><ChevronRight size={18} strokeWidth={2} aria-hidden="true" /></button>
    </div>}
    {search && <div className="section-nav__search">
      <button ref={toggle} type="button" className="section-nav__search-toggle" aria-label={search.label} aria-expanded={searchOpen} aria-controls={fieldId}
        onClick={openSearch}><Search size={18} strokeWidth={1.75} aria-hidden="true" /></button>
      <label className="section-nav__field">
        <Search size={17} strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">{search.label}</span>
        <input ref={input} id={fieldId} type="search" value={search.value} maxLength={120} placeholder={search.placeholder} enterKeyHint="search"
          onChange={(event) => search.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            if (search.value) { event.preventDefault(); search.onChange(''); } else if (searching) closeSearch();
          }} />
      </label>
      {searchOpen && <button type="button" className="section-nav__search-close" aria-label="Close search" onClick={closeSearch}><X size={18} strokeWidth={1.75} aria-hidden="true" /></button>}
    </div>}
  </div>;
}
