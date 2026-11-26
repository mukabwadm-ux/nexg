import styles from './wrong-turn.module.css';

/**
 * "404" set in the display weight, with the zero drawn as a roundabout:
 * a gold route comes up from below, goes three quarters of the way round
 * and runs into a closed road. Decorative; the page heading says it in words.
 */
export function WrongTurn() {
  return (
    <div
      aria-hidden="true"
      className="text-page flex select-none items-center justify-center gap-[0.07em] text-[clamp(4.75rem,19vw,6rem)] font-extrabold leading-none tracking-[-0.04em]"
    >
      <span>4</span>
      <svg
        viewBox="0 0 138 150"
        className="h-[1.04em] w-auto translate-y-[0.06em] overflow-visible"
        fill="none"
      >
        {/* The roundabout: the zero's own stroke, in the page colour. */}
        <circle cx="62" cy="62" r="36" stroke="currentColor" strokeWidth="24" />
        {/* The island in the middle. */}
        <circle cx="62" cy="62" r="11" className="fill-gold/25" />
        {/* The route: up from below, round by the left and over the top, out to the right. */}
        <path
          d="M62 146 V98 A36 36 0 1 1 98 62 H117"
          pathLength={1}
          className={`stroke-gold ${styles.route}`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Where the route starts. */}
        <circle cx="62" cy="146" r="6.5" className={`fill-gold ${styles.start}`} />
        {/* The closed road it runs into. */}
        <g className={styles.barrier}>
          <rect x="123" y="36" width="13" height="52" rx="3.5" className="fill-page" />
          <rect x="123" y="46" width="13" height="8" className="fill-gold" />
          <rect x="123" y="70" width="13" height="8" className="fill-gold" />
        </g>
      </svg>
      <span>4</span>
    </div>
  );
}
