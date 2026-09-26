import { cn } from '@nexg/ui';

/**
 * The NexG lockup: the pin, the NEXG wordmark, and CONCIERGE beneath.
 *
 * The wordmark paths are the supplied `nexg logo.svg` verbatim (also kept at
 * /brand/nexg-logo.svg for favicons and social cards). It is inlined here
 * rather than loaded as an <img> for one reason: in the source file the N, E
 * and one stroke of the X are #F1F3F6, which is invisible on the cream page.
 * Those paths use currentColor instead, so the same mark reads correctly on
 * cream, on white and on the dark bands — only the X and G stay gold, exactly
 * as drawn.
 */
export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2',
        onDark ? 'text-white' : 'text-ink',
        className,
      )}
    >
      {/* Pin and speed lines. */}
      <svg viewBox="0 0 40 44" className="h-9 w-8 shrink-0" aria-hidden="true">
        <path
          d="M24 2.5c-7.7 0-14 6.1-14 13.7 0 9.6 11.9 22.3 13.1 23.6a1.2 1.2 0 0 0 1.8 0C26.1 38.5 38 25.8 38 16.2 38 8.6 31.7 2.5 24 2.5Z"
          className="fill-gold"
        />
        <circle cx="24" cy="15.5" r="5" className={onDark ? 'fill-ink' : 'fill-ink'} />
        <path
          d="M2 21h11M2 27h8M2 33h5"
          className="stroke-gold"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>

      <span className="flex flex-col leading-none">
        {/* NEXG — supplied artwork, light strokes switched to currentColor. */}
        <svg viewBox="8 184 376 136" className="h-[1.35rem] w-auto" role="img" aria-label="NexG">
          <path
            fill="currentColor"
            d="M16.7,205.9H29c1.3,0,2.5,0.7,3.2,1.7l34.5,56.5c1.8,3,6.8,1.8,6.8-1.6v-53.2c0-1.9,1.6-3.4,3.7-3.4h11.6 c2,0,3.7,1.5,3.7,3.4V308c0,1.9-1.6,3.4-3.7,3.4H76.4c-1.3,0-2.5-0.7-3.2-1.7l-34.5-56.3c-1.8-3-6.9-1.8-6.9,1.6v53 c0,1.9-1.6,3.4-3.7,3.4H16.7c-2,0-3.7-1.5-3.7-3.4v-98.8C13,207.4,14.7,205.9,16.7,205.9z"
          />
          <path
            fill="currentColor"
            d="M110.7,206.4h54.5c2.7,0,5,2.2,5,5v9.8c0,2.7-2.2,5-5,5H133c-2.7,0-5,2.2-5,5v9.2c0,2.7,2.2,5,5,5h32.2 c2.7,0,5,2.2,5,5v9.4c0,2.7-2.2,5-5,5H133c-2.7,0-5,2.2-5,5v17.9c0,2.7,2.2,5,5,5h32.2c2.7,0,5,2.2,5,5v9.8c0,2.7-2.2,5-5,5h-54.5 c-2.7,0-5-2.2-5-5v-95.7C105.8,208.6,108,206.4,110.7,206.4z"
          />
          <path
            fill="currentColor"
            d="M244.7,249.9l24.8-34.4c3-4.1-0.2-9.7-5.6-9.7h-8.8c-2.2,0-4.3,1-5.6,2.8l-18.5,25.5c-1.2,1.7-1.1,4,0.2,5.6l8.7,10.4 C241.2,251.5,243.6,251.4,244.7,249.9z"
          />
          <path
            fill="currentColor"
            d="M241.5,262.9l-8.3,11.5c-1.3,1.8-1.4,4.3-0.2,6.2l17.6,28.3c1.2,1.9,3.2,3.1,5.3,3.1h8.4c5.1,0,8.2-6.1,5.3-10.7L246,263.1 C244.9,261.4,242.7,261.3,241.5,262.9z"
          />
          <path
            fill="#E5B65F"
            d="M227.6,240.1l-22.8-31.6c-1-1.4-2.7-2.2-4.5-2.2h-12.1c-4.3,0-6.8,4.4-4.5,7.7l29.4,40.8 c1.2,1.7,1.2,3.8,0,5.5l-31.9,44.1c-2.4,3.3,0.2,7.7,4.5,7.7H198c1.8,0,3.5-0.8,4.5-2.2l25.2-35l0.1,0.1l11.2-15.5 c1.3-1.8,1.2-4.1-0.2-5.8l-11-13.4C227.7,240.2,227.6,240.1,227.6,240.1z"
          />
          <path
            fill="#E5B65F"
            stroke="#E5B65F"
            strokeWidth="4"
            strokeMiterlimit="10"
            d="M320.5,202.1c-1.8-0.7-3-2.9-3-5.6v-3.1c0-3.2,1.9-5.8,4.3-5.8h15c2.3,0,4.3,2.6,4.3,5.8v3.1 c0,2.6-1.2,4.8-2.9,5.5"
          />
          <path
            fill="#E5B65F"
            stroke="#E5B65F"
            strokeWidth="5"
            strokeMiterlimit="10"
            d="M338.5,201.4c-2.2,0.4-6.2-1.1-6.4,4.4c-0.1,2.4,0,5.1,2,5.2c13.1,0,23.3,6.4,29.5,14.2 c10.7,13.5,3.2,15-5.3,14.3c0,0-4.6-0.7-6-2.4c-12.9-16.1-38.5-11.1-46.5,2.4c-7.8,13.1-11.1,53.7,21.3,54.3 c11.9,0.2,18.5-2.4,25.3-13.5c2.1-3.5-0.4-7.9-4.4-7.9l-15,0.2c-2.8,0-5.2-2.2-5.2-5.1v-6.3c0-2.8,2.2-5,5-5.1l33.8-0.3 c2.8,0,5.1,2.2,5.1,5c0.5,26.1-15.7,51.9-43.3,51.1c-59.9,0.7-60.9-97.8-1.8-101.1c0.9-0.1,0.8-3.6,0.7-5c-0.1-4.7-7.6-4.4-7.6-4.4"
          />
        </svg>

        <span
          className={cn(
            'mt-1 text-[0.5rem] font-bold uppercase tracking-[0.34em]',
            onDark ? 'text-white/50' : 'text-muted-light',
          )}
        >
          Concierge
        </span>
      </span>
    </span>
  );
}
