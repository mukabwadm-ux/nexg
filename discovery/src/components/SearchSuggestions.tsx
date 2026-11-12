import { LayoutGrid, Search, Store, UtensilsCrossed } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { SearchSuggestions } from '../providers/DiscoveryProvider';
import { foldSearch, suggestionList, type Suggestion } from '../data/searchSuggestions';

export type SuggestFetch = (search: string, signal: AbortSignal) => Promise<SearchSuggestions>;

/** Stores and items for the typed text, a moment after typing pauses. Failures show the taxonomy matches alone. */
function useRemoteSuggestions(search: string, suggest: SuggestFetch | undefined, active: boolean) {
  const cache = useRef(new Map<string, SearchSuggestions>());
  const [, setVersion] = useState(0);
  const term = search.trim();
  useEffect(() => {
    if (!suggest || !active || term.length < 2 || cache.current.has(term)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      suggest(term, controller.signal).then((result) => {
        cache.current.set(term, result);
        setVersion((value) => value + 1);
      }, () => {});
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [suggest, active, term]);
  return { result: cache.current.get(term), pending: Boolean(suggest && active && term.length >= 2 && !cache.current.has(term)) };
}

/** The typed letters in bold where they appear together in the name. */
function Highlight({ text, search }: { text: string; search: string }): ReactNode {
  const term = foldSearch(search);
  const at = term ? foldSearch(text).indexOf(term) : -1;
  // Folding keeps one character per character for the Latin names in the catalogue; anything else is shown plain.
  if (at < 0 || foldSearch(text).length !== text.length) return text;
  return <>{text.slice(0, at)}<strong>{text.slice(at, at + term.length)}</strong>{text.slice(at + term.length)}</>;
}

const groupTitle: Partial<Record<Suggestion['kind'], string>> = { category: 'Categories', subcategory: 'Categories', merchant: 'Stores', item: 'Items' };
const icon = (kind: Suggestion['kind']) => kind === 'search' ? <Search size={16} strokeWidth={1.75} aria-hidden="true" />
  : kind === 'merchant' ? <Store size={16} strokeWidth={1.75} aria-hidden="true" />
  : kind === 'item' ? <UtensilsCrossed size={16} strokeWidth={1.75} aria-hidden="true" />
  : <LayoutGrid size={16} strokeWidth={1.75} aria-hidden="true" />;

/**
 * The suggestion box under the search bar (owner, 12 Nov 2026). It opens as soon as there is text, with matching
 * categories at once and matching stores and items a moment later, best matches and promoted stores first.
 * Arrow keys move, Enter opens, Escape closes; the input stays a plain search form without it.
 */
export function useSearchSuggestions({ search, suggest, onChoose, enabled, listId }: {
  search: string; suggest?: SuggestFetch; onChoose: (suggestion: Suggestion) => void; enabled: boolean; listId: string;
}) {
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const open = enabled && focused && !dismissed && search.trim().length > 0;
  const { result, pending } = useRemoteSuggestions(search, suggest, open);
  const list = useMemo(() => (open ? suggestionList(search, result) : []), [open, search, result]);
  useEffect(() => { setActive(-1); setDismissed(false); }, [search]);
  const choose = (suggestion: Suggestion) => { setDismissed(true); onChoose(suggestion); };
  const optionId = (index: number) => `${listId}-${index}`;

  const inputProps = {
    role: 'combobox' as const,
    'aria-expanded': open && list.length > 0,
    'aria-controls': listId,
    'aria-autocomplete': 'list' as const,
    'aria-activedescendant': open && active >= 0 ? optionId(active) : undefined,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (!open || !list.length) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => (index + 1) % list.length); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => (index <= 0 ? list.length - 1 : index - 1)); }
      else if (event.key === 'Escape') { event.preventDefault(); setDismissed(true); }
      else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(list[active]!); }
    },
  };

  const box = open && list.length > 0 ? <div className="search-suggest" role="listbox" id={listId} aria-label="Search suggestions"
    // Keeps focus in the input, so a tap chooses before the box closes on blur.
    onMouseDown={(event) => event.preventDefault()}>
    {list.map((suggestion, index) => {
      const title = groupTitle[suggestion.kind];
      const previous = index > 0 ? groupTitle[list[index - 1]!.kind] : undefined;
      return <div key={suggestion.key} role="presentation">
        {title && title !== previous && <div className="search-suggest__group" role="presentation">{title}</div>}
        <div id={optionId(index)} role="option" aria-selected={index === active} className={`search-suggest__option${index === active ? ' is-active' : ''}`}
          onMouseEnter={() => setActive(index)} onClick={() => choose(suggestion)}>
          <span className="search-suggest__icon">{icon(suggestion.kind)}</span>
          <span className="search-suggest__text">
            <span className="search-suggest__label">{suggestion.kind === 'search' ? <>Search for “{suggestion.label}”</> : <Highlight text={suggestion.label} search={search} />}</span>
            {'context' in suggestion && suggestion.context && <span className="search-suggest__context">{suggestion.kind === 'item' ? `at ${suggestion.context}` : suggestion.context}</span>}
          </span>
          {suggestion.kind === 'item' && suggestion.price ? <span className="search-suggest__price">KES {suggestion.price.toLocaleString('en-KE')}</span> : null}
        </div>
      </div>;
    })}
    {pending && <div className="search-suggest__status" role="presentation">Finding stores and items…</div>}
  </div> : null;

  return { inputProps, box, close: () => setDismissed(true) };
}
