import { useId, useMemo, useState, type KeyboardEvent, type Ref } from 'react';
import { MapPin, X } from 'lucide-react';
import { placeFromArea, placeSuggestions } from '../../data/transferPresentation';

/**
 * The end of the ride that isn't the airport: free text, with the catalogue's Nairobi areas offered as the traveller
 * types (an ARIA 1.2 combobox: arrows move, Enter picks, Escape closes). A pick fills "Westlands, Nairobi"; anything
 * typed stands as it is. Styles live in transfers.css.
 */
export function PlaceField({ id, label, value, onChange, areas, placeholder, error, errorId, inputRef }: {
  id: string; label: string; value: string; onChange: (value: string) => void; areas: readonly string[];
  placeholder: string; error?: string; errorId: string; inputRef?: Ref<HTMLInputElement>;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = useMemo(() => placeSuggestions(areas, value), [areas, value]);
  const shown = open && suggestions.length > 0;
  const name = label.toLocaleLowerCase('en-KE');

  const close = () => { setOpen(false); setActive(-1); };
  const choose = (area: string) => { onChange(placeFromArea(area)); close(); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestions.length) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current < 0 ? (step > 0 ? 0 : suggestions.length - 1) : (current + step + suggestions.length) % suggestions.length));
    } else if (event.key === 'Enter' && shown && active >= 0) {
      // Picks the highlighted area instead of sending the form.
      event.preventDefault();
      choose(suggestions[active]!);
    } else if (event.key === 'Escape' && shown) {
      event.preventDefault();
      close();
    }
  };

  return <div className={`transfer-field transfer-field--place${error ? ' is-invalid' : ''}`}>
    <label className="transfer-field__label" htmlFor={id}>{label}</label>
    <div className="transfer-control">
      <MapPin className="transfer-control__icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      <input ref={inputRef} id={id} type="text" role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
        value={value} maxLength={120} placeholder={placeholder} autoComplete="off" autoCapitalize="words" spellCheck={false} enterKeyHint="next"
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onBlur={close} onKeyDown={onKeyDown} />
      {/* The button leaves with the text, so the focus goes back to the field. */}
      {value && <button type="button" className="transfer-control__clear" aria-label={`Clear ${name}`}
        onPointerDown={(event) => event.preventDefault()} onClick={() => { onChange(''); document.getElementById(id)?.focus(); }}><X size={16} strokeWidth={1.75} aria-hidden="true" /></button>}
      <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="transfer-suggestions" hidden={!shown}>
        {shown && suggestions.map((area, index) => <li key={area} id={`${listId}-${index}`} role="option" aria-selected={index === active}
          className={index === active ? 'is-active' : undefined}
          // Keeps the focus in the field, so picking with a tap or a click never blurs it first.
          onPointerDown={(event) => event.preventDefault()} onClick={() => choose(area)} onPointerEnter={() => setActive(index)}>
          <MapPin size={16} strokeWidth={1.75} aria-hidden="true" /><span className="transfer-suggestions__name">{area}</span><span className="transfer-suggestions__city">Nairobi</span>
        </li>)}
      </ul>
    </div>
    {error && <p id={errorId} className="transfer-field__error">{error}</p>}
  </div>;
}
