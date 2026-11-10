import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export interface NavSection { anchor: string; title: string; count: number }

/** Phones, where the store bar docks at the very top and the site header steps aside (owner, 9 Nov 2026). */
export const PHONE_QUERY = '(max-width: 767px)';

/** The gap left between the bar and a section heading that a chip scrolls to. */
const LANDING_GAP = 12;

/**
 * How far down the pinned site header reaches: its height, less the part that scrolls away. On phones the
 * header's account and location rows scroll off (a negative sticky `top`), so only its last row stays.
 */
export function headerReachOf(height: number, stickyTop: number): number {
  return Math.max(0, Math.round(height + (Number.isFinite(stickyTop) ? Math.min(0, stickyTop) : 0)));
}

/**
 * Phones dock the store bar once its unpinned top edge would meet the header's last row, and undock above that
 * line. The edge doesn't move with the bar or the header, so the two states can't flip back and forth. Wider
 * screens never dock: the header stays and the bar pins under it.
 */
export function shouldDock(phone: boolean, naturalTop: number, reach: number): boolean {
  return phone && naturalTop <= reach + 0.5;
}

/** Phones settle the site header into one row once its top rows (`collapse` pixels) have scrolled away; wider screens never do. */
export function isCompactHeader(phone: boolean, collapse: number, scrollY: number): boolean {
  return phone && collapse > 0 && scrollY >= collapse - 0.5;
}

