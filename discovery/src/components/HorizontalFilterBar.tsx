import type { ReactNode, Ref } from 'react';

/** The shared non-wrapping filter container for discovery and storefront inventory. */
export function HorizontalFilterBar({ children, label = 'Discovery filters', className = '', ref }: { children: ReactNode; label?: string; className?: string; ref?: Ref<HTMLDivElement> }) {
  return <div ref={ref} className={`filter-bar ${className}`.trim()} role="group" aria-label={label}>{children}</div>;
}
