# NexG

The NexG concierge platform: a public site where guests ask for what they need, and an admin
console where staff verify the riders and merchants who deliver it.

Nothing becomes publicly visible or dispatchable until an admin has verified the documents behind
it. That rule is enforced in the database, not the interface.

| Package           | What it is                                                                |
| ----------------- | ------------------------------------------------------------------------- |
| `apps/web`        | Public site — homepage, `/riders`, `/merchants` and the application flows |
| `apps/admin`      | Staff console — sign-in, rider and merchant pipelines, document review    |
| `packages/ui`     | Design system: tokens and shared components                               |
| `packages/db`     | Supabase migrations, generated types, seed data                           |
| `packages/config` | Shared ESLint, TypeScript and Tailwind configuration                      |
| `supabase/`       | Local Supabase project: `config.toml`, migrations, edge functions         |

The specification lives in [`docs/`](docs/) and governs everything here:

- [`NexG-Build-Prompt-01-Front-Door.md`](docs/NexG-Build-Prompt-01-Front-Door.md) — the master spec
- [`NexG-Front-Door-Build-Plan.md`](docs/NexG-Front-Door-Build-Plan.md) — milestones M0 to M7
- [`docs/design-refs/`](docs/design-refs/) — the signed-off artboards

## Status

**M1 — repository and design system.** The monorepo, the design tokens and all fifteen shared
components are in place, reviewable at [`/ui-kit`](http://localhost:3001/ui-kit). The database
(M2), homepage (M3), application flows (M4–M5) and admin review (M6) are not built yet, so both
apps currently show a placeholder at `/`.

## Prerequisites

| Tool           | Version                       | Why                                                   |
| -------------- | ----------------------------- | ----------------------------------------------------- |
| Node           | 22 LTS (see `.nvmrc`)         | Runtime. `nvm use` or `fnm use` picks it up.          |
| pnpm           | 11+ (`npm i -g pnpm`)         | Workspace package manager.                            |
| Docker Desktop | current                       | Runs local Postgres for Supabase. **Needed from M2.** |
| Supabase CLI   | current (`npm i -g supabase`) | Migrations and type generation. **Needed from M2.**   |

Neither Docker nor the Supabase CLI is required to work on M1.

> The M0 checklist in the build plan says Node 20. pnpm 11 refuses to run on anything
> below Node 22.13, so the repository pins Node 22 LTS instead.

## Local setup

```bash
git clone https://github.com/mukabwadm-ux/nexg.git
cd nexg

pnpm install            # install every workspace package
cp .env.example .env.local   # then fill in the values — see the table in .env.example

pnpm dev                # starts both apps
```

- Public site → <http://localhost:3000>
- Admin console → <http://localhost:3001>
- **UI kit** → <http://localhost:3001/ui-kit>

From M2 you will also need a local database running before `pnpm dev`:

```bash
supabase start          # local Postgres, Auth, Storage on :54321
pnpm db:reset           # apply migrations and seeds
```

## Scripts

Run from the repository root; each fans out across the workspace through Turborepo.

| Script              | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `pnpm dev`          | Both apps in watch mode                                      |
| `pnpm build`        | Production build of both apps                                |
| `pnpm lint`         | ESLint, warnings treated as errors                           |
| `pnpm typecheck`    | `tsc --noEmit` in every package                              |
| `pnpm test`         | Vitest unit tests                                            |
| `pnpm test:e2e`     | Playwright, at 390 px and desktop (needs `pnpm build` first) |
| `pnpm format`       | Prettier, writing changes                                    |
| `pnpm format:check` | Prettier, failing on changes — this is what CI runs          |

Target a single package with `--filter`:

```bash
pnpm --filter @nexg/ui test
pnpm --filter @nexg/admin dev
```

CI runs install → build → lint → typecheck → test → format check on every pull request, then
Playwright. All of it must be green before merging.

## Design system

Tokens are defined once, in [`packages/ui/src/tokens.css`](packages/ui/src/tokens.css), and reach
Tailwind through the preset in
[`packages/config/tailwind/preset.cjs`](packages/config/tailwind/preset.cjs).

Each colour is published twice: `--gold` carries the literal hex from the spec, and `--gold-rgb`
carries the same colour as RGB channels so Tailwind opacity modifiers (`bg-gold/40`) keep working.
**Change both or neither.** Use the Tailwind classes — `bg-bg`, `text-ink`, `border-border-strong`,
`text-gold-text` — rather than raw hex anywhere in app code.

Manrope is loaded per app with `next/font` and bound to `--font-manrope`, which the preset reads as
the `font-sans` stack.

### Adding a component

1. Create `packages/ui/src/components/<name>.tsx`. Start from the nearest existing component; they
   all follow the same shape.
2. Mark it `'use client'` if it uses state, effects or event handlers.
3. Build **every state**: default, loading, error, disabled and — where a component renders a
   collection — empty. A component with no error state is not finished.
4. Keyboard first. Every interactive element must be reachable by Tab, operable by Enter or Space,
   and show the focus ring from `globals.css`. Groups (like `ChipGroup`) are one tab stop with
   arrow-key navigation inside.
5. Size for a 390 px viewport. Touch targets are at least 44 px (`h-11`); text inputs use a 16 px
   base font so iOS does not zoom on focus.
6. Compose classes with `cn()` and express variants with `cva` — never build class strings by hand.
7. Export it from [`packages/ui/src/index.ts`](packages/ui/src/index.ts), types included.
8. Add it to [`apps/admin/app/ui-kit/page.tsx`](apps/admin/app/ui-kit/page.tsx) with a `<Section>`
   showing every state, and add its name to the list in `ui-kit/section.tsx`.
9. Write a test for the behaviour that matters — keyboard interaction, emitted values, disabled
   handling. Not the markup.

Never invent a number. Where a figure has no configured value the UI renders `[—]`
(`VALUE_PLACEHOLDER`), never a plausible-looking zero — see the `KpiTile` tests.

## Environment variables

Every variable is listed in [`.env.example`](.env.example) with its source. Copy it to `.env.local`
and fill in what you need; `.env.local` is gitignored.

`NEXT_PUBLIC_*` variables are compiled into the browser bundle — never put a secret behind that
prefix. `SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security and must only ever be read in
server code.

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org): `feat(ui): …`,
  `fix(admin): …`, `chore: …`. Keep them small; each one must leave CI green.
- **Branches** are `feat/…`, `fix/…` or `chore/…` off `main`, merged by pull request.
- **Copy** comes from the artboards. Headings, button labels and FAQ text are signed off — do not
  reword them.
