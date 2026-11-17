/** Where a merchant adds or changes the account NexG pays them into. */
export const MERCHANT_PAYOUTS_HREF = '/merchant/money/payouts';

/** A payout declaration as `rpc_merchant_application_payout_read` returns it. */
export type DeclaredPayout = { rail?: string } & Partial<
  Record<
    | 'tillNumber'
    | 'paybillNumber'
    | 'accountReference'
    | 'bankName'
    | 'accountName'
    | 'accountNumber',
    string
  >
>;

/** The payout form's fields, in the shape the application form already uses. */
export interface PayoutFormValue {
  method: string;
  tillNumber: string;
  paybillNumber: string;
  accountReference: string;
  bankName: string;
  holderName: string;
  bankAccount: string;
}

export const EMPTY_PAYOUT_FORM: PayoutFormValue = {
  method: '',
  tillNumber: '',
  paybillNumber: '',
  accountReference: '',
  bankName: '',
  holderName: '',
  bankAccount: '',
};

/** An account number with all but its last four characters hidden. */
export function maskAccount(value: string | undefined): string {
  const compact = (value ?? '').replace(/\s+/g, '');
  return compact.length > 4 ? `•••• ${compact.slice(-4)}` : compact;
}

/**
 * Where the money goes, in two short lines for the summary card. Till and
 * PayBill numbers are public business numbers; a bank account number shows
 * only its last four characters.
 */
export function describePayout(
  payout: DeclaredPayout | null | undefined,
): { method: string; detail: string } | null {
  if (!payout?.rail) return null;
  switch (payout.rail) {
    case 'mpesa_till':
      return {
        method: 'M-Pesa Till (Buy Goods)',
        detail: `Till number ${payout.tillNumber ?? ''}`,
      };
    case 'mpesa_paybill':
      return {
        method: 'M-Pesa PayBill',
        detail: `PayBill ${payout.paybillNumber ?? ''}, account ${payout.accountReference ?? ''}`,
      };
    case 'bank':
      return {
        method: payout.bankName || 'Bank account',
        detail: [payout.accountName, maskAccount(payout.accountNumber)].filter(Boolean).join(' · '),
      };
    default:
      return {
        method: 'An earlier payout method',
        detail: 'Choose an M-Pesa Till, PayBill or bank account below.',
      };
  }
}

/**
 * What is missing or wrong in the form, before anything is sent. Mirrors
 * `MerchantPayoutDeclaration` (numbers are digits only, every field filled),
 * with messages written for this page.
 */
export function payoutFormProblem(value: PayoutFormValue): string | null {
  const filled = (text: string) => text.trim().length > 0;
  const digits = (text: string) => /^\d{1,20}$/.test(text.trim());
  switch (value.method) {
    case 'mpesa_till':
      if (!filled(value.tillNumber)) return 'Enter your Till number.';
      return digits(value.tillNumber) ? null : 'A Till number is digits only, up to 20.';
    case 'mpesa_paybill':
      if (!filled(value.paybillNumber)) return 'Enter the PayBill (business) number.';
      if (!digits(value.paybillNumber)) return 'A PayBill number is digits only, up to 20.';
      return filled(value.accountReference) ? null : 'Enter the account number for this PayBill.';
    case 'bank':
      if (!filled(value.bankName)) return 'Enter the name of your bank.';
      if (!filled(value.holderName)) return 'Enter the name on the account.';
      return filled(value.bankAccount) ? null : 'Enter the account number.';
    default:
      return 'Choose how you want to be paid.';
  }
}
