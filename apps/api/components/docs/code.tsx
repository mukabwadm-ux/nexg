'use client';

import { cn } from '@nexg/ui';
import { Check, Copy } from 'lucide-react';
import * as React from 'react';

import { tokenize, type Language, type TokenKind } from '@/lib/highlight';

/**
 * Code in the docs: a dark panel, as black as the masthead, with strings in
 * NexG gold. Every block can be copied, and a language chosen in one set of
 * tabs is chosen in all of them, so a Python reader is not shown curl on
 * every page.
 */

const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: '',
  comment: 'text-shell-muted',
  string: 'text-gold',
  key: 'text-bg',
  number: 'text-[rgb(var(--code-literal-rgb))]',
  literal: 'text-[rgb(var(--code-literal-rgb))]',
  keyword: 'text-[rgb(var(--code-keyword-rgb))]',
  variable: 'text-[rgb(var(--code-literal-rgb))]',
  punctuation: 'text-white/55',
};

export function Highlighted({ code, language }: { code: string; language: Language }) {
  const tokens = React.useMemo(() => tokenize(code, language), [code, language]);
  return (
    <>
      {tokens.map((token, i) =>
        token.kind === 'plain' ? (
          <React.Fragment key={i}>{token.text}</React.Fragment>
        ) : (
          <span key={i} className={TOKEN_CLASS[token.kind]}>
            {token.text}
          </span>
        ),
      )}
    </>
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or a page without clipboard permission.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({
  text,
  label = 'Copy',
  tone = 'dark',
  compact = false,
  className,
}: {
  text: string;
  /** What is being copied, for screen readers: "Copy request". */
  label?: string;
  tone?: 'dark' | 'light';
  /** Icon only on phones, where the word would push the code onto more lines. */
  compact?: boolean;
  className?: string;
}) {
  const [state, setState] = React.useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const ok = await writeClipboard(text);
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold transition-colors duration-150',
        tone === 'dark'
          ? 'text-white/70 hover:bg-white/10 hover:text-white'
          : 'text-muted hover:bg-border/60 hover:text-ink',
        className,
      )}
    >
      {state === 'copied' ? (
        <Check className="text-gold h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span aria-hidden="true" className={compact ? 'hidden sm:inline' : undefined}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Press Ctrl+C' : 'Copy'}
      </span>
      <span role="status" className="sr-only">
        {state === 'copied' ? 'Copied to the clipboard' : state === 'failed' ? 'Copy failed' : ''}
      </span>
    </button>
  );
}

function Pre({
  code,
  language,
  maxHeight,
  className,
}: {
  code: string;
  language: Language;
  maxHeight?: boolean;
  className?: string;
}) {
  return (
    <pre
      // Current browsers make an overflowing <pre> keyboard-focusable on their own.
      className={cn(
        'code-scroll text-border overflow-auto px-4 py-4 font-mono text-[0.8125rem] leading-6 [tab-size:2] focus-visible:ring-inset',
        maxHeight && 'max-h-[30rem]',
        className,
      )}
    >
      <code>
        <Highlighted code={code} language={language} />
      </code>
    </pre>
  );
}

export function CodeBlock({
  code,
  language,
  title,
  maxHeight = false,
  fill = false,
  className,
}: {
  code: string;
  language: Language;
  /** Shown in the header strip: "Response", "200 OK", "Node.js". */
  title?: string;
  maxHeight?: boolean;
  /**
   * On wide screens, take the height left in a flex column and scroll
   * inside it, so a sticky column never runs past the bottom of the screen.
   */
  fill?: boolean;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        'bg-ink overflow-hidden rounded-xl shadow-raised',
        fill && 'xl:flex xl:min-h-0 xl:flex-col',
        className,
      )}
    >
      <figcaption className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-white/10 pl-4 pr-1.5">
        <span className="truncate text-xs font-bold text-white/65">{title ?? LANGUAGE_LABEL[language]}</span>
        <CopyButton text={code} label={`Copy ${title ?? 'code'}`} />
      </figcaption>
      <Pre
        code={code}
        language={language}
        maxHeight={maxHeight}
        className={fill ? 'xl:max-h-none xl:min-h-0 xl:flex-1' : undefined}
      />
    </figure>
  );
}

