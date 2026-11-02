# Merchant email designs

34 proposed merchant emails in NEXG's gold, cream and charcoal palette, with the existing NEXG wordmark and bundled Manrope typeface. Each email has a desktop PNG, a phone PNG and editable HTML. All business names, people, codes, amounts and references are sample data.

Download [the complete design pack](nexg-merchant-email-designs.zip), or open [the gallery](index.html) to browse by category. [The overview image](boards/00-overview.png) shows six examples. Complete email images are in `images/`; phone images are in `mobile/`; category sheets are in `boards/`.

## OTP requirement

The initial sign-up email welcomes the merchant and delivers the six-digit verification OTP in the same message. It says **Expires in 30 minutes**, includes a private-code warning and instructions to enter the code on the sign-up page. After verification, a separate setup email guides the merchant through the next steps. The sign-in OTP also expires in 30 minutes. The sample codes do not authenticate an account. Both OTP browser previews include a working Copy code button with a Copied confirmation and an honest manual-copy fallback.

This is a visual design task. No auth settings were changed. The local `supabase/config.toml` currently uses `auth.email.otp_expiry = 3600`; implementing the requested expiry requires `1800` seconds in the active email auth configuration. The current merchant sign-in UI uses email/password. These pictures do not implement passwordless email OTP. Merchant phone verification is a separate SMS flow.

## Coverage

| Area                        | Designs                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access and security         | 01 Email verification OTP; 02 Sign-in OTP; 03 Password reset; 04 Password changed; 05 New sign-in; 06 Confirm email change; 30 Email changed                                                |
| Onboarding and verification | 07 Finish setting up (after email verification); 08 Application received; 09 Documents need attention; 10 Business approved; 11 Application not approved; 12 Document expiring; 31 Business live; 32 Document approved |
| Orders and bookings         | 13 New confirmed order; 14 Booking confirmed; 15 Cancellation; 16 New customer message; 29 Booking updated                                                                                  |
| Money                       | 17 Customer payment confirmed; 18 Payout initiated; 19 Payout failed; 20 Refund processed; 21 Statement ready; 22 Payout details changed; 33 Payout completed                               |
| Team and account            | 23 Team invitation; 24 Access changed; 25 Business restricted; 26 Access restored                                                                                                           |
| Support                     | 27 Request received; 28 Request resolved; 34 Support reply                                                                                                                                  |

The cancellation and restriction designs are template families. Production variants must name the actual record type, status, reason and supported next action. A paused business, a suspension and a delisting are distinct events even when they share a visual layout. Category-specific document and booking details must follow the merchant's configuration.

## Delivery handoff

These files do not send emails or change the merchant application. OTP Copy code buttons work in the browser previews; navigation actions remain inactive. Every email design starts with the NEXG brand header. Sender, recipient and subject belong to the email client's envelope view and provider metadata, so the designs do not repeat that block inside the email. Subject and preheader copy remain in `catalogue.json` for implementation. `info@nexgapp.com` comes from the repository's existing support fallback; production sender names, domains and routing still need to be resolved for each message family.

The Copy code interaction uses browser JavaScript for preview testing. It is not a deployable HTML-email capability; copying in a delivered message depends on the email client, and sendable templates need a client-compatible approach.

The editable layouts use browser CSS for visual review. They are not deployable email templates. Implementation needs email-client-compatible HTML, plain-text alternatives, actual token/URL binding, recipient authorization, preference handling, authoritative event triggers and deduplication. Email previews have not been tested in Gmail, Outlook or other inbox clients.

- Ordinary orders and available bookings confirm automatically. Work emails link to preparation or booking details and do not add an Accept/Reject step.
- Account creation, document approval, business approval and business publication are separate states.
- Customer payment, merchant entitlement, settlement, payout initiation and provider-confirmed payout completion are separate facts. Provider refund processing does not prove customer bank or wallet posting.
- Customer message bodies, verification evidence and full bank details stay outside the email. Money emails require explicitly authorized recipients.
- Routine work email should follow operator preferences; portal/push delivery remains appropriate for live operations. Mandatory security and account notices require an approved delivery policy. The catalogue describes proposed recipients, not a shipped default matrix.
- Recovery links, invitations, email-change confirmations and session-review actions must follow the implemented auth service. The email-change design represents a family; final old-address and new-address variants must follow their actual token bindings.
- Business-live and business-status event families exist in the notification registry. Existing order email registry entries for guests are not evidence of merchant work email delivery.
- Support received and resolved have existing plain-text templates. A support conversation CTA must link only to an implemented, permission-checked request view.

## Design brief

Create clear merchant transactional email mockups with NEXG's existing wordmark, Manrope, cream `#f6f3ec`, charcoal `#141414`, white cards and restrained gold `#d4a72c`. Start each email with the NEXG brand header, followed by one prominent title, readable body copy, one clear action where needed and a support footer. Keep the simulated inbox sender, recipient and subject block out of the email layout. The first sign-up email welcomes the merchant and includes a six-digit OTP with a 30-minute expiry. Financial messages emphasize the amount and exact provider status. Warning colors support the written status. Avoid customer message contents, full account numbers, invented review/payment deadlines and unsupported promises. All previews use fictional data.

The designs were rendered with HTML/CSS in local Chromium. Neither the built-in AI image generator nor the image API fallback was used. The cropped wordmark is derived from `apps/web/public/brand/nexg-logo.png`; the original brand asset was preserved. Manrope's license is in `assets/Manrope-OFL.txt`.

## Files and reproduction

- `catalogue.json`: copy, trigger descriptions, delivery proposals and implementation notes.
- `email.css` and `render-emails.cjs`: editable visual source and renderer.
- `emails/`: one complete HTML preview per design.
- `images/` and `mobile/`: complete desktop and phone PNGs at 2× pixel density.
- `boards/`: overview and category contact sheets.
- `thumbnails/`: lightweight copies for the gallery.
- `index.html`: gallery with working category filters.
- `verification.json`: actual rendering checks and their scope.

From the repository root, run:

```powershell
node docs/merchant-portal-plan/email-concept/render-emails.cjs
```

To refresh just the two OTP image sets while preserving previous results for the other designs, run `node docs/merchant-portal-plan/email-concept/render-emails.cjs --only=01-email-verification-otp,02-sign-in-otp`. A targeted render requires a complete previous verification report.

The renderer checks every design at 760px and 390px: no horizontal page overflow, no overflowing key text, loaded logo assets and loaded Manrope. It also checks gallery filtering and phone/desktop page width. This establishes local visual rendering only, not delivery, auth behavior, financial correctness, screen-reader certification or email-client compatibility.

## Source references

- [Design direction](../../../DESIGN.md) and [brand tokens](../../../packages/ui/src/tokens.css).
- [Auth configuration](../../../supabase/config.toml), [auth panel](../../../apps/web/components/auth/auth-panel.tsx), [password recovery](../../../apps/web/components/auth/password-recovery.tsx).
- [Existing support sender and templates](../../../apps/web/lib/email.ts).
- [Automatic order confirmation](../order-confirmation.md), [Money screen contract](../screens/05-money.md), [Settings contract](../screens/08-settings.md), [integration authority](../integrations.md).
- [Notification registry](../../../supabase/migrations/20260101022500_one_notification_system.sql).
