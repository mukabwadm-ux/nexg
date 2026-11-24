/**
 * How a rider is paid, in words, from the payout overview's `payoutRules`
 * (Finance sets them per city on Payout rules): the payout run, or
 * automatically as soon as earnings clear, every day, week or month.
 */

export interface PayoutRules {
  mode?: string;
  weekday?: string;
  monthlyDay?: number;
  payHour?: number;
  holdHours?: number;
  feePaidBy?: string;
  feeKes?: number | null;
  nextPayoutAt?: string | null;
}

const DAY: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function hour(h: number | undefined): string {
  const n = typeof h === 'number' && h >= 0 && h <= 23 ? Math.round(h) : 9;
  return `${String(n).padStart(2, '0')}:00`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** "every Friday at 09:00", or "in the weekly payout run". */
export function payoutWhen(rules: PayoutRules | undefined): string {
  switch (rules?.mode) {
    case 'immediate':
      return 'as soon as your earnings clear';
    case 'daily':
      return `every day at ${hour(rules.payHour)}`;
    case 'weekly':
      return `every ${DAY[rules.weekday ?? ''] ?? 'Friday'} at ${hour(rules.payHour)}`;
    case 'monthly':
      return `on the ${ordinal(Math.min(Math.max(Math.round(rules.monthlyDay ?? 1), 1), 28))} of each month at ${hour(rules.payHour)}`;
    default:
      return 'in the weekly payout run';
  }
}

/** Whether this rider is paid automatically rather than in Finance's run. */
export function paidAutomatically(rules: PayoutRules | undefined): boolean {
  return ['immediate', 'daily', 'weekly', 'monthly'].includes(rules?.mode ?? '');
}

/** The small print under the schedule: the hold and the fee. */
export function payoutTerms(rules: PayoutRules | undefined): string | null {
  if (!paidAutomatically(rules)) return null;
  const parts: string[] = [];
  const hold = Math.round(rules?.holdHours ?? 0);
  if (hold > 0) {
    parts.push(
      hold % 24 === 0
        ? `Earnings are paid once they are ${hold / 24} day${hold === 24 ? '' : 's'} old.`
        : `Earnings are paid once they are ${hold} hours old.`,
    );
  }
  if (rules?.feePaidBy === 'rider' && typeof rules.feeKes === 'number' && rules.feeKes > 0) {
    parts.push(
      `Paystack's KES ${rules.feeKes.toLocaleString('en-KE')} transfer fee comes off each payout.`,
    );
  } else if (rules?.feePaidBy === 'rider') {
    parts.push("Paystack's transfer fee comes off each payout.");
  } else {
    parts.push('NexG pays the transfer fee.');
  }
  return parts.join(' ');
}
