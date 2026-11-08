# bok — notes for Claude

- Plan and phase status: `docs/PLAN.md`. Work phase by phase.
- npm workspaces (no pnpm). Workspace packages are consumed as TypeScript source (`exports` → `src/*.ts`, explicit `.ts` import extensions).
- SvelteKit **3**: imports use `#lib/...` (subpath imports, not `$lib`), env vars are declared in `apps/web/src/env.ts` with `defineEnvVars` and read from `$app/env/private`; adapter/config live in `vite.config.ts` (no `svelte.config.js`); `.env` is at the repo root (`env.dir: '../..'`).
- i18n: Paraglide, messages in `apps/web/messages/{en,pl}.json` — every UI string goes through `m.*()` in both languages; avoid plural-sensitive phrasing (Polish plurals).
- Never construct services at import time in the web app — use `services()` from `#lib/server/services.ts` (lazy; `vite build` imports server code).
- better-auth sessions live in Valkey as well as Postgres: revoke via `auth.api.*`, never by deleting `session` rows.
- Schema changes: edit `packages/db/src/schema`, then `npm run db:generate` and commit the SQL in `packages/db/migrations`.
- Text mentions: `@user`, `#tag`, `$book`.
- Deploy: Kustomize in `deploy/`; the user writes the IngressRoute — don't add Ingress resources.
- adapter-node 6 ignores `ORIGIN`; request origin comes from headers (default protocol https). Local prod tests over http need `PROTOCOL_HEADER=x-forwarded-proto` + that header.
- Scanning: decode logic in `apps/web/src/lib/scanner` (filter is unit-tested), offline queue in `lib/client` (Dexie, one DB per user). Copy ids are generated on the device so retries are idempotent. Keep Dexie/zxing out of the main bundle (lazy imports only).
- Service worker caches `/`, `/scan`, `/library` (+ their `__data.json`) and all `/_app/immutable/*` on first use; sign-out wipes local data via `wipeLocalData()`.
- Storage: rooms (`locations`) → furniture (`containers`, layout JSON in cm) → `sections` (cells keyed by col/row; ids stay stable across layout edits). Layout maths lives in `@bok/core` `layout.ts` (shared by the designer and the server). Every storage row carries `household_id`; check membership through `shelves.assertMember` / the `owned()` helpers.
- E2E suites in `apps/web/e2e` (`npm run test:e2e`, needs `npm run dev` and `CHROME`): scanner (fake camera), manual add, shelves.
- Reading: `reading_states` (one status per user×work) + `reads` (each reading, rereads separate) + `reading_events` (timeline). Logic in `packages/server/src/reading.ts`; pure maths (estimate, pace, diary grouping, goal) in `@bok/core` `reading.ts`. The daily `reading-stuck` worker job applies the 30-day rule.
- Drizzle gotcha: in single-table queries column refs render unqualified, so correlated subqueries must spell out `"table"."column"` explicitly.
- Polish plurals: use `daysText()`-style helpers with `Intl.PluralRules` (`one/few/many` message variants) rather than "{n} dni".