/** Where a section heading lands after a chip's scroll: under the bar, which on phones is docked at the very top by then. */
export function sectionLanding(phone: boolean, reach: number, barHeight: number): number {
  return (phone ? 0 : reach) + barHeight + LANDING_GAP;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => window.matchMedia(PHONE_QUERY).matches;

function headerReach(): number {
  const header = document.querySelector<HTMLElement>('.discovery-header');
  return header ? headerReachOf(header.offsetHeight, Number.parseFloat(getComputedStyle(header).top)) : 0;
}

/**
 * Where a store's section bar sits once the page has scrolled to it: under the site header on wider screens, at
 * the very top on phones. Storefronts use it to bring their list back into view.
 */
export function storeBarTop(): number {
  return isPhone() ? 0 : headerReach();
}

/**
 * Brings a store's section bar (inside `container`) to where it pins. `onlyWhenPast` leaves the page alone unless
 * the shopper has scrolled past that point, e.g. to show a search's first results from further down the store.
 */
export function showStoreBar(container: HTMLElement | null, { onlyWhenPast = false, smooth = false } = {}) {
  const mark = container?.querySelector<HTMLElement>('.section-nav-mark') ?? container;
  if (!mark) return;
  // Rounded up, so the bar pins exactly rather than resting a sub-pixel below its place.
  const top = Math.max(0, Math.ceil(mark.getBoundingClientRect().top + window.scrollY - storeBarTop()));
  if (onlyWhenPast && window.scrollY <= top) return;
  window.scrollTo({ top, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
}

/** The pinned header's reach, kept current as the header changes size or the screen crosses the phone width. */
function useHeaderReach() {
  const [reach, setReach] = useState(0);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.discovery-header');
    const phone = window.matchMedia(PHONE_QUERY);
    const measure = () => setReach(headerReach());
    measure();
    const observer = header ? new ResizeObserver(measure) : undefined;
    if (header) observer?.observe(header);
    phone.addEventListener('change', measure);
    return () => { observer?.disconnect(); phone.removeEventListener('change', measure); };
  }, []);
  return reach;
}

/**
 * The sticky section bar every storefront shares (Wolt-style): the store's own search ("Search {store}"), then one
 * chip per section. The chip for the section on screen lights up as you scroll, and a click scrolls to it.
 *
 * Wider screens pin the bar under the site header, the search beside the chips. Phones stack a full-width search
 * over the chips, and once the bar reaches the top it docks there: `html[data-store-docked]` lets the site header
 * slide away (styles.css), so the screen keeps one search, the store's. Scrolling back above the bar undocks it.
 */
export function SectionNav({ sections, label, search }: {
  sections: NavSection[];
  label: string;
  search?: { value: string; onChange: (value: string) => void; placeholder: string; label: string };
}) {
  const mark = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // While a chip's own scroll runs, that chip stays lit instead of every section the page passes on the way.
  const target = useRef<{ anchor: string; until: number }>(undefined);
  const fieldId = useId();
  const reach = useHeaderReach();
  const reachRef = useRef(reach);
  reachRef.current = reach;
  const [docked, setDocked] = useState(false);
  const dockedRef = useRef(false);
  const [active, setActive] = useState(sections[0]?.anchor);
  const [edges, setEdges] = useState({ start: true, end: true });
  const key = sections.map((section) => section.anchor).join('|');

  /** Where the bar's top edge would be if it weren't pinned: the zero-height mark just before it. */
  const natural = () => mark.current?.getBoundingClientRect().top ?? 0;
  const barHeight = () => bar.current?.offsetHeight ?? 0;
  const landing = () => sectionLanding(isPhone(), reachRef.current, barHeight());

  // Docking (phones), from the mark's place: see shouldDock.
  const recheckDock = useRef(() => {});
  useEffect(() => {
    const phone = window.matchMedia(PHONE_QUERY);
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = Boolean(mark.current) && shouldDock(phone.matches, natural(), reachRef.current);
      if (next === dockedRef.current) return;
      dockedRef.current = next;
      setDocked(next);
      if (next) root.dataset.storeDocked = ''; else delete root.dataset.storeDocked;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    recheckDock.current = schedule;
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    phone.addEventListener('change', schedule);
    return () => {
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); phone.removeEventListener('change', schedule);
      cancelAnimationFrame(frame);
      recheckDock.current = () => {};
      dockedRef.current = false;
      delete root.dataset.storeDocked;
    };
  }, []);
  // The header's reach moves the docking line (a resize, or crossing the phone width).
  useEffect(() => { recheckDock.current(); }, [reach]);

  // Room to dock: the bar's container is at least a screen taller than what sits above the bar in it (store.css),
  // so a short list or a narrow search never pulls a docked bar back down the page.
  useEffect(() => {
    const element = mark.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const measure = () => parent.style.setProperty('--store-bar-offset', `${Math.max(0, Math.round(element.getBoundingClientRect().top - parent.getBoundingClientRect().top))}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => { observer.disconnect(); parent.style.removeProperty('--store-bar-offset'); };
  }, []);

  // Scroll spy: the active section is the last one whose heading has passed under the bar.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const lock = target.current;
      if (lock) {
        const element = document.getElementById(lock.anchor);
        const arrived = !element || Math.abs(element.getBoundingClientRect().top - landing()) < 4;
        if (!arrived && performance.now() < lock.until) { setActive(lock.anchor); return; }
        target.current = undefined;
      }
      const line = (dockedRef.current ? 0 : reachRef.current) + barHeight() + 24;
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
    // The sections change only when their anchors (the key) do; positions are read live.
  }, [key]);

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
  }, [key]);

  const go = (anchor: string) => {
    const section = document.getElementById(anchor);
    if (!section) return;
    target.current = { anchor, until: performance.now() + 1200 };
    setActive(anchor);
    window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top - landing(), behavior: reducedMotion() ? 'auto' : 'smooth' });
    section.focus({ preventScroll: true });
  };
  const nudge = (direction: number) => {
    const element = rail.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.7, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  /** On phones a search happens docked at the top, with the results under it (as in Wolt Market). */
  const dock = (behavior: ScrollBehavior) => {
    const offset = natural();
    if (isPhone() && offset > 0.5) window.scrollTo({ top: Math.ceil(window.scrollY + offset), behavior });
  };
  const type = (value: string) => {
    const wasDocked = dockedRef.current;
    search?.onChange(value);
    // A storefront brings its list back into view by aiming under the full site header; a docked bar stays docked.
    if (wasDocked) dock('auto');
  };

  return <>
    <div ref={mark} className="section-nav-mark" aria-hidden="true" />
    <div ref={bar} className="section-nav" data-docked={docked || undefined} style={{ top: docked ? 0 : reach }}>
      {search && <div className="section-nav__search" role="search" aria-label={search.label}>
        <label htmlFor={fieldId} className="section-nav__icon"><Search size={18} strokeWidth={1.75} aria-hidden="true" /><span className="sr-only">{search.label}</span></label>
        <input ref={input} id={fieldId} type="search" value={search.value} maxLength={120} placeholder={search.placeholder} enterKeyHint="search" autoComplete="off"
          onChange={(event) => type(event.target.value)}
          onFocus={() => { if (!dockedRef.current) dock(reducedMotion() ? 'auto' : 'smooth'); }}
          onKeyDown={(event) => { if (event.key === 'Escape' && search.value) { event.preventDefault(); type(''); } }} />
        {search.value && <button type="button" className="section-nav__clear" aria-label="Clear search" onClick={() => { type(''); input.current?.focus(); }}>
          <X size={16} strokeWidth={1.75} aria-hidden="true" /></button>}
      </div>}
      {sections.length > 1 && <div className="section-nav__rail-wrap" data-start={edges.start} data-end={edges.end}>
        <nav className="section-nav__rail" ref={rail} aria-label={label}>
          {sections.map((section) => <a key={section.anchor} href={`#${section.anchor}`} data-anchor={section.anchor} aria-current={active === section.anchor ? 'true' : undefined}
            onClick={(event) => { event.preventDefault(); go(section.anchor); }}>{section.title}<span className="section-nav__count"><span className="sr-only">, </span>{section.count}</span></a>)}
        </nav>
        <button type="button" className="section-nav__arrow section-nav__arrow--previous" tabIndex={-1} aria-label="Earlier sections" hidden={edges.start} onClick={() => nudge(-1)}><ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" /></button>
        <button type="button" className="section-nav__arrow section-nav__arrow--next" tabIndex={-1} aria-label="More sections" hidden={edges.end} onClick={() => nudge(1)}><ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" /></button>
      </div>}
    </div>
  </>;
}
