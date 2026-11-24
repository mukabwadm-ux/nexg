/**
 * Whether the public job board is on.
 *
 * While it is off, /careers shows a "Coming soon" page and every job page
 * under it (/careers/jobs, /careers/employers, /careers/[slug], apply)
 * redirects to /careers. The board code, the merchant and host Hiring tools
 * and the admin Job board all stay as they are. Set this to true to switch the
 * public board back on.
 *
 * /careers/status/[token] stays reachable either way: applicants may hold
 * emailed links to it.
 */
export const CAREERS_BOARD_OPEN = false;
