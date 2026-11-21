# App emails (NEXG and NEXG Stays)

Customer emails for the phone apps, sent by the backend when the event happens, through the email system the site and portals already use: `fn_notify_enqueue` → `notification_outbox` → `notify-dispatch` → Resend, with the sender and an on/off switch per group in **Admin > Settings > Email routing**. Everything is built **off**.

## Where things are

| What                                  | Where                                                                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The designs (source of truth)         | Consumer app repo `langs4u/nexg-app`, `docs/email-templates/` (gallery `index.html`)                                                                                               |
| Copies the database sends             | `supabase/app-emails/templates/<id>.html` and `.txt`, `catalog.json` (subject, group, required, choice, sample)                                                                    |
| Supabase Auth versions (Go templates) | `supabase/templates/app/`                                                                                                                                                          |
| The system                            | `supabase/migrations/20270128000200_app_emails.sql` (schema `app_email`)                                                                                                           |
| The sender of every group             | `supabase/migrations/20270128000400_app_email_sender.sql`                                                                                                                          |
| The stored templates                  | the newest `supabase/migrations/*_app_email_templates.sql`, generated                                                                                                              |
| The wordmark pictures                 | `apps/web/public/email/app/` (served at `https://www.nexgapp.com/email/app/` once the website deploys)                                                                             |
| The page behind the Open NEXG button  | `apps/web/public/app-code.html`, served at `https://www.nexgapp.com/app/code` by a rewrite in `apps/web/next.config.mjs`; keep it the same as `docs/email-templates/app-code.html` |
| Tests                                 | `supabase/tests/99_app_emails.sql`, `supabase/functions/notify-dispatch/email.test.ts`                                                                                             |

## Keeping the design and the database in step

Change an email in the Consumer app's `docs/email-templates/` (`emails.mjs`, then `node docs/email-templates/build.mjs`). Then, here:

```bash
node scripts/app-emails/sync.mjs "<path to NEXG APP>/docs/email-templates" --migration
```

This refreshes the copies and writes a new migration that upserts the templates. Check the new id is free on every branch before pushing. `email.test.ts` fails when `supabase/app-emails/` and the newest `*_app_email_templates.sql` disagree, so a copy can't drift silently. Migrations already on main are never edited.

## Preview without sending

