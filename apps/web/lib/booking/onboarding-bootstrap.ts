import { validateBookingAnswer } from '@nexg/booking-config';
import { resolveOnboardingSelection } from '@nexg/booking-config/onboarding';
import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import { createClient } from '../supabase/server';
import { merchantBookingBootstrapAccess } from './identity';
import type { BookingIdentity } from './bridge';

/** Called only by explicit bootstrap POST. Null means an owner must initialize managed setup. */
export async function merchantBookingBootstrapIdentity(
  identity: BookingIdentity,
): Promise<BookingIdentity | null> {
  const access = merchantBookingBootstrapAccess(identity);
  if (!access) throw new Error('Booking setup authorization could not be confirmed.');
  if (access.legacy) return identity;
  // The application RPC is owner-only. Managers can use an existing engine
  // workspace without reading the owner's application or payout declaration.
  if (identity.role !== 'owner') return null;

  const client = createClient();
  const { data, error } = await (
    client as unknown as {
      rpc: (
        name: string,
        args: { p_merchant_id: string },
      ) => PromiseLike<{ data: unknown; error: unknown }>;
    }
  ).rpc('rpc_merchant_application_read', { p_merchant_id: identity.businessId });
  if (error) throw new Error('The saved application could not be read.');
  const record = MerchantApplicationRecord.parse(data);
  if (
    record.merchant_id !== identity.businessId ||
    record.revision !== access.revision ||
    record.review.state !== 'approved' ||
    record.review.submitted_revision !== record.revision ||
    record.review.needs_resubmission ||
    record.access.state !== 'approved' ||
    !record.access.operations
  )
    throw new Error('The current application approval could not be confirmed.');

  const capture = record.payload;
  const selection = resolveOnboardingSelection(capture.categoryId ?? '', capture.subcategories);
  const primary = capture.subcategories[0];
  if (
    selection.issues.length ||
    capture.registryRevision !== selection.revision ||
    !primary ||
    primary !== identity.subcategoryId
  )
    throw new Error('The approved application scope could not be confirmed.');

  const answers = capture.answersBySubcategory[primary] ?? {};
  const primaryQuestions = selection.profiles[0]!.sourceQuestionIds;
  if (
    Object.entries(answers).some(
      ([id, value]) =>
        !primaryQuestions.includes(id) ||
        (value !== null && !validateBookingAnswer(id, value).valid),
    )
  )
    throw new Error('The saved booking setup answers are invalid.');

  // The existing engine owns one primary configuration. Retain all other
  // activity scopes in the application instead of guessing native links.
  return { ...identity, answers: { ...answers } };
}
