# Merchant email verification and Resend

The merchant onboarding email is an account identity, not proof of business approval. After the saved application is submitted, an anonymous applicant can verify that address and continue to Home under the same Auth user ID. A returning merchant can use an email code from the merchant sign-in option. Existing signed-in applicants continue directly to Home. Demo data remains separate.

Supabase Auth generates and verifies the codes, applies rate limits, and manages sessions. Resend delivers Auth emails over SMTP; the browser never receives the Resend key. The `email_change` code is requested again through the current anonymous user when the merchant resends: Auth's generic resend endpoint cannot find a user with no current email.

The full verification card is displayed while the initial request is in progress. If sending fails, the error and retry stay on that card; verification is disabled until the request succeeds.

## Local environment

The current local merchant Supabase instance is `nexg-merchant-onboarding-run-20261102`. Its Auth service uses `smtp.resend.com:587` with TLS, sender `NexG <info@nexgapp.com>`, six-digit codes, ten-minute expiry, and a one-minute minimum between requests. The email-change and magic-link templates both contain `{{ .Token }}` from `supabase/templates/otp-code.html`. Confirmation is required and secure email changes remain enabled.

The Resend key is kept in the gitignored `.env.resend.local`; it must not be copied into client variables or committed. `MERCHANT_EMAIL_OTP_ENABLED=true` in `apps/web/.env.local` enables the local screens. `scripts/configure-local-resend.ps1` records the current instance's original configuration before applying the local settings and restarts Supabase without deleting data volumes. This local instance uses a temporary Supabase working directory; if it is removed or the services are recreated, reapply the settings with access to the key rather than assuming they persist.

## Hosted deployment

Local configuration does not change a hosted Supabase project. For the actual target project, configure Resend as the Auth SMTP provider with its private API key and verified sender, enable email confirmations and manual identity linking, keep secure email changes enabled, and set the email-change and magic-link templates to display `{{ .Token }}`. Configure six-digit tokens, expiry and rate limits there, then enable `MERCHANT_EMAIL_OTP_ENABLED` in the web deployment. Use HTTPS for the deployed app and Auth endpoint.

Before enabling a hosted deployment, verify delivery and the complete application-to-Home journey using that project's own settings. A business email that already belongs to another account requires a safe account-linking/support process; this flow does not transfer ownership or silently create a second account. Email verification is separate from admin approval, business verification, and other setup permissions.
