import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { categories, findCategory, findSubcategory } from '../data/taxonomy';
import type { DiscoveryProvider, DiscoveryQuery, DiscoverySort } from '../providers/DiscoveryProvider';
import { useProviderRead } from '../hooks/useProviderRead';
import { HorizontalFilterBar } from './HorizontalFilterBar';

/** "Restaurants & Food", as the category tiles write it. */
const display = (label: string) => label.replace(/\s+and\s+/gi, ' & ');

/**
 * The one filter row for L2 and L3. On a category page (`scope="category"`) the category is the page itself,
 * so "Clear all" clears the filters and stays on the page; on results it clears the category too.
 */
export function DiscoveryFilterBar({ query, provider, onChange, scope = 'results' }: {
  query: DiscoveryQuery; provider: DiscoveryProvider; onChange: (change: Partial<DiscoveryQuery>) => void;
  scope?: 'category' | 'results';
}) {
  const category = findCategory(query.categoryId);
  const operatorContext = category?.id === 'travel-tours';
  const experienceContext = category?.id === 'experiences' || operatorContext;
  const subcategory = findSubcategory(query.categoryId, query.subcategoryId);
  const option = subcategory?.options.find((entry) => entry.id === query.optionId);
  const selectedCategory = subcategory ? option?.label || subcategory.label : undefined;
  const menuId = useId();
  const filterBar = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const menuChoices = useRef<HTMLDivElement>(null);
  const sortChoices = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const sortTrigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const [openMenu, setOpenMenu] = useState<'category' | 'sort' | null>(null);
  const menuOpen = openMenu === 'category';
  const sortMenuOpen = openMenu === 'sort';
  const [menuPosition, setMenuPosition] = useState<{ left: number; width: number; maxHeight: number; top?: number; bottom?: number }>();
  const [draftArea, setDraftArea] = useState(query.area ?? '');
  const [draftSearch, setDraftSearch] = useState(query.search ?? '');
  const areas = useProviderRead('filter-areas', (signal) => provider.getAreas(signal));
  const closeMenu = (returnFocus = false) => {
    if (menu.current) menu.current.open = false;
    const previousMenu = openMenu;
    setOpenMenu(null);
    setMenuPosition(undefined);
    if (returnFocus) (previousMenu === 'sort' ? sortTrigger.current : trigger.current)?.focus();
  };
  useLayoutEffect(() => {
    if (!openMenu) return;
    const positionMenu = () => {
      const anchor = (openMenu === 'sort' ? sortTrigger.current : trigger.current)?.getBoundingClientRect();
      if (!anchor) return;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportBottom = viewportTop + viewportHeight;
      if (anchor.right <= viewportLeft || anchor.left >= viewportRight || anchor.bottom <= viewportTop || anchor.top >= viewportBottom) {
        if (menu.current) menu.current.open = false;
        setOpenMenu(null);
        setMenuPosition(undefined);
        return;
      }
      const margin = 12;
      const gap = 8;
      const minimumWidth = openMenu === 'sort' ? 248 : 320;
      const width = Math.min(Math.max(minimumWidth, anchor.width), Math.max(0, viewportWidth - margin * 2));
      const left = Math.max(viewportLeft + margin, Math.min(anchor.left, viewportRight - margin - width));
      const below = Math.max(0, viewportBottom - anchor.bottom - gap - margin);
      const above = Math.max(0, anchor.top - viewportTop - gap - margin);
      const openAbove = below < 220 && above > below;
      setMenuPosition({
        left,
        width,
        maxHeight: Math.min(openMenu === 'sort' ? 420 : 540, openAbove ? above : below),
        ...(openAbove ? { bottom: window.innerHeight - anchor.top + gap } : { top: anchor.bottom + gap }),
      });
    };
    const onScroll = (event: Event) => {
      if (event.target === menuChoices.current || event.target === sortChoices.current) return;
      positionMenu();
    };
    positionMenu();
    const focusFrame = window.requestAnimationFrame(() => {
      const choices = openMenu === 'sort' ? sortChoices.current : menuChoices.current;
      choices?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    });
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', positionMenu);
    window.visualViewport?.addEventListener('resize', positionMenu);
    window.visualViewport?.addEventListener('scroll', positionMenu);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', positionMenu);
      window.visualViewport?.removeEventListener('resize', positionMenu);
      window.visualViewport?.removeEventListener('scroll', positionMenu);
    };
  }, [openMenu]);
  useEffect(() => {
    if (!openMenu) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !menuChoices.current?.contains(target) && !sortTrigger.current?.contains(target) && !sortChoices.current?.contains(target)) closeMenu();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMenu(true);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [openMenu]);
  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (openMenu === 'sort' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const options = Array.from(sortChoices.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]:not(:disabled)') ?? []);
      const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[nextIndex]?.focus();
      event.preventDefault();
      return;
    }
    if (event.key !== 'Tab') return;
    const choices = openMenu === 'sort' ? sortChoices.current : menuChoices.current;
    const focusable = Array.from(choices?.querySelectorAll<HTMLElement>('button:not([disabled]), summary, select:not([disabled]), input:not([disabled]), [tabindex="0"]') ?? [])
      .filter((element) => element.getClientRects().length > 0);
    const boundary = event.shiftKey ? focusable[0] : focusable[focusable.length - 1];
    if (event.target !== boundary) return;
    event.preventDefault();
    closeMenu();
    if (event.shiftKey) {
      (openMenu === 'sort' ? sortTrigger.current : trigger.current)?.focus();
      return;
    }
    const controls = Array.from(filterBar.current?.querySelectorAll<HTMLElement>('button:not([disabled]), summary') ?? []);
    const activeTrigger = openMenu === 'sort' ? sortTrigger.current : trigger.current;
    const triggerIndex = controls.indexOf(activeTrigger!);
    (controls[triggerIndex + 1] ?? activeTrigger)?.focus();
  };
  const select = (categoryId?: string, subcategoryId?: string, optionId?: string) => {
    closeMenu(true);
    onChange({ categoryId, subcategoryId, optionId, offset: 0 });
  };
  const sortOptions: { value: DiscoverySort | 'nearest'; label: string; detail?: string; disabled?: boolean }[] = ([
    { value: 'recommended', label: operatorContext ? 'Recommended operators' : experienceContext ? 'Recommended hosts' : 'Recommended', detail: 'A balanced mix of relevance and quality' },
    { value: 'rating', label: operatorContext ? 'Top rated operators' : experienceContext ? 'Top rated hosts' : 'Top rated', detail: 'Highest customer ratings first' },
    ...(!experienceContext ? [{ value: 'delivery' as const, label: 'Fastest delivery', detail: 'Shortest delivery estimates first' }] : []),
    { value: 'price_low', label: operatorContext ? 'Operator price level: low to high' : experienceContext ? 'Host price level: low to high' : 'Price: low to high', detail: operatorContext ? 'Order by the operator’s overall price level' : experienceContext ? 'Order by the host’s overall price level' : 'Lower priced options first' },
    { value: 'price_high', label: operatorContext ? 'Operator price level: high to low' : experienceContext ? 'Host price level: high to low' : 'Price: high to low', detail: operatorContext ? 'Order by the operator’s overall price level' : experienceContext ? 'Order by the host’s overall price level' : 'Higher priced options first' },
    { value: 'nearest', label: 'Nearest', detail: provider.capabilities.nearestSort ? 'Closest first' : 'Not available yet', disabled: !provider.capabilities.nearestSort },
  ] as { value: DiscoverySort | 'nearest'; label: string; detail?: string; disabled?: boolean }[]).map(option => ({ ...option,
    ...(option.value !== 'nearest' && provider.capabilities.supportedSorts && !provider.capabilities.supportedSorts.includes(option.value)
      ? { disabled: true, detail: 'This sort is not available yet' } : {}) }));
  const selectedSort = sortOptions.find((entry) => entry.value === (query.sort ?? 'recommended')) ?? sortOptions[0];
  const selectSort = (sort: DiscoverySort) => {
    closeMenu(true);
    onChange({ sort, offset: 0 });
  };
  const renderSubcategories = (entry: (typeof categories)[number]) => entry.subcategories.map((child) => child.options.length ? <details key={child.id} className="category-menu__group" open={child.id === subcategory?.id}>
    <summary>{child.label}<span className="category-menu__row-meta">{child.options.length} options</span><ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" /></summary>
    <div className="category-menu__nested">
      <button type="button" className="category-menu__choice" aria-pressed={subcategory?.id === child.id && !option} onClick={() => select(entry.id, child.id)}>All {child.label}{subcategory?.id === child.id && !option && <Check size={16} strokeWidth={1.75} aria-hidden="true" />}</button>
      {child.options.map((nested) => <button type="button" key={nested.id} className="category-menu__choice category-menu__choice--nested" aria-pressed={option?.id === nested.id} onClick={() => select(entry.id, child.id, nested.id)}>{nested.label}{option?.id === nested.id && <Check size={16} strokeWidth={1.75} aria-hidden="true" />}</button>)}
    </div>
  </details> : <button type="button" key={child.id} className="category-menu__choice" aria-pressed={subcategory?.id === child.id} onClick={() => select(entry.id, child.id)}>{child.label}{subcategory?.id === child.id && <Check size={16} strokeWidth={1.75} aria-hidden="true" />}</button>);
  const openSheet = () => { setDraftArea(query.area ?? ''); setDraftSearch(query.search ?? ''); sheet.current?.showModal(); };
  const pageCategory = scope === 'category' ? query.categoryId : undefined;
  const hasClearableFilters = Boolean((query.categoryId && !pageCategory) || query.subcategoryId || query.optionId || query.area || query.search || query.openNow || (query.sort && query.sort !== 'recommended'));
  const clearAll = () => {
    sheet.current?.close();
    setDraftArea('');
    setDraftSearch('');
    onChange({ categoryId: pageCategory, subcategoryId: undefined, optionId: undefined, area: undefined, search: undefined, openNow: undefined, sort: 'recommended', offset: 0 });
  };
  return <>
    <HorizontalFilterBar ref={filterBar}>
      <button type="button" className="filter-button" onClick={openSheet}><SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />All filters</button>
      <details ref={menu} className="category-filter" onToggle={(event) => { if (event.currentTarget.open) setOpenMenu('category'); else setOpenMenu((current) => current === 'category' ? null : current); }}>
        <summary ref={trigger} className={`filter-button${selectedCategory || menuOpen ? ' category-filter__trigger--active' : ''}`} aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined}>Category{selectedCategory && <>: <span className="filter-value">{selectedCategory}</span></>}<ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" /></summary>
      </details>
      <button ref={sortTrigger} type="button" className="filter-button sort-filter" aria-label={`Sort by${selectedSort.value !== 'recommended' ? `: ${selectedSort.label}` : ''}`} aria-haspopup="listbox" aria-expanded={sortMenuOpen} aria-controls={sortMenuOpen ? `${menuId}-sort` : undefined} onClick={() => { if (sortMenuOpen) closeMenu(); else { if (menu.current) menu.current.open = false; setOpenMenu('sort'); } }}>Sort by{selectedSort.value !== 'recommended' && <>: <span className="filter-value">{selectedSort.label}</span></>}<ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" /></button>
      {provider.capabilities.availabilityFilter && <button className={`filter-button availability-filter${query.openNow ? ' filter-button--selected' : ''}`} type="button" aria-pressed={Boolean(query.openNow)} onClick={() => onChange({ openNow: query.openNow ? undefined : true, offset: 0 })}>{operatorContext ? 'Operator open now' : experienceContext ? 'Host open now' : 'Open now'}</button>}
      {query.area && <button className="filter-button filter-button--selected" type="button" onClick={openSheet}><span className="sr-only">Area: </span>{query.area}<ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" /></button>}
      {hasClearableFilters && <button type="button" className="clear-all-button" onClick={clearAll}>Clear all</button>}
    </HorizontalFilterBar>
    {menuOpen && createPortal(<div
      id={menuId}
      className="category-menu"
      role="region"
      aria-label="Category choices"
      style={{ position: 'fixed', zIndex: 80, overflow: 'hidden', boxSizing: 'border-box', ...(menuPosition ?? { visibility: 'hidden' }) }}
    >
      <div ref={menuChoices} className="category-menu__scroll" style={{ maxHeight: menuPosition ? Math.max(0, menuPosition.maxHeight - 30) : undefined }} onKeyDown={handleMenuKeyDown}>
        <div className="category-menu__header"><div><span className="category-menu__eyebrow">{category ? display(category.label) : 'Browse NexG'}</span>{!category && <strong>Choose a category</strong>}<span className="category-menu__hint">{category ? subcategory ? 'Switch to another type, or see them all.' : 'Choose a type to narrow your results.' : 'Choose a category, then narrow it down.'}</span></div></div>
        {category ? <>
          <button type="button" className="category-menu__choice category-menu__choice--all" aria-pressed={!subcategory} onClick={() => select(category.id)}>All {display(category.label)}{!subcategory && <Check size={16} strokeWidth={1.75} aria-hidden="true" />}</button>
          <div className="category-menu__list">{renderSubcategories(category)}</div>
        </> : <>
          <button type="button" className="category-menu__choice category-menu__choice--all" aria-pressed={!query.categoryId} onClick={() => select()}>All categories{!query.categoryId && <Check size={16} strokeWidth={1.75} aria-hidden="true" />}</button>
          <div className="category-menu__list">{categories.map((entry) => <details key={entry.id} className="category-menu__group">
            <summary>{display(entry.label)}<span className="category-menu__row-meta">{entry.subcategories.length} types</span><ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" /></summary>
            <div className="category-menu__nested"><button type="button" className="category-menu__choice" onClick={() => select(entry.id)}>All {display(entry.label)}</button>{renderSubcategories(entry)}</div>
          </details>)}</div>
        </>}
      </div>
    </div>, document.body)}
    {sortMenuOpen && createPortal(<div
      id={`${menuId}-sort`}
      className="category-menu category-menu--sort"
      role="region"
      aria-label="Sort results"
      style={{ position: 'fixed', zIndex: 80, overflow: 'hidden', boxSizing: 'border-box', ...(menuPosition ?? { visibility: 'hidden' }) }}
    >
      <div ref={sortChoices} className="category-menu__scroll" style={{ maxHeight: menuPosition ? Math.max(0, menuPosition.maxHeight - 30) : undefined }} onKeyDown={handleMenuKeyDown}>
        <div className="category-menu__header"><div><span className="category-menu__eyebrow">Sort results</span><strong>Choose an order</strong><span className="category-menu__hint">Change the order of the results.</span></div></div>
        <div className="category-menu__list" role="listbox" aria-label="Sort options">{sortOptions.map((entry) => <button type="button" key={entry.value} role="option" aria-selected={selectedSort.value === entry.value} disabled={entry.disabled} className={`category-menu__sort-choice${selectedSort.value === entry.value ? ' category-menu__sort-choice--selected' : ''}`} onClick={() => { if (!entry.disabled) selectSort(entry.value as DiscoverySort); }}><span className="category-menu__sort-copy"><strong>{entry.label}</strong>{entry.detail && <small>{entry.detail}</small>}</span>{selectedSort.value === entry.value && <Check size={17} strokeWidth={1.75} aria-hidden="true" />}</button>)}</div>
      </div>
    </div>, document.body)}
    <dialog ref={sheet} className="filter-dialog" aria-labelledby="filter-dialog-title"><div className="dialog-heading"><h2 id="filter-dialog-title">All filters</h2><div className="dialog-heading__actions"><button type="button" className="text-button" disabled={!hasClearableFilters} onClick={clearAll}>Clear all</button><button type="button" className="icon-button" aria-label="Close filters" onClick={() => sheet.current?.close()}><X size={20} strokeWidth={1.75} aria-hidden="true" /></button></div></div><form onSubmit={(event) => { event.preventDefault(); sheet.current?.close(); onChange({ area: draftArea || undefined, search: draftSearch || undefined, offset: 0 }); }}><label>Search<input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder={operatorContext ? 'Trip or operator' : experienceContext && subcategory?.id !== 'experiences:photography' ? 'Experience or host' : 'Merchant or category'} /></label><label>Area<select value={draftArea} disabled={areas.loading || areas.error} onChange={(event) => setDraftArea(event.target.value)}><option value="">All areas</option>{draftArea && !areas.value?.includes(draftArea) && <option value={draftArea}>{draftArea}</option>}{areas.value?.map((area) => <option key={area} value={area}>{area}</option>)}</select></label>{areas.error && <p className="status-message">Areas couldn’t load just now. You can still search.</p>}<button type="submit" className="button button--primary">Apply filters</button></form></dialog>
  </>;
}
