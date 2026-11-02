# Settings concept gallery

Date: 1 November 2026. Eight illustrative concepts generated with the built-in image-generation tool after the screen plan and UX review. All data is fictional. The [written design](screen-design.md) governs scope, interaction, supported operations and recovery; images do not prove live functionality.

The [exact briefs](image-prompts.json) and [image manifest](image-manifest.json) record generation method, original files, assumptions, dimensions, checksums and visual review. Seven desktop concepts are 1536 × 1024; the mobile concept is 1024 × 1536. Final files are saved in this project.

## Account & security

Personal scope stays explicit despite the selected business/location. Sign-in, enrollment, sessions and activity have specific states rather than a whole-account security score. Business identity links to Business. Identity operations are proposed capabilities requiring the identity owner's actual support.

![Account and security concept](<C:/Users/limta/Documents/ChatGPT/NEXG MERCHANT PORTA/docs/merchant-portal-plan/settings-concept/01-account-security.png>)

## Notifications for appointments and retail

One mixed merchant gets relevant activity groups inside a familiar section. Channel preference, verified destination and quiet hours are distinct concepts. The fixture has permission to discover Business routing. Event/channel choices and quiet hours are one atomic personal-notification preference bundle; destination verification is a separate operation. Unsaved changes are explicitly personal.

![Mixed merchant notification preferences](<C:/Users/limta/Documents/ChatGPT/NEXG MERCHANT PORTA/docs/merchant-portal-plan/settings-concept/02-hybrid-notifications.png>)

## Connection recovery and data ownership

A read-only external fleet catalogue has expired access. The page names the paused function and last confirmation while NEXG booking/availability ownership remains visible. Reconnect is scoped to that instance; the picture makes no general promise that booking capacity is available.

![Scoped connection recovery](<C:/Users/limta/Documents/ChatGPT/NEXG MERCHANT PORTA/docs/merchant-portal-plan/settings-concept/03-connection-recovery.png>)

## Mobile Preferences

The Settings section selector navigates. Form controls edit personal display preferences. Kenya time is informational and fixed; there is no timezone picker. The draft Save region stays separate from the opening-hours link to Availability.

![Mobile display preferences with fixed Kenya time](<C:/Users/limta/Documents/ChatGPT/NEXG MERCHANT PORTA/docs/merchant-portal-plan/settings-concept/04-mobile-preferences.png>)

## Desktop Preferences

Personal language and formatting controls have a readable preview. Kenya time remains fixed and informational. Display density and reduced motion are fictional supported preference options; changing these does not alter appointments or business hours. The form shows a personal draft and explicit Save/Cancel.

![Desktop Preferences](<C:/Users/limta/Documents/ChatGPT/NEXG MERCHANT PORTA/docs/merchant-portal-plan/settings-concept/05-desktop-preferences.png>)

## API & webhooks

Business scope is explicit. The Kilimani inventory-read credential and Kilimani order-event subscription have separate grants; neither implies broader write authority. Signing verification and the latest failed delivery are separate facts. Retrying delivery resends an event and does not repeat an order. No credential secret is displayed. The developer capabilities are fictional supported fixtures pending actual owner implementation.

![API and webhooks](<C:/Users/limta/Documents/ChatGPT/NEXG MERCHANT PORTA/docs/merchant-portal-plan/settings-concept/06-api-webhooks.png>)

## Data & privacy

The current personal export request is at Review before submission. Its scope, activity period, included record types and excluded business/customer data are visible. One separate historical request is Completed. Account-closure review is distinct from the current request and makes no instant-erasure, retention or response-time promise.

![Data and privacy request review](<C:/Users/limta/Documents/ChatGPT/NEXG MERCHANT PORTA/docs/merchant-portal-plan/settings-concept/07-data-privacy.png>)

## Notifications: Business routing

The user-requested view preserves the supplied Notifications reference and selects Business routing in its Scope panel. Routing is explicitly limited to Kilimani. Supported appointment and product-order events have recipient-group selectors and channel choices. Personal preferences stay separate. Team membership remains in Business, and routing does not grant access. The picture shows a draft with Save routing, not live message delivery or a changed policy.

![Business notification routing](<C:/Users/limta/Documents/ChatGPT/NEXG MERCHANT PORTA/docs/merchant-portal-plan/settings-concept/08-notifications-business-routing.png>)

## Review observations and limits

All eight images retain the intended section/scope and Sample preview label. Desktop selects Settings. The mobile form preserves readable controls, explicit EAT and a visible Save region. The connection image uses the intended three-column authority table despite a minor wording inconsistency in its original brief. The API image was corrected once to add its explicit business-scope badge and remove an unintended real-time delivery claim.

The notification pictures use the local Scope column shown in the user's reference. The written plan also allows a compact Your notifications / Business routing view choice to preserve width. Session branch descriptions in the first picture must be omitted unless the identity source actually supplies that workspace context; they must never imply inferred device geography. Subtitle wording, avatar initials and icon choices vary slightly across scenes and are illustrative.

These pictures cover representative visual states. Credential creation/rotation/revocation steps, business-data and closure requests, setup/import mapping, unknown outcomes and access removal are fully specified in the written plan and review journeys. They are not independently pictured here. Text contrast, target sizes, keyboard/focus behavior, assistive technology, server authorization, source synchronization and message delivery still need implementation testing. Static category coverage establishes design mapping only.