const LANGUAGE_LABEL: Record<Language, string> = {
  json: 'JSON',
  curl: 'curl',
  shell: 'Shell',
  javascript: 'JavaScript',
  python: 'Python',
  http: 'HTTP',
  text: 'Text',
};

/* ─────────────────────────────────────────────── one language across the docs */

const STORAGE_KEY = 'nexg-docs-language';

const LanguageContext = React.createContext<{
  preferred: string | null;
  setPreferred: (language: string) => void;
} | null>(null);

export function LanguagePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preferred, setPreferredState] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setPreferredState(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      /* Private windows and blocked storage: tabs still work, unremembered. */
    }
  }, []);

  const setPreferred = React.useCallback((language: string) => {
    setPreferredState(language);
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* As above. */
    }
  }, []);

  const value = React.useMemo(() => ({ preferred, setPreferred }), [preferred, setPreferred]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export interface TabSample {
  /** Matched across tab sets: curl, javascript, python… */
  language: string;
  label: string;
  code: string;
}

function toLanguage(language: string): Language {
  // Tab sets that compare variants of one command name them curl-<variant>.
  if (language.startsWith('curl') || language.startsWith('shell')) return 'curl';
  if (language === 'javascript' || language === 'python' || language === 'json' || language === 'http') {
    return language;
  }
  return 'text';
}

export function CodeTabs({
  samples,
  title,
  className,
  paneClassName,
}: {
  samples: TabSample[];
  /** Read by screen readers as the tab list's name: "Request". */
  title: string;
  className?: string;
  /** Extra classes for the scrolling code pane, such as a height cap. */
  paneClassName?: string;
}) {
  const context = React.useContext(LanguageContext);
  const [local, setLocal] = React.useState(0);
  const id = React.useId();

  const preferredIndex = context?.preferred
    ? samples.findIndex((sample) => sample.language === context.preferred)
    : -1;
  const active = preferredIndex >= 0 ? preferredIndex : Math.min(local, samples.length - 1);
  const current = samples[active] ?? samples[0];
  const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function choose(index: number) {
    const sample = samples[index];
    if (!sample) return;
    setLocal(index);
    context?.setPreferred(sample.language);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const last = samples.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = active === last ? 0 : active + 1;
    if (event.key === 'ArrowLeft') next = active === 0 ? last : active - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    choose(next);
    tabs.current[next]?.focus();
  }

  if (!current) return null;

  return (
    <div className={cn('bg-ink overflow-hidden rounded-xl shadow-raised', className)}>
      <div className="flex h-11 items-center justify-between gap-2 border-b border-white/10 pl-2 pr-1.5">
        <div
          role="tablist"
          aria-label={title}
          className="code-scroll -mb-px flex h-full min-w-0 items-stretch overflow-x-auto"
        >
          {samples.map((sample, index) => {
            const selected = index === active;
            return (
              <button
                key={sample.label}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${index}`}
                aria-selected={selected}
                aria-controls={`${id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(index)}
                onKeyDown={onKeyDown}
                className={cn(
                  'relative shrink-0 px-2.5 text-xs font-bold transition-colors duration-150 focus-visible:ring-inset',
                  selected ? 'text-white' : 'text-white/55 hover:text-white/85',
                )}
              >
                {sample.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    'bg-gold absolute inset-x-2.5 bottom-0 h-0.5 rounded-full transition-opacity duration-150',
                    selected ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </button>
            );
          })}
        </div>
        <CopyButton text={current.code} label={`Copy ${current.label} ${title.toLowerCase()}`} />
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`}>
        <Pre
          code={current.code}
          language={toLanguage(current.language)}
          className={paneClassName}
        />
      </div>
    </div>
  );
}
