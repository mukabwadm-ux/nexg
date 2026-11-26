'use client';

import { Check, ChevronDown, Loader2 } from 'lucide-react';
import * as React from 'react';

export interface FlagOption {
  value: string;
  label: string;
  /** Shown after the label, quieter: a currency's name, say. */
  hint?: string;
  lang?: string;
  icon: React.ReactNode;
}

/**
 * A dropdown whose rows carry an icon (a flag) beside the name. A native
 * <select> cannot show pictures in its list, so this is a small listbox:
 * a button showing the chosen row, and a list that opens under it. It
 * keeps the keyboard a <select> has: arrows, Home/End, Enter or Space to
 * pick, Escape to close, and a typed letter jumps to the next row starting
 * with it.
 */
export function FlagSelect({
  id,
  labelId,
  value,
  options,
  busy,
  disabled,
  onChange,
}: {
  id: string;
  labelId: string;
  value: string;
  options: FlagOption[];
  busy?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const root = React.useRef<HTMLDivElement>(null);
  const list = React.useRef<HTMLUListElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const listId = `${id}-list`;

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIndex];

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    list.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const row = list.current?.children[active] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openList = () => {
    setActive(selectedIndex);
    setOpen(true);
  };

  const pick = (index: number) => {
    const option = options[index];
    setOpen(false);
    button.current?.focus();
    if (option && option.value !== value) onChange(option.value);
  };

  const onListKey = (event: React.KeyboardEvent) => {
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => Math.min(last, i + 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        return;
      case 'Home':
        event.preventDefault();
        setActive(0);
        return;
      case 'End':
        event.preventDefault();
        setActive(last);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        pick(active);
        return;
      case 'Escape':
        // Close only this list, not the panel around it.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
        if (event.key.length === 1) {
          const letter = event.key.toLowerCase();
          for (let step = 1; step <= options.length; step += 1) {
            const index = (active + step) % options.length;
            if (options[index]?.label.toLowerCase().startsWith(letter)) {
              setActive(index);
              break;
            }
          }
        }
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${id}`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openList();
          }
        }}
        className="border-border bg-bg text-ink focus-visible:ring-gold flex h-11 w-full items-center gap-2.5 rounded-xl border pe-10 ps-3 text-start text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60"
      >
        {selected?.icon}
        <span className="truncate" lang={selected?.lang}>
          {selected?.label}
        </span>
        {busy ? (
          <Loader2
            className="text-muted pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin"
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            className={`text-muted pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKey}
          className="bg-surface absolute inset-x-0 top-full z-10 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-black/10 p-1 shadow-lg focus:outline-none dark:border-white/10"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              // The keyboard is handled on the listbox (aria-activedescendant).
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={option.value}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                lang={option.lang}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(index)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                  index === active ? 'bg-ink/[0.06] dark:bg-white/[0.08]' : ''
                } ${isSelected ? 'font-bold' : 'font-medium'}`}
              >
                {option.icon}
                <span className="min-w-0 flex-1 truncate">
                  {option.label}
                  {option.hint && (
                    <span className="text-muted ms-1.5 font-normal">{option.hint}</span>
                  )}
                </span>
                {isSelected && <Check className="text-gold h-4 w-4 shrink-0" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
