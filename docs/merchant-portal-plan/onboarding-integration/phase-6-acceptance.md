# Phase 6 admin review and local acceptance

2 November 2026, Africa/Nairobi. Status: focused code checks and the isolated local migration chain pass; a real browser submission and staff review remain open. This continues the saved merchant journey in Desktop MERCHANT WORKSPACE. A disposable local Supabase stack and the Merchant Workspace web app are running for local acceptance; no cloud project or production data was changed.

## What now connects

The existing admin merchant area has an Applications view for the new cityless short registrations. It uses bounded staff-only queue and detail reads, shows the immutable submitted snapshot beside any newer current application, and gives an eligible reviewer explicit Approve, Request changes and Reject actions. The command uses the existing revision-bound application review RPC. It does not invoke the legacy Take live publication action.

The reviewer must have a current global merchant operations/super-admin grant to inspect unassigned cityless applications. Existing matching-city grants continue to scope applications assigned to their city. The queue/detail reads use the current Auth session and staff grant in Postgres. A page actor binding also prevents a command prepared by one signed-in staff member from being submitted after the browser switches accounts. The database rechecks actual session, grant, review state and revision at command execution.

The review form permits one decision at a time. Changes/rejection require a reason. A timeout remains an unknown outcome under the same operation ID and can be retried explicitly; it never sends a second decision automatically. Revision conflicts require a reload. Expired, switched or denied sessions close the private actor view. Errors display safe messages.

After a changes request, the merchant sees the reviewer’s feedback attached to the submitted revision. If they save one correction before resubmitting, the remaining feedback stays visible while the earlier submission is still the review reference. Resubmission clears the old feedback. Approval unlocks only the approved workspace access represented by the existing policy; activation, publication, customer visibility and accepting work remain separate.

The legacy `/merchants/[id]` page performs a narrow managed-application lookup before it can read legacy financial, documents or featured information. Managed applications are routed to the new review view; lookup failures fail closed. Legacy merchant work and publication remain separate.

## Local evidence

| Boundary | Result |
| --- | --- |
| Reviewer reads and Postgres authorization | 18 focused reader cases and one actual-SQL integration scenario. The SQL scenario exercised scoped/global staff grants, cityless pagination, snapshot/current distinction, edited/stale revisions, rejection, approval/access, unchanged publication, operation replay and file-backed database reopening. Final SQL scenario passed after isolating fixture owners within the production command quota. |
| HTTP command boundary | 28 focused cases passed: verified actor binding, same-origin/body validation, Auth/session, allowed decisions/reasons, stable operation identity, stale/revoked denial, bounded errors and unknown outcomes. |
| Admin UI and legacy redirect | 15 UI/SSR cases passed, including timeout of Auth/fetch/JSON with explicit retry, late-result fencing, actor switch/sign-out/null session, queue/detail truth and fail-closed routing. Scoped admin UI TypeScript exited 0. |
| Root admin middleware | Six focused tests passed for private/no-store responses, Auth refresh cookie preservation, API session errors, bounded Auth lookup and idle-timeout clearing. |
| Phase 5 merchant feedback | Two affected-source cases and the connected Home/actual SQL rendered journey were rerun after the feedback display change. The final code preserves bounded feedback through an unsent edit and displays it as text. See [Phase 5 acceptance](phase-5-acceptance.md). |
| Current migration/settings compatibility | A disposable Supabase project applied the full source migration and seed chain, including `20261102000100` through `20261102000400`. The live local database has one application registry, all seven application tables, and active 24-hour absolute / 8-hour idle session settings through the platform settings view. Migration `20261102000400_merchant_anonymous_intake` is recorded locally; no cloud migration ran. |
| Current focused SQL/Home checks | The application SQL harness passed 135 checks, including anonymous owner start/save/submit/read, payout/activity denial, admin approval, operational-data denial while anonymous, and same-identity account claim. The persisted Home journey passed after the settings fixture was aligned with the versioned platform settings contract. |
| Registration/API checks | The focused transport and entry suites passed 22 cases on the route/API correction: validated submission, anonymous intake, payout/activity denial, direct form entry and safe Home routing. The local SSR route returned HTTP 200 with the bootstrap state and without the old account gate. The isolated local database still contains zero merchant applications; the agent has not submitted one. |
| Merchant app availability | The local Merchant Workspace registration route is configured to create a restricted anonymous Auth session and render the existing short form. Local Auth and the local email inbox respond. The app uses only the local public URL/key and the local feature flag; no service-role key is in its environment. |
| Onboarding launcher | The ignored local Vite setting now points `Start real registration` at the isolated Merchant Workspace app on port 3002; the deployed platform origin remains configurable and unchanged. |
| Legacy entry routing | With the local V1 gate enabled, both `/merchants/apply` and `/merchants/apply/start` route to `/merchants/register`. The local base route preserved its `city` query and returned HTTP 307 to the existing short form. |

The earlier reviewer read/transport/UI evidence uses PGlite, production migration sources and synthetic staff/session records; it is contract evidence rather than a real browser review. The current local Supabase project is disposable and unlinked from cloud. Its real Auth/PostgREST-backed merchant submission and admin decision still need browser acceptance.

## Live boundary and later work

The local registration app is at port 3002 and uses an isolated Supabase project at ports 54321–54324. The user intends to submit their own local application before final browser acceptance; no application has been submitted by the agent. Anonymous intake is limited to the owner's application and restricted setup Home. Payout, admin review and operational records continue to require a non-anonymous, current account session. Creating an account upgrades the same Auth identity. Email OTP has not been implemented or changed, as requested. Local browser acceptance must confirm existing form → anonymous save/submit → pending Home and same-identity account claim. The admin portal is not yet running against a signed-in local staff reviewer. No migration has been applied remotely and no merchant was published or activated.

Phase 7 activation and supported source adapters, then the user-requested final email OTP connection and deferred business/person presentation review, remain. Vendor-neutral ERP groundwork does not claim an active Odoo, QuickBooks or other provider connection. Do not describe the full deployed merchant service as live until those remaining gates have been accepted in the existing target platform.
