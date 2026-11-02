# Phase 4 inputs: existing systems and M-Pesa destinations

Date: 2 November 2026, Africa/Nairobi. Status: research and integration inputs, not backend implementation or payment-provider acceptance.

The user confirmed that M-Pesa Till and PayBill must be represented correctly, and that the existing booking engine and earlier backend/API analysis must inform integration. This note supplements the [phase plan](README.md); Phase 4 remains open. Registration stays limited to the six basic groups. Payout details belong in the Home task, and email OTP remains deferred until the final phase.

## Safaricom findings

| Destination | Information to capture in the Home payout editor | Meaning |
| --- | --- | --- |
| M-Pesa Buy Goods / Till | Till number and declared registered business/account name | The Till number identifies the recipient for Buy Goods payments. Do not ask for a PayBill account reference on this branch. |
| M-Pesa PayBill | PayBill / business number, account number or reference, and declared registered business/account name | The business number identifies the receiving organization. The organization assigns the account reference for allocation and reconciliation. It is separate from the business number and is not necessarily a bank account. |
| Bank | Existing supported bank/account fields | Keep bank details in their own branch and retain the existing finance verification boundary. |

Safaricom's [Business Hub FAQ](https://hub.m-pesaforbusiness.co.ke/) identifies the organization business number as the customer-facing PayBill number and distinguishes customer-facing Till numbers from Head Office and Store numbers. The [PayBill guide](https://www.safaricom.co.ke/images/Downloads/Mpesa-paybill-guide.pdf) explains organization-assigned customer account identifiers. The [Business Till guide](https://www.safaricom.co.ke/images/Downloads/the-mpesa-business-till-guide.pdf) requests an account number for PayBill. The [Business Till booklet](https://www.safaricom.co.ke/images/Downloads/Resources_Downloads/M-PESA_BUSINESS_TILL_Booklet.pdf) includes the alphanumeric reference `jkl03`.

Implementation consequence: keep destination identifiers as strings and allow account-reference text. Do not apply Kenyan phone normalization to a Till, PayBill or account reference. Exact validation limits must come from the selected provider operation. A declared business name is not a verified recipient match.

Customer payment collection and NEXG settlement to a merchant are separate operations. Capturing a destination does not establish a working Daraja integration, verify ownership, confirm a transfer, or confirm a booking payment. Provider credentials, supported operations and confirmed responses remain necessary before those states can be shown.

## Existing payout contracts to reuse

The portal already represents these choices in [step-payout.tsx](../../../apps/web/components/onboarding/step-payout.tsx). Its existing draft fields are:

| Rail | Existing draft account keys |
| --- | --- |
| `mpesa_till` | `payout_account.till` |
| `mpesa_paybill` | `payout_account.paybill`, `payout_account.account` |
| `bank` | `payout_account.bank`, `branch`, `account`, `account_name` |

[20260101003600_merchant_onboarding.sql](../../../supabase/migrations/20260101003600_merchant_onboarding.sql) constrains the declared rail to these three choices. It explicitly separates applicant-entered `payout_account` from finance-owned `settlement_account`, which is written after verification. The existing settlement implementation routes merchant M-Pesa destinations to `mpesa_b2b` and bank destinations to `bank_eft`; these source definitions do not prove a production provider is configured.

The retained standalone editor currently offers generic `mobile_money` with a phone number, or bank. It does not yet match those Till/PayBill branches. Correct it through an explicit adapter to the existing contract during integration. Preserve an existing phone-based draft as unresolved legacy data; never reinterpret its phone number as a Till or PayBill. The generic Airtel/Other choices do not establish supported merchant payout rails and must not be offered as connected payout methods without an implemented contract. Keep supplied, pending verification, verified and rejected distinct.

## Existing booking engine

The active Merchant Workspace already contains:

- `apps/booking-engine/src/`: Payload Reserve runtime, allocation, pricing, management, specialist workflows and signed service-context authorization.
- `packages/booking-config`: the compiled category/question/model registry used by both booking configuration and the new onboarding/Home projection.
- `packages/booking-google`: optional calendar adapter.
- `apps/web/app/api/merchant/booking/[...path]/route.ts` and `apps/web/app/api/public/booking/[businessId]/[...path]/route.ts`: existing proxy boundaries.

[Booking implementation](../../booking-engine/IMPLEMENTATION.md), [operating boundaries](../../booking-engine/README.md) and [recorded verification](../../booking-engine/VERIFICATION.md) describe the native core and its completed local checks. They also leave production PostgreSQL/provider acceptance and complete production journeys across all 128 specialties open. Current booking payment handling records explicit manual evidence; it does not transfer money or verify M-Pesa/bank payments.

Reuse these owners and APIs for applicable Home setup. Keep activity configuration, offerings, resources, availability, booking commitments and payment state distinct. Do not introduce another booking engine, merchant identity or independent category registry during onboarding integration.

## Earlier backend/API analysis located

The original Documents chat titled `GitHub repo` contains the backend/API and security analysis. Its inspected backend checkout was `C:\Users\limta\Desktop\Derrick NexG`, repository `mukabwadm-ux/nexg`, at `599468d8cb32fc5940892cc057f32da606a04909`. That checkout's current HEAD still matches the recorded source. The active Merchant Workspace HEAD is `c92c02dd1d0f4ad36f09034293d52e8d6e1c6d8a`; it has separate local work. Do not copy or deploy either tree based solely on the shared repository history.

Saved analysis exists at:

- `C:\Users\limta\security-audit-skill\nexg\run-1\architecture.md`
- `C:\Users\limta\security-audit-skill\nexg\run-1\REPORT.md`
- `C:\Users\limta\security-audit-skill\nexg\run-1\NEEDS-VALIDATION.md`
- `C:\Users\limta\security-audit-skill\nexg\run-1\coverage-ledger.json`
- `C:\Users\limta\security-audit-skill\nexg\run-1\run-metadata.json`

The analysis maps `apps/api/app/v1`, web/admin server actions and Supabase clients, SQL/RLS/RPC/storage ownership, merchant API-key scopes, provider callbacks and Edge Function/outbox delivery. It is incomplete. The report, architecture and ledger snapshots have different coverage counts; do not present the historical report as a final audit. Local functional checks and source review do not establish deployed migrations, grants, credentials, callback configuration or production payment behavior.

## Integration order

1. Reconcile the active merchant contracts and the analyzed backend source, including merchant identity, scoped permissions, draft persistence, submit/review state and private uploads. Identify the actual deployment target before a production connection.
2. Align the Home payout editor with the existing Till/PayBill/bank declaration contract, preserve old drafts explicitly, and reuse finance-owned verification. Keep this out of startup registration.
3. Persist and reload the short registration and Home tasks through the existing owner services. Map applicable offerings/resources/availability into the existing booking APIs without duplicating their records.
4. Enforce pending-approval access on the server, with setup actions permitted and operational actions denied. Keep admin account approval, readiness, publication and accepting work separate.
5. Connect admin review and real provider operations in their planned phases. Complete email OTP last. Reuse prior verification evidence and run a test again only when the code it covers changes.

This pass inspected source, saved analysis and official Safaricom material. It changed documentation only. No runtime checks were repeated, services started, migrations applied, messages sent or payment operations attempted.
