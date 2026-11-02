# Phase 6 admin application review UI evidence

Date: 2 November 2026, Africa/Nairobi. Scope: Desktop MERCHANT WORKSPACE only.

The admin merchant tabs now link to `/merchants/applications`. The queue presents the bounded results from the current staff scope, including eligible cityless applications, with a review-state filter and cursor link. `/merchants/applications/[id]` displays the immutable submitted snapshot separately from the current saved facts. A decision is available only for the current submitted pending revision. The page states that application approval changes workspace access while publication and accepting work require separate activation.

The legacy `/merchants/[id]` route performs the narrow managed-application lookup before creating its legacy data client. Managed records redirect to the application review route. A failed lookup renders unavailable recovery before legacy document, financial or featured reads. The old `?tab=applications` entry redirects before loading the legacy directory.

The decision control allows one command at a time and has a 12-second deadline across the current Auth check, POST and response parsing. A deadline actively changes the visible result to unknown and retains the original command and operation ID for explicit retry. A late Auth result cannot start a POST. A late response cannot confirm or replace the result of a newer retry. Commands are never retried automatically. Conflict responses require reload; denied responses close the actor boundary without waiting for their body to parse. Error messages do not render backend exception text.

The actor boundary starts with private facts hidden. It verifies the requested non-anonymous actor before rendering them, closes on sign-out, an account switch, a null initial session, denied review access, a restored browser page, or failed verification, and bounds its initial verification at 10 seconds. Its ready state is bound to the requested actor ID. Late verification cannot reopen an ended view.

Commands run from `C:\Users\limta\Desktop\MERCHANT WORKSPACE\apps\admin`:

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.application-review.config.ts components/merchants/application-review-controls.test.tsx components/merchants/application-review-view.test.tsx app/merchants/applications/application-review-pages.test.tsx
node node_modules/typescript/bin/tsc --noEmit --project tsconfig.application-review-ui.json
```

Results: 3 test files passed, 15 tests passed. TypeScript exited 0. The controls and actor suite renders and interacts with the real React components in jsdom. It covers authentication and body parsing deadlines, same-operation retry, discarded late results, one command in flight, revision conflict, malformed confirmation, required changes reason, sign-out, actor switch, null initial session, initial verification deadline, and immediate closure on a 401 response. The server-rendering checks cover exact snapshot/current facts, stale review prevention, distinct activation, cityless scoped queue entries, pagination, empty versus unavailable source states, and managed redirects before legacy reads.

The first collection attempt found missing local admin dependency junctions. After the backend agent restored the existing workspace/package junctions without downloading or installing dependencies, the commands above passed. TypeScript also caught an optional queue-query type lookup in the new queue page; the page now uses the explicit shared query type.

These checks use controlled Auth and transport responses and do not start an application server. They do not claim configured live Auth, deployed migration, browser cache or real staff grant acceptance. No service, account, provider, secret, database deployment or legacy publication operation was changed by this UI verification.
