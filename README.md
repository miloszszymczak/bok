# bok

Mobile-first PWA for managing a home library — and, over time, a reading community.
See [docs/PLAN.md](docs/PLAN.md) for the full feature plan.

## Layout

| Path | What |
|---|---|
| `apps/web` | SvelteKit 3 app: UI, form actions, JSON API (`/api/v1`), service worker |
| `apps/worker` | pg-boss jobs (cover mirroring, cron) + migration entrypoint, bundled with esbuild |
| `packages/core` | ISBN/ISSN parsing, UUIDv7, text folding — runs in Node and the browser |
| `packages/db` | Drizzle schema + SQL migrations + advisory-locked migrator |
| `packages/metadata` | Book metadata providers (BN, Open Library, Google Books, ISBNdb, Crossref) and merging |
| `packages/server` | Shared services: Valkey, R2, Resend, pg-boss, catalogue, accounts, metrics |
| `deploy/` | Kustomize base + `prod` overlay (no Ingress — bring your own IngressRoute to `svc/bok-web:80`) |

## Local development

Requires Node ≥ 24 and Docker (Colima works).

```bash
npm install
./scripts/dev-services.sh      # Postgres 18 + Valkey in Docker
cp .env.example .env           # then fill in R2 / Resend keys
npm run db:migrate
npm run dev                    # web on http://localhost:5173
npm run dev:worker             # background jobs (covers)
```

Checks:

| Command | What |
|---|---|
| `npm run check` | Types (svelte-check + tsc) |
| `npm test` | Unit tests |
| `npm run test:db` | Integration tests against `bok_test` (local Postgres) |
| `npm run test:e2e` | End-to-end: scanner with a fake camera (native + WASM decoders), manual add, shelves/designer/inventory/sharing. Needs `npm run dev`; set `CHROME` to a Chromium binary if Playwright's isn't installed, `DATABASE_URL` to also test metadata edits |

Lighthouse (run against a production build, e.g. `PORT=3999 node --env-file=.env apps/web/build/index.js`):

```bash
CHROME_PATH=/path/to/chrome npx lighthouse http://localhost:3999/l/<slug> --form-factor=mobile --only-categories=performance,accessibility
```

Scanner debugging: open `/scan?debug` to see the decoder engine and timing; `localStorage['scanner-engine'] = 'zxing'` forces the WASM decoder.

## Release & deploy

```bash
./scripts/release.sh           # patch bump → check → build linux/amd64 → push git.mwsz.org/milek/bok:<ver>
kubectl apply -k deploy/overlays/prod
```

Before the first deploy:

1. `cp deploy/overlays/prod/secrets.env.example deploy/overlays/prod/secrets.env` and fill it in (already done locally — set `DATABASE_URL`).
2. Set `VALKEY_URL` (or `VALKEY_CLUSTER_NODES`) in `deploy/overlays/prod/config.env`.
3. Create the pull secret for the Forgejo registry:
   `kubectl -n bok create secret docker-registry bok-registry --docker-server=git.mwsz.org --docker-username=milek --docker-password=<token>`
4. Postgres extensions `pg_trgm`, `unaccent`, `citext` must exist in the database.
5. Route `bok.mwsz.org` → `svc/bok-web` port 80. Keep `/metrics` internal or set `METRICS_TOKEN`.
   Server-sent events (`/api/v1/events`) need an unbuffered route — Traefik's default is fine; don't add a buffering middleware.
   adapter-node derives the origin from `X-Forwarded-Proto`/`X-Forwarded-Host` (configured in `config.env`); form posts fail with 403 if those don't match the public URL.

Building on an Apple Silicon Mac for an amd64 cluster needs amd64 emulation in the Docker VM
(e.g. `colima start --vm-type vz --vz-rosetta`). Use `PLATFORMS=linux/arm64` for arm64 nodes.
