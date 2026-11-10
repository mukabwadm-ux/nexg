/**
 * Test accounts a tester picks on the approval page. Each behaves the same
 * way every time, so a test can aim for a particular outcome.
 * Balances are in minor units (cents) and reset when the sandbox restarts.
 */
export interface TestAccount {
  id: string;
  holder: string;
  number: string;
  /** null: unlimited. */
  balance: number | null;
  behaviour: 'pay' | 'blocked' | 'slow';
  note: string;
}

export const TEST_ACCOUNTS: readonly TestAccount[] = [
  {
    id: 'acc_good_funds',
    holder: 'Wanjiru Kamau',
    number: '0110 0000 4821',
    balance: 50_000_000,
    behaviour: 'pay',
    note: 'KES 500,000 available. Pays.',
  },
  {
    id: 'acc_low_funds',
    holder: 'Otieno Achieng',
    number: '0110 0000 1177',
    balance: 15_000,
    behaviour: 'pay',
    note: 'KES 150 available. Fails with insufficient funds above that.',
  },
  {
    id: 'acc_blocked',
    holder: 'Blocked Account',
    number: '0110 0000 9020',
    balance: null,
    behaviour: 'blocked',
    note: 'Declined: the account is blocked.',
  },
  {
    id: 'acc_slow',
    holder: 'Delayed Approval',
    number: '0110 0000 3315',
    balance: null,
    behaviour: 'slow',
    note: 'Processing for a while, then pays. Tests the waiting state.',
  },
];

export const maskAccount = (number: string) => `****${number.replace(/\D/g, '').slice(-4)}`;
