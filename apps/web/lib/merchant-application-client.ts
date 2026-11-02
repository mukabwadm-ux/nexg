import {
  MerchantApplicationCapture,
  MerchantPayoutDeclaration,
} from '@nexg/contracts/merchant-application';

export function applicationCapture(input: Record<string, any>) {
  const b = input.business ?? {};
  const normalize = (value: unknown) => {
    const valueText = String(value ?? '').replace(/[\s()-]/g, '');
    if (!valueText) return '';
    return valueText.startsWith('+254')
      ? valueText
      : valueText.startsWith('254')
        ? `+${valueText}`
        : valueText.startsWith('0')
          ? `+254${valueText.slice(1)}`
          : `+254${valueText}`;
  };
  return MerchantApplicationCapture.parse({
    registryRevision: input.registryRevision,
    business: {
      name: b.name ?? '',
      firstName: b.firstName ?? '',
      lastName: b.lastName ?? '',
      email: b.email ?? '',
      phone: normalize(b.phone),
      branchCount: b.branchCount === '' || b.branchCount == null ? null : Number(b.branchCount),
      registered: b.registered ?? null,
      sameBusinessPhone: b.sameBusinessPhone !== false,
      businessPhone: normalize(b.sameBusinessPhone !== false ? b.phone : b.businessPhone),
      marketing: b.marketing === true,
    },
    categoryId: input.categoryId || null,
    subcategories: input.subcategories ?? [],
    answersBySubcategory: input.answersBySubcategory ?? {},
    policies: { terms: input.policies?.terms === true },
  });
}
export function payoutDeclaration(input: Record<string, any>) {
  if (input.method === 'mobile_money')
    throw new Error(
      'Your previous phone number is retained. Choose Till, PayBill or bank before saving.',
    );
  const value =
    input.method === 'mpesa_till'
      ? { rail: input.method, tillNumber: input.tillNumber }
      : input.method === 'mpesa_paybill'
        ? {
            rail: input.method,
            paybillNumber: input.paybillNumber,
            accountReference: input.accountReference,
          }
        : {
            rail: input.method,
            bankName: input.bankName,
            accountName: input.holderName,
            accountNumber: input.bankAccount,
          };
  const parsed = MerchantPayoutDeclaration.safeParse(value);
  if (!parsed.success)
    throw new Error(
      'Complete the details for your chosen payout destination before saving. You can leave this task for later.',
    );
  return parsed.data;
}
export function payoutForm(value: Record<string, string> | null) {
  if (!value) return undefined;
  return {
    method: value.rail,
    tillNumber: value.tillNumber ?? '',
    paybillNumber: value.paybillNumber ?? '',
    accountReference: value.accountReference ?? '',
    bankName: value.bankName ?? '',
    holderName: value.accountName ?? '',
    bankAccount: value.accountNumber ?? '',
  };
}
