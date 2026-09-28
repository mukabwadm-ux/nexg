/**
 * The NexG pin on its own: black teardrop, gold cloche, three speed lines.
 *
 * Reconstructed from the artboard at 58x50 — the supplied nexg-logo.svg holds
 * only the wordmark, its two mark-layer paths being empty move-to stubs. It
 * lives here rather than inside Logo because the merchant dashboard mock shows
 * the same mark without the wordmark, and one definition beats two.
 *
 * `onDark` swaps the two neutrals so the ring and its lit face keep their
 * contrast on an ink background.
 */
export function BrandMark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 58 50" className={className} aria-hidden="true">
      {/* Pin body. */}
      <path
        d="M38.5 50 L23.68 32.68 A19.5 19.5 0 1 1 53.32 32.68 Z"
        className={onDark ? 'fill-white' : 'fill-ink'}
      />
      {/* The lit face inside the ring, cut off at the cloche base. */}
      <path
        d="M24.43 25.5 A15.5 15.5 0 1 1 52.57 25.5 Z"
        className={onDark ? 'fill-ink' : 'fill-bg'}
      />
      {/* Cloche. */}
      <path d="M26.4 21.8 A11.8 13.5 0 0 1 50 21.8 Z" className="fill-gold" />
      <rect x="24" y="21.4" width="28" height="4.2" rx="2.1" className="fill-gold" />
      <rect x="37.1" y="5.6" width="2.4" height="3.4" rx="1.2" className="fill-gold" />
      <circle cx="38.3" cy="5.2" r="2.3" className="fill-gold" />
      {/* Speed lines, drawn over the pin as the artboard has them. */}
      <rect x="0" y="15.4" width="27" height="4.2" rx="2.1" className="fill-gold" />
      <rect x="3.5" y="22" width="23.5" height="3.8" rx="1.9" className="fill-gold" />
      <rect x="9" y="28.4" width="18" height="3.8" rx="1.9" className="fill-gold" />
    </svg>
  );
}
