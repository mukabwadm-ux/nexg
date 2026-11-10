import type { SVGProps } from 'react';

/** Small motorcycle silhouette used beside restaurant delivery estimates. */
export function MotorcycleIcon(props: SVGProps<SVGSVGElement>) {
  return <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <circle cx="6" cy="17.5" r="3" />
    <circle cx="18.5" cy="17.5" r="3" />
    <path d="M9 17.5h2.5l2.7-5h3.1l1.2 5M11.5 12.5l-2-3H7.7M13.8 12.5l-1-3.5h3.3l2.2 3.5M17.2 9l2.2-2M18.8 7h2" />
  </svg>;
}
