# Adaptive Settings concept

Date: 1 November 2026. Status: proposed design for review. No application, live configuration, permissions or external connections are changed by this package.

Settings gives merchants a predictable place to manage their account, notification preferences, display preferences, permitted system connections, supported developer access and data requests. One shared structure serves all 21 categories and 128 baseline subcategories. The 21 previously approved additional offering/model routes remain distinct design extensions within the existing specialties.

The design applies the user-created [UX Decision Design skill](C:/Users/limta/.codex/skills/ux-decision-design/SKILL.md) and its [principles](C:/Users/limta/.codex/skills/ux-decision-design/references/principles.md). Principles explain decisions and guide validation; they do not establish usability or accessibility from pictures alone.

- [Complete screen and interaction design](screen-design.md)
- [Every category and subcategory](coverage.md) and [structured coverage](coverage.json)
- [Implementation dependencies, journeys and acceptance plan](validation-plan.md)
- [Concept gallery](images.md) and [exact image briefs](image-prompts.json)
- [Coverage verification](verification.json), reproducible with `node docs/merchant-portal-plan/settings-concept/verify-coverage.mjs` from the repository root

Business owns identity, activities, locations, team grants, documents and operational policy. Availability owns calendars, capacity and operating schedules. Money owns financial account and payout operations. Settings links to these owners with context and does not maintain a second set of values.

This package extends [SC_SETTINGS](../screens/08-settings.md), retaining SE01–SE24 and the [shared screen contract](../screen-contract.md). It preserves the effective offering/workflow reconciliation and approved activity additions. Actual configured activities, supported source operations, actor grants and current state determine applicable controls. A category label does not activate a capability or a connection.

The current merchant application has a much smaller Settings flow. The proposed account, connection, developer and data-request journeys require named owners and contracts before implementation. The platform staff Settings registry is separate and does not supply merchant-editable fee, dispatch or retention controls.

All concept data, names and connections are fictional review fixtures. Images communicate visual intent. The written scope, operation states, ownership and dependencies govern the proposal.
