import { useState, type ImgHTMLAttributes } from 'react';
import { Image as ImageGlyph } from 'lucide-react';

/** Preserve the image space when the source does not provide a usable image. */
export function ImageWithFallback({
  src,
  alt = '',
  className = '',
  style,
  onError,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [failedSource, setFailedSource] = useState<string>();

  if (!src || failedSource === src) {
    return (
      <span
        className={`image-fallback ${className}`.trim()}
        style={style}
        role={alt ? 'img' : undefined}
        aria-label={alt ? `${alt}: image unavailable` : undefined}
        aria-hidden={alt ? undefined : true}
      >
        {/* A calm placeholder, not a "broken" icon: many demo items have no photo yet. */}
        <ImageGlyph size={24} strokeWidth={1.5} aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      {...props}
      src={src}
      alt={alt}
      style={style}
      className={className}
      onError={(event) => {
        setFailedSource(src);
        onError?.(event);
      }}
    />
  );
}
