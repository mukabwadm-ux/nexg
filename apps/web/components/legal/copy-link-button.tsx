'use client';

import { Check, Link2 } from 'lucide-react';
import * as React from 'react';

/**
 * Copies a link straight to one section, for pasting into a chat or an email.
 * Where the browser won't copy, it puts the section in the address bar
 * instead, so the link is still one copy away.
 */
export function CopyLinkButton({ id, heading }: { id: string; heading: string }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.history.replaceState(null, '', `#${id}`);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy link to ${heading}`}
        className="text-page-muted hover:text-page focus-visible:ring-gold flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[0.8125rem] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 lg:h-8 print:hidden"
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Link2 className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="lg:sr-only">{copied ? 'Copied' : 'Copy link'}</span>
      </button>
      <span role="status" className="sr-only">
        {copied ? `Link to ${heading} copied` : ''}
      </span>
    </>
  );
}