In the SQL editor (local or, with the owner's yes, live):

```sql
select * from app_email.preview('11-order-placed');                          -- the sample
select * from app_email.preview('12-order-cancelled', '{"first_name":"Wanjiru"}'); -- your own values
```

Staff with Settings access can call `rpc_app_email_preview(p_key, p_vars)`. Nothing is queued.

## Turning it on (the owner)

1. **Sender.** Every app group sends from **NEXG Concierge <no-reply@nexgapp.com>**, and replies go to `info@nexgapp.com` (owner, 20 Nov 2026; change it per group in Email routing). In Resend, confirm the domain `nexgapp.com` is verified. `notify-dispatch` needs `RESEND_API_KEY` and `EMAIL_FROM` set as function secrets, and the Vault pair `notify_dispatch_url` / `notify_dispatch_secret`, as for the emails that already go out.
2. **Deploy** the migrations, the `notify-dispatch` function (it now sends the HTML part) and the website (for the wordmark pictures and the `/app/code` page).
3. **One test send to your own address:** switch on one group, for example **App emails: help**, then send a help request from the app signed in with your own email. Check `select * from app_email.sent order by created_at desc` and `notification_log`.
4. **Switch on** the groups you want in Admin > Settings > Email routing: `App emails: orders`, `bookings`, `stays`, `help`, `your data`. While a group is on, its email replaces the plain receipt and order bell emails it covers, so the customer gets one email.

## Supabase Auth emails (settings only; nothing here changes them)

**Deploy the website before pasting these templates.** The confirm-email (01) and code (02) emails have an **Open NEXG** button under the code. It opens `https://www.nexgapp.com/app/code#type=…&email=…&code=…`. That page hands the code to the app (`nexg://account/code?…`), which fills it in. Without the app, the page shows the code to type in, with a link to get NEXG. Everything is after the `#`, so it never reaches a server. Until the website with that page is live, the button leads to a page that doesn't exist.

Supabase Auth sends confirm, code, reset and change emails itself. They are project-wide: **the same template serves the website, merchant, host and rider sign-ins**, so replacing one changes theirs too. Today `config.toml` points `magic_link` and `email_change` at `templates/otp-code.html` and `recovery` at `templates/password-recovery.html` (which also carries the merchant, host and rider welcomes). Check the live dashboard before replacing anything.

In the Supabase dashboard, **Authentication > Emails**:

| Email                  | Dashboard template                                       | Subject                                       | Body file                                                                                                                                  |
| ---------------------- | -------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 01 Confirm your email  | Confirm signup                                           | `{{ .Token }} is your NEXG verification code` | `supabase/templates/app/confirm-signup.html`                                                                                               |
| 02 Sign-in code        | Magic link                                               | `{{ .Token }} is your NEXG verification code` | `supabase/templates/app/magic-link.html`                                                                                                   |
| 04 Reset password      | Reset password                                           | Reset your NEXG password                      | `supabase/templates/app/reset-password.html` (only once the welcome branches in `password-recovery.html` have a new home: shared-services) |
| 06 Confirm a new email | Change email address                                     | `{{ .Token }} is your NEXG verification code` | `supabase/templates/app/email-change.html`                                                                                                 |
| 05 Password changed    | Security notifications > Password changed (turn on)      | Your NEXG password was changed                | `supabase/templates/app/password-changed.html`                                                                                             |
| 07 Email changed       | Security notifications > Email address changed (turn on) | Your NEXG email was changed                   | `supabase/templates/app/email-changed.html`                                                                                                |

Also in Authentication:

- **SMTP** (Settings > SMTP): host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key the owner types in, sender `no-reply@nexgapp.com`, name `NEXG Concierge` (set by the owner, 20 Nov 2026). Without it Supabase's own mailer sends, with low limits.
- **Email OTP length** 6 and **expiry** 600 seconds (the emails say "10 minutes"; `config.toml` already has `otp_length = 6`, `otp_expiry = 600`).
- **Redirect URLs** (URL Configuration): add the app's return link, `nexg://auth/confirm` (and the Stays scheme), for when the app can take a one-tap link. Since 21 Nov 2026 the code emails (01, 02, 06) carry no one-tap button, only the code, because the link opened the website instead of the app. The code is also in the subject, so a phone offers it to copy. `config.toml` uses the same subject for `magic_link` and `email_change`, which serve every sign-in.
- **Secure email change** is on (`double_confirm_changes`), so 06 goes to both the old and the new address.

## Guests

A guest is an anonymous session with no email, so a guest's order or booking email is logged in `app_email.sent` as "A guest without an email" and not sent. When Paystack checkout collects an email, pass it as `p_email` to `app_email.send` (it takes an explicit address ahead of the account's). Stay requests and help requests carry their own email and reach guests today.

## Next to the house design (Admin > Settings > Notifications & templates)

Since 20 Nov 2026 `notify-dispatch` draws every email in NexG's house design from its plain text (`email-design.ts`), or in a design uploaded for its purpose. The app emails are the one exception: they arrive with their own HTML, made from the designs the owner chose for the phone apps, and `notify-dispatch` sends that HTML as it is. `EMAIL_HTML=off` still sends every email, these included, as plain text only.

The app emails are not yet listed as purposes in `packages/contracts/src/email-design.ts`, so they don't show in Notifications & templates and can't be given an uploaded design there. **Owner decision, 20 Nov 2026: customer emails from the apps use the app designs** ("lets use the app design"). Keep the HTML these emails carry; don't replace it with the house design. Listing them in Notifications & templates (as `app_%` purposes) would be a later change.
