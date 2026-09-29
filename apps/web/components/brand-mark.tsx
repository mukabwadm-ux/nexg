import Image from 'next/image';

/**
 * The NexG pin — the supplied artwork, not a reconstruction.
 *
 * This used to be an SVG I drew from the artboard, because the logo file only
 * contained the wordmark. The real mark has since been supplied, so it is used
 * directly: the cloche highlights and the taper on the pin are things a
 * hand-traced approximation got close to and never exactly right.
 *
 * Two files rather than one, because the pin body is black. On the ink
 * sidebar, footer and sign-in panel a black pin disappears, so the dark
 * variant has the body flipped to white and the gold left untouched.
 */
export function BrandMark({
  className,
  onDark = false,
  priority = false,
}: {
  className?: string;
  onDark?: boolean;
  priority?: boolean;
}) {
  return (
    <Image
      src={onDark ? '/brand/nexg-mark-dark.png' : '/brand/nexg-mark.png'}
      alt=""
      aria-hidden="true"
      width={495}
      height={452}
      priority={priority}
      className={className}
    />
  );
}
