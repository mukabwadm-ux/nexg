import { redirect } from 'next/navigation';

/**
 * Support & tickets moved into Messaging.
 *
 * Tickets are conversations now — `fn_msg_absorb_legacy` brought
 * them across, internal notes and all — and this page could only
 * reply and change a status, both of which the Messaging inbox
 * does against the same rows.
 *
 * The route stays and redirects rather than being deleted. A
 * bookmark, a runbook and a line in somebody's notes all point
 * here, and a 404 teaches them nothing about where it went.
 */
export default function SupportMoved() {
  redirect('/messaging?tab=inbox');
}
