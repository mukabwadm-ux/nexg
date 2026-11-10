'use client';

import { cn } from '@nexg/ui';
import * as React from 'react';

import { CopyButton, Highlighted } from '@/components/docs/code';

export interface ExplorerExample {
  id: string;
  label: string;
  command: string;
  response: string;
}

/**
 * The home page's proof: three real requests anyone can run without a key,
 * and what each one answers. Switching tabs swaps the pair in place.
 */
export function HeroExplorer({ examples }: { examples: ExplorerExample[] }) {
  const [active, setActive] = React.useState(0);
  const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const id = React.useId();
  const current = examples[active] ?? examples[0];

  function onKeyDown(event: React.KeyboardEvent) {
    const last = examples.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = active === last ? 0 : active + 1;
    if (event.key === 'ArrowLeft') next = active === 0 ? last : active - 1;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  if (!current) return null;

  return (
    <div className="overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
      <div
        role="tablist"
        aria-label="Example requests"
        className="code-scroll flex h-12 items-stretch gap-1 overflow-x-auto border-b border-white/10 px-2"
      >
        {examples.map((example, index) => {
          const selected = index === active;
          return (
            <button
              key={example.id}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${index}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={onKeyDown}
              className={cn(
                'relative shrink-0 px-3 text-sm font-bold transition-colors duration-150 focus-visible:ring-inset',
                selected ? 'text-white' : 'text-white/55 hover:text-white/85',
              )}
            >
              {example.label}
              <span
                aria-hidden="true"
                className={cn(
                  'bg-gold absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-opacity duration-150',
                  selected ? 'opacity-100' : 'opacity-0',
                )}
              />
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${active}`}
        key={current.id}
        className="animate-fade-in"
      >
        <div className="flex items-center gap-2 border-b border-white/10 py-1.5 pl-4 pr-1.5">
          <span aria-hidden="true" className="text-gold font-mono text-sm font-bold">
            $
          </span>
          <code className="min-w-0 flex-1 font-mono text-xs text-white [overflow-wrap:anywhere] sm:text-[0.8125rem]">
            {current.command}
          </code>
          <CopyButton text={current.command} label={`Copy the ${current.label} request`} compact />
        </div>
        <pre className="code-scroll text-border h-[21rem] overflow-auto px-4 py-4 font-mono text-[0.8125rem] leading-6 focus-visible:ring-inset">
          <code>
            <Highlighted code={current.response} language="json" />
          </code>
        </pre>
      </div>
      <p className="border-t border-white/10 px-4 py-2.5 text-xs text-white/55">
        No key needed for public reads. Example responses, shortened.
      </p>
    </div>
  );
}
