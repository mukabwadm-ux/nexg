# Settings frontend implementation

Date: 1 November 2026. Scope: Settings only. The existing merchant portal outside Settings keeps its current routes, shell and behavior.

The six-section frontend implements the supplied Settings artboards in the existing Next.js app. Account/security, separate personal notifications and business routing, preferences, connections with mapping and setup, scoped API/webhook management and personal data-request review share responsive controls and focus-managed dialogs.

## Entry points

- /merchant/settings: authenticated Settings. Reads identity through the authenticated Supabase user and existing merchant RLS view. Existing business notification routing uses the existing RPC-backed editor. Personal display preferences are explicitly stored on this device for that user.
- /merchant-preview/settings: clearly labelled synthetic sample workspace, available without database setup. The same screen components demonstrate complete frontend interactions, with sample state persisted in this browser. No usable API keys, real messages, provider authorization or deletion is produced.
- Sections use ?section=account, notifications, preferences, connections, api or privacy. Business routing uses ?section=notifications&scope=business. Reload and browser navigation preserve route context; dirty forms require an explicit discard.

The Settings-specific shell follows the artboards, including nine named navigation links that resolve to existing portal destinations. A pathname boundary leaves every non-Settings merchant page on its prior shell. Public shopping/location/consent overlays are suppressed only on the two Settings entry points.

## Service boundaries

Personal identity, factors and sessions; per-user notification delivery; connectors; developer access and data requests need their actual owners before live activation. Authenticated screens show honest unavailable states for those services. The frontend does not substitute sample data into a live account. No database migrations or permissions are introduced.

The sample store holds synthetic records and safe display configuration only. API credential creation produces labels, never secrets. Webhook destinations are validated but never called. Data requests remain submitted until their owner acts; a sample CSV is an explicit local fixture. Closing an account records a sample request and never erases history. Personal alert and business-routing records are separate. Kenya time stays fixed to Africa/Nairobi with no timezone picker.

## Verification sequence

Per the user instruction, the complete frontend was implemented before verification began. The final batch covers formatting, type checking, targeted lint, production compilation and desktop/mobile interaction journeys. See the final verification record for actual outcomes and limits.

Run the focused browser suite with: pnpm exec playwright test --config playwright.settings.config.ts

21st catalogue search was attempted but required a sign-in. Implementation reuses the existing NEXG Button, tokens, Manrope font and installed Radix Dialog, without adding a remote component or changing dependencies.
