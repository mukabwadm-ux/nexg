/*
 * What a failed or unfinished payment means for the guest.
 *
 * Providers explain a failure in their own words: Safaricom's ResultDesc
 * ("Request cancelled by user", "DS timeout user cannot be reached"),
 * or the bank's failure reason. The payment
 * keeps that text as failure_reason; this turns it into something a guest
 * can act on. Nothing here decides whether a payment happened; that is
 * the database's job.
 */

export type FailureKind =
  | 'cancelled'
  | 'timeout'
  | 'insufficient'
  | 'wrong_pin'
  | 'busy'
  | 'declined'
  | 'unknown';

const RULES: [FailureKind, RegExp][] = [
  ['cancelled', /cancel|abandon/i],
  ['timeout', /time ?out|timed out|cannot be reached|expired|no response/i],
  ['insufficient', /insufficient|not enough|balance/i],
  ['wrong_pin', /initiator information is invalid|wrong pin|invalid pin|incorrect pin/i],
  ['busy', /already in process|transaction is already/i],
  ['declined', /declin|blocked|do not honou?r|restricted/i],
];

export function failureKind(reason: string | null | undefined): FailureKind {
  if (!reason) return 'unknown';
  return RULES.find(([, pattern]) => pattern.test(reason))?.[0] ?? 'unknown';
}

export interface FailureCopy {
  title: string;
  message: string;
}

export function failureCopy(kind: FailureKind, amount: string): FailureCopy {
  switch (kind) {
    case 'cancelled':
      return {
        title: 'Payment cancelled',
        message:
          'You cancelled the payment, so nothing was charged. Your order is saved: pay whenever you are ready.',
      };
    case 'timeout':
      return {
        title: 'The prompt timed out',
        message:
          'There was no answer in time, so nothing was charged. Keep your phone nearby and send a new prompt.',
      };
    case 'insufficient':
      return {
        title: 'Not enough funds',
        message: `There was not enough to pay ${amount}, so nothing was charged. Top up and try again, or pay another way.`,
      };
    case 'wrong_pin':
      return {
        title: 'The PIN did not match',
        message:
          'The payment was not approved, so nothing was charged. Try again with your M-Pesa PIN.',
      };
    case 'busy':
      return {
        title: 'Another payment was in progress',
        message:
          'Your phone was finishing another M-Pesa request. Wait a minute, then send a new prompt.',
      };
    case 'declined':
      return {
        title: 'The payment was declined',
        message: 'Nothing was charged. Try again, or pay another way.',
      };
    case 'unknown':
      return {
        title: 'That did not go through',
        message:
          'The payment was not completed, so nothing was charged. Try again, or pay another way.',
      };
  }
}

/** How long an M-Pesa prompt stays answerable before Safaricom drops it. */
export const PROMPT_EXPIRES_AFTER_SECONDS = 90;
