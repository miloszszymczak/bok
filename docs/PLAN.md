# bok — Development Plan

Personal library management PWA, mobile-first, growing into a public reading community.
Working name: **bok** (rename any time).

---

## 0. Decisions so far

| Topic | Decision |
|---|---|
| Audience | Public product, grown organically |
| Infra | Your Kubernetes cluster; existing CNPG Postgres + Valkey cluster; **Cloudflare R2 is needed** (see §1.4). IngressRoute is left to you. |
| Offline | Local-first scan queue; owned library cached on device |
| Languages | PL + EN |
| Data model | Work → Edition (ISBN) → Copy (physical) |
| Books without ISBN | Manual entry + cover photo |
| Households | Shared library across several accounts |
| Shelf designer | Grid per bookcase, resizable sections; generic "container" model for future furniture |
| Position on shelf | Not tracked — only *which section* |
| Statuses | want to read · reading · stuck (auto after 30 days without progress **or** manual) · read · did not finish |
| Rereads | Multiple reads per book |
| Rating | 0–10 integers (shown as 5 stars with halves); empty = unrated |
| Reading time | Calendar days from events, overridable; pace (intensive / usual / slow) separate |
| Formats | Paper / ebook / audiobook per read (pages / % / minutes) |
| Follow vs friends | Independent: follow is one-way and instant; friends is a mutual request. Being friends does **not** mean following. |
| Private profiles | Not in v1 |
| Posts | Likes, one comment level, no images in v1 |
| Mentions in posts | `@` users · `#` tags · `$` books (autocomplete) |
| Readlists | Manual order, owner-only editing in v1 |
| Lending | To users and to non-users (contact name); "lendable" flag per copy; borrow requests |
| Notifications | In-app inbox + web push + email |
| Extras accepted | Bookstore mode, Goodreads (+ lubimyczytac) import, inventory mode, duplicate warning, series + tags (no genres), year in review + yearly goal, home feed, spoiler tags, block/report, link previews |

### Settled infrastructure

| Item | Decision |
|---|---|
| Email | Resend, sender domain `bok.mwsz.org` |
| App domain | `bok.mwsz.org`; media from R2 bucket `bok-img`, served through the app at `/media/*` until a custom R2 domain is set (`R2_PUBLIC_URL`) |
| Sign-in | Email + password, magic link, Google (when OAuth credentials are set) |
| Registry / CI | `git.mwsz.org/milek/bok` (Forgejo); no CI — `scripts/release.sh` bumps, builds and pushes |
| Manifests | Kustomize (`deploy/`); IngressRoute written by the user |
| Postgres extensions | `pg_trgm`, `unaccent`, `citext` created by the user |

---

## 1. Architecture

### 1.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Web app + API | **SvelteKit 2 / Svelte 5**, `adapter-node` | Smallest runtime of the major frameworks; server rendering for public pages and link previews; one codebase for UI and API |
| PWA | `@vite-pwa/sveltekit` (Workbox) | App-shell caching, offline routes, install prompt |
| Offline storage | **Dexie** (IndexedDB) | Mutation outbox, cached owned library for bookstore mode and scanning offline |
| Database | Postgres (CNPG) + **Drizzle ORM** with SQL migrations | Typed queries; plain SQL migrations reviewable in PRs |
| Background jobs | **pg-boss** (on Postgres) | Jobs enqueued in the same transaction as the domain write; no queue consistency issues in a Valkey cluster; built-in cron |
| Cache / rate limiting / realtime | **Valkey** cluster (`iovalkey` cluster client) | Metadata lookup cache (positive and negative), rate limits, session cache, pub/sub for live notifications via SSE |
| Auth | **better-auth** | Email + password, magic link, OAuth, passkeys later; sessions in Postgres with Valkey as secondary storage |
| i18n | **Paraglide JS** | Translations compiled per message, tree-shaken — near-zero runtime cost |
| Barcode | `barcode-detector` ponyfill (native `BarcodeDetector` when present, **zxing-wasm** otherwise) in a Web Worker | Native speed on Android; iOS Safari has no `BarcodeDetector` |
| Images | `sharp` in the worker → AVIF/WebP variants in R2 | Fixed sizes, no hotlinking of third-party covers |
| Link preview images | `satori` + `@resvg/resvg-js` in the worker, cached in R2 | Dynamic Open Graph cards without a headless browser |
| Search | Postgres full-text (`simple` config + `unaccent`) + `pg_trgm` | Handles Polish diacritics and typos; Meilisearch only if we outgrow it |
| Tests | Vitest, Playwright (mobile viewports), Testcontainers Postgres | |
| Observability | pino logs, OpenTelemetry traces, Prometheus `/metrics` | |

### 1.2 Repository layout (pnpm + Turborepo)

```
apps/
  web/        SvelteKit: UI, form actions, JSON API under /api/v1, SSE
  worker/     Node: pg-boss jobs (metadata enrichment, covers, imports,
              reminders, stuck detection, link preview images, email/push)
packages/
  db/         Drizzle schema, migrations, SQL helpers (visibility functions)
  core/       Domain logic + zod schemas shared by web, worker and client
  metadata/   ISBN/ISSN providers, normalisation, merging
  ui/         Design-system components
  i18n/       Paraglide messages (pl, en)
deploy/
  helm/ (or kustomize/)  Deployments, Services, HPA, migration Job, Secrets templates
```

### 1.3 Kubernetes footprint

- `web` Deployment (stateless, HPA on CPU/RPS), `/healthz` and `/readyz`.
- `worker` Deployment (1–N replicas; pg-boss handles concurrency and singleton cron jobs).
- A migration `Job` (Helm pre-upgrade hook) runs Drizzle migrations.
- Config through env vars and Secrets: `DATABASE_URL`, `VALKEY_NODES`, `R2_*`, `SMTP_*`, `VAPID_*`, provider API keys.
- Services only — **you define the IngressRoute**. Needed routes: `/` → web (including the `/api/v1/*` and `/api/v1/events` SSE streams, so turn off response buffering on that path).

### 1.4 Object storage (R2) — yes, needed

| Bucket / prefix | Content |
|---|---|
| `covers/` | Mirrored provider covers + user cover photos, in sizes (S 120 px, M 320 px, L 640 px) |
| `avatars/` | Profile photos (cropped on the device, variants generated in the worker) |
| `og/` | Generated link preview images |
| `imports/` | Uploaded CSV files (deleted after 30 days) |
| `exports/` | Generated data exports (signed URL, 7-day expiry) |

Uploads go straight from the browser to R2 with presigned PUT URLs. Media is served from a public R2 custom domain with long-lived cache headers and content-hashed keys.

### 1.5 Performance budgets

- Initial JS on main routes **< 90 KB gzipped**; scanner code loaded only on the scan route.
- LCP **< 2.0 s** on a mid-range Android over 4G; INP < 200 ms.
- Scan → result card: **< 300 ms** when the book is in the local or server cache; **< 1.5 s p95** on a cold lookup.
- Feed and list endpoints: keyset pagination, p95 < 150 ms server time.

### 1.6 Cross-cutting rules

- **IDs:** UUIDv7 generated on the client for offline-created entities. Every mutation carries an idempotency key, so retries from the outbox are safe.
- **Visibility:** one SQL function `can_view(viewer_id, owner_id, visibility)` + a block check, used by every read query (posts, log, readlists, library, comments). This is the main security risk area and gets a full test suite.
- **GDPR (public product):** account deletion (hard delete after a 14-day grace period), full data export, no tracking cookies (so no consent banner), privacy policy and terms pages.
- **Rate limits** (Valkey, sliding window) on auth, lookups, posting, follow/friend requests and reports.

---

## 2. Core data model

```
users, profiles(handle citext unique, display_name, bio, avatar_key, locale, timezone,
                library_visibility, lending_visibility)
households, household_members(role: owner|member)

works(title, subtitle, original_title, original_language, first_published_year)
authors(name, sort_name)              work_authors(work_id, author_id, role, position)
editions(work_id, isbn13 unique?, isbn10, issn, title, publisher, published_date,
         page_count, language, format, cover_key, metadata_quality)
edition_sources(edition_id, provider, fetched_at, raw jsonb)      -- raw data from each provider
metadata_edits(entity, entity_id, user_id, diff jsonb, created_at) -- wiki-style edit history, revertible
series(name)                          work_series(work_id, series_id, position numeric)
tags(slug, name_pl, name_en)          user_work_tags(user_id, work_id, tag_id)

locations(household_id, name, sort)                         -- rooms
containers(location_id, type: bookcase|…, name, layout jsonb) -- furniture
sections(container_id, label, x, y, w, h)                   -- shelves; rectangle in the container grid
copies(household_id, edition_id, section_id?, owner_user_id, lendable, state: shelved|lent|lost,
       acquired_at, notes)

reading_states(user_id, work_id, status, stuck_source: auto|manual|null, updated_at)
reads(user_id, work_id, edition_id?, format, started_on?, finished_on?, finished_precision: day|month|year|null,
      outcome: in_progress|finished|dnf, rating 0..10?, review, review_spoiler,
      duration_days_override?, pace?: intensive|usual|slow, visibility)
reading_events(read_id, type: started|progress|stuck|resumed|finished|dnf, page?, percent?, minutes?, occurred_at)
reading_goals(user_id, year, target_books)

readlists(owner_id, title, description, visibility: private|unlisted|public, slug)
readlist_items(readlist_id, work_id, position text /* fractional index */, note)
readlist_saves(user_id, readlist_id)

follows(follower_id, followee_id)
friendships(user_low, user_high, status: pending|accepted, requested_by)
blocks(blocker_id, blocked_id)        reports(reporter_id, target_type, target_id, reason, status)

posts(author_id, body, visibility: public|followers|friends|private, spoiler, edited_at)
post_book_refs(post_id, work_id, edition_id?)
comments(post_id, author_id, body, spoiler)      likes(user_id, target_type, target_id)

loans(copy_id?, edition_id, lender_user_id?, lender_name?, borrower_user_id?, borrower_name?,
      status: requested|active|returned|declined|cancelled, lent_on, due_on, returned_on, notes)

notifications(user_id, type, payload jsonb, dedupe_key unique, read_at)
notification_prefs(user_id, type, inapp, push, email)
push_subscriptions(user_id, endpoint, keys)

imports(user_id, source, file_key, status, stats jsonb)   import_rows(import_id, raw jsonb, match, result)
inventory_sessions(section_id, user_id, started_at, finished_at)  inventory_scans(session_id, edition_id)
```

"Unlisted" readlists (anyone with the link, not listed on your profile) are added because they're the most common way people share — say so if you'd rather keep only private/public.

---

## 3. ISBN / ISSN metadata pipeline

### 3.1 Sources

| Provider | Role | Cost / limits |
|---|---|---|
| **Our database** | First lookup; grows with every scan | — |
| **Open Library** | Grouping editions into works, covers, open data we may store | Free, no key; full data dumps available for pre-seeding |
| **Google Books** | Descriptions, covers, wide coverage | Free key; ~1,000 requests/day by default, increase on request. Check its terms before storing long term. |
| **Biblioteka Narodowa (BN Data)** | Authoritative data for 978-83 / 979-83 and Polish ISSNs | Free; `data.bn.org.pl/api/institutions/bibs.json?isbnIssn=…`, also MARC/OAI-PMH bulk |
| **Other national libraries** (DNB SRU for 978-3, LoC SRU for English) | Added by ISBN prefix when miss rates show the need | Free |
| **Hardcover** (GraphQL) | Series and work data, run in the background | Free token; ~60 requests/min |
| **ISBNdb** | Paid fallback for misses | No free tier; plans started around $15/mo (2024 price, to verify). Enabled by config flag. |
| **ISSN** | BN, Crossref (journals), OpenAlex sources, Wikidata | Free. The ISSN Portal API is a subscription from about €978/yr (2024 price) — skip unless magazines become important. |

### 3.2 Lookup algorithm

1. **Normalise:** strip separators, validate checksum, convert ISBN-10 ↔ ISBN-13 (979 has no ISBN-10). EAN 977 → ISSN (read the 2-digit add-on as the issue number where the decoder supports it).
2. **Our database** hit → return immediately (with a background refresh if the record is old or incomplete).
3. **Valkey negative cache** (not found within the last 7 days) → skip to manual entry.
4. **Parallel query** with a 2.5 s budget: Open Library + Google Books + the national library matching the prefix.
5. **Merge per field** using a priority table: national library for title/authors/publisher/year; Google, then Open Library for description; largest valid image for cover; Open Library work ID for grouping; Hardcover, then Open Library for series.
6. **Still missing title/authors** → ISBNdb (if enabled).
7. Store the edition, its raw source records and a `metadata_quality` score; queue background jobs for cover mirroring, Hardcover series enrichment and work matching.
8. Users can correct any field (wiki-style; edits are logged and revertible; rate-limited).

We record a **hit/miss metric per provider and per ISBN prefix**. That data decides when ISBNdb is worth paying for.

---

## 4. Phases

Rough size: **S** ≈ 1 week, **M** ≈ 2–3 weeks, **L** ≈ 4+ weeks for one developer with AI help.

### Phase 1 — Foundation  ·  M  ·  ✅ done (2026-11-08)

Deviations from the plan: npm workspaces instead of pnpm; the native SvelteKit service worker instead of `@vite-pwa`; avatars are uploaded through the app (no R2 CORS needed); BN + Open Library are live, Google Books/ISBNdb activate when their keys are set.

**Scope**
- Monorepo, CI (lint, typecheck, tests, image build), Helm/Kustomize, migration Job, health checks, metrics.
- Postgres schema for users/households/works/editions/copies; Valkey client; R2 client + presigned uploads; pg-boss worker.
- Auth (email + password, magic link, Google), email verification, password reset, sessions.
- App shell: bottom tab bar (Home · Library · **Scan** · Lists · Profile), light/dark theme, PL/EN switch, install prompt, offline page.
- Metadata package (§3) with provider adapters, merging, caching, metrics; admin "lookup inspector" showing raw provider responses.
- Book detail page (work + editions), global search (title/author/ISBN).
- GDPR basics: account deletion, privacy/terms pages.

**Done when**
- Signing up on a phone, installing the PWA and searching or looking up an ISBN works end to end on your cluster.
- The lookup inspector shows the merged result plus each provider's answer for a test set of 50 PL/EN ISBNs; provider hit rates are recorded.

### Phase 2 — Scanning & adding books  ·  M  ·  ✅ done (2026-11-08)

Built as planned, plus: a 1×/2× zoom toggle where the camera supports it; editing details requires a confirmed email; offline support covers `/`, `/scan` and `/library` (page + load data cached by the service worker). "Move the existing copy here" on duplicates waits for phase 3 (sections). Not verified on real phones yet — the automated test uses a fake camera feed in Chromium (native detector and the zxing-WASM path iOS uses).

**Scope**
- **Scanner:** rear camera, decoding in a worker on a cropped centre band, a code counts only after 2 identical reads, 2 s cooldown per code, torch toggle (Android), beep + vibration (vibration doesn't exist on iOS), tap to focus, manual ISBN keypad fallback.
- **Continuous scan mode:** each scan adds a result card to a stack (cover, title, author) with **Undo**; lookups resolve in the background.
- **Offline queue:** scans saved to IndexedDB with client IDs; synced and resolved when back online; "pending lookup" badge.
- **Duplicate warning:** same edition already in the household → "You have 1 copy — Living room › Billy 2 › Shelf C". Options: *add another copy / skip / move the existing one here*. Same work, different edition → a softer hint.
- **Bookstore mode** (a toggle on the scan screen, doesn't add anything): instant verdict — *owned (where, how many) · lent out (to whom) · borrowed · on want-to-read · read before (rating) · in your readlists*. Later phases add "friends who own or read it". Works offline from the cached library.
- **Manual add** for books without an ISBN: title/author search → pick or create; cover photo from the camera.
- Metadata correction UI.
- Copies start in an "Unsorted" bucket until phase 3.

**Done when**
- Scanning 30 books in a row on an iPhone (installed PWA) and an Android phone has no missed or double adds; undo works.
- In airplane mode, scans queue up and resolve after reconnecting.
- Bookstore mode answers in under 300 ms for owned books with no network.

### Phase 3 — Storage hierarchy, shelf designer & inventory  ·  M  ·  ✅ done (2026-11-08)

Built as planned, plus: a **Move** scan mode (scan a book to move your copy onto the target shelf); "Move here" on duplicates; an **Unsorted** list with multi-select moving; undo of a move puts the copy back. Choices made: shelf order for "Next shelf" is down each column, then the next column, then the next bookcase/room; "Next shelf" and the target are remembered per device; inventory classifies scans on the device (works offline), fixes need a connection; joining a shared household makes it the active one (your own books stay in your previous household). Not done: merged cells spanning columns, other furniture types (schema ready), room floor plans.

**Scope**
- Rooms → containers (bookcase now; `type` + layout template allow future furniture) → sections. Create, rename, reorder, delete (deleting a non-empty section asks where its books go).
- **Shelf designer:** set columns and shelves per column; drag dividers to resize; sections are rectangles in a grid (`x, y, w, h`), so uneven bookcases work; automatic labels (A1, A2…) you can rename. Rendered as SVG — light and fast on phones.
- **Scan target bar** on the scan screen: "Living room › Billy 2 › Shelf C" with a quick picker and a big **Next shelf →** button (follows the grid order) for working through shelves one by one. The target persists between sessions.
- **"Where is it?":** book and copy pages show the bookcase sketch with the shelf highlighted + a breadcrumb; search results show a location chip.
- Moving books: from the copy page, multi-select in a section view, or by scanning in "move" mode.
- **Inventory mode:** pick a section → scan everything on it → report: ✓ confirmed · ✗ missing (recorded here, not scanned) · ⇄ misplaced (recorded elsewhere — one tap to move) · + unknown (not in the library — one tap to add). Results stored per session.
- Household sharing: invite a member by link; shared rooms and copies.

**Done when**
- A 5-column bookcase with mixed shelf heights can be drawn on a phone in under a minute.
- Scanning three shelves in a row with **Next shelf** places every book correctly.
- An inventory of a shelf with one book removed and one book misplaced reports both.

### Phase 4 — Reading statuses & the log  ·  M  ·  ✅ done (2026-11-08)

Built as planned. Choices made: one-tap "Read"/"Didn't finish" from a book card opens the finish sheet on the book page; a progress update clears only an *automatic* stuck (a manual one stays until the status changes, as specified); reading time counts calendar days (finishing on the start day = 1 day); goal "on track / N behind" compares with an even pace through the year (rounded); rereads are numbered in the log (↻). Ratings in the UI are ½–5 stars (1–10); 0 is accepted by the API. Series come from catalogue data (existing editions were backfilled) and change when an edition's series is edited. Tags are global names, applied per user; the work page shows yours plus the most used by everyone. Not done: a dedicated tag page (phase 7 links `#tags` there), user-entered series for works without catalogue data beyond editing the edition.

**Scope**
- Status per user and work: want to read · reading · stuck · read · did not finish. One-tap status change from a book card.
- Progress updates (page / % / minutes depending on format), with a quick slider and number entry.
- **Stuck rule:** a daily job moves *reading* → *stuck (auto)* after 30 days without progress; any progress update returns it to *reading*. Manual *stuck* stays until the user changes it.
- Every change is a `reading_event` → shown on the read's timeline.
- **Finishing a book** opens a sheet: date (optional; precision day/month/year), rating 0–10 (half-star control), review (markdown-lite, spoiler toggle), reading time (*estimated from events, e.g. "14 days"*, editable), pace (intensive/usual/slow — **suggested** from pages per day compared with your own median, editable), visibility.
- **Log:** a Letterboxd-style diary grouped by year → month, with a **"Past"** section for reads without a date; filters (year, rating, format, tag); rereads shown with a ↻ marker.
- **Yearly goal:** set a target; progress screen with "on track / N behind" based on days elapsed in the year.
- Series (shown on the work page, with "next in series") and tags (pick or create; personal filter + combined community tags on the work page).
- Bookstore mode gains "on want-to-read / read before".

**Done when**
- Over a simulated 31 days, a reading book becomes stuck, and a progress update clears it.
- A finished read with no date appears under "Past"; one with only a month appears in that month.
- The reading-time estimate equals the days between the first *started* and the *finished* event, and an override replaces it everywhere.

### Phase 5 — Profiles & social graph  ·  M

**Scope**
- Profile: avatar (crop on the device → R2), unique handle, display name, bio, timezone. Tabs: Log · Posts (phase 7) · Readlists (phase 6) · Library · Stats.
- Per-section privacy: library and lending visibility (public / followers / friends / private).
- **Follow** (instant, one-way) and **friends** (request → accept/decline, independent of following). Lists of followers, following and friends; mutual indicators.
- **Notification core** (used by every later phase): in-app inbox with live updates over SSE, web push (VAPID; on iOS only for the installed PWA, 16.4+), email, preferences per notification type, quiet hours based on the user's timezone.
- **Blocking:** removes follows and friendship both ways, hides content in both directions, prevents all interactions and lending.
- **Reporting:** profiles (posts, comments and readlists are added as they ship) → admin queue with resolve / hide content / suspend user.
- User search by handle or name.

**Done when**
- Visibility test matrix passes: {public, followers, friends, private} × {stranger, follower, friend, friend+follower, blocked, self} for the log and library.
- A friend request reaches the recipient's phone by push within 5 s.

### Phase 6 — Readlists, public links & link previews  ·  S–M

**Scope**
- Create, edit and delete readlists; add from any book card ("Add to list…"); drag to reorder (fractional indexes — no renumbering); a note per item.
- Visibility: private · unlisted · public. Public and unlisted lists have a short URL `/l/{slug}`.
- **Public page for people without an account:** server-rendered, fast, no JavaScript needed to read it; covers, authors, notes; "open in the app" / "create an account to save" call to action.
- Save someone else's list; the Web Share API share sheet.
- **Link previews** for readlists, profiles, books and public posts: Open Graph / Twitter meta tags + generated preview images (cover collage + title) cached in R2 and regenerated on change.

**Done when**
- A list link pasted into Messenger, WhatsApp, iMessage, Slack or Discord shows a correct preview card.
- The public page scores ≥ 95 on Lighthouse mobile performance.

### Phase 7 — Microblog, book references & home feed  ·  M

**Scope**
- Posts: markdown-lite (bold, italics, links, line breaks), 2,000 characters, visibility public/followers/friends/private, edit (marked "edited") and delete.
- **`$` book references:** typing `$` opens an autocomplete (your library first, then the global catalogue, then ISBN lookup) and inserts a token stored as a reference to a work or edition; rendered as a clickable book chip with a small cover. Posts are listed on the book's page ("mentioned in").
- **`@user` mentions** (autocomplete from people you follow and friends first; notifies the person) and **`#tags`** (link to the tag page, shared with book tags).
- **Spoilers:** inline `||spoiler||` blur + a whole-post spoiler flag; also for reviews and comments.
- Comments (one level), likes on posts and comments; comments follow the post's visibility.
- **Home feed:** reverse-chronological; posts, finished reads/reviews and new public readlists from people you follow and from friends (friends' posts only within their visibility); blocks applied; keyset pagination; pull to refresh.
- Reports extended to posts, comments and readlists.
- Notifications: comment on your post, like, reference to a book you're reading (optional).

**Done when**
- A friends-only post is visible to a friend who doesn't follow the author, but not to a follower who isn't a friend.
- Book chips survive edits and link correctly; spoilers are hidden in feeds and link previews.

### Phase 8 — Lending & borrowing  ·  M

**Scope**
- **Lend** from a copy: borrower = a user (friends first) or just a name; due date (2 weeks / 1 month / custom); note.
- **Borrow request:** friends see your *lendable* copies (respecting lending visibility) → request → you approve (set the due date) or decline.
- **Borrowed from someone outside the app** (a sibling, a library): record it without a copy, so reminders still work.
- The borrower sees the loan under "Borrowed"; extension request → lender approves; either side marks it returned and the lender confirms.
- **Reminders** (daily worker job in each user's timezone, deduplicated): borrower at **7, 3 and 1 day before** the due date + on the due day; both sides when overdue (then weekly). Channels follow the user's notification preferences.
- Shelf sketch and copy page show "Lent to Ola until 12 Dec"; bookstore mode shows lent and borrowed state.
- Lending history per copy and per person.

**Done when**
- With a clock simulation, exactly one notification per reminder day is sent per loan (no duplicates across worker replicas or restarts).
- Blocking a user cancels pending requests and stops lending interactions.

### Phase 9 — Import/export & stats  ·  M

**Scope**
- **Goodreads CSV import:** upload → preview → confirm. Mapping:
  - `ISBN13` / `ISBN` (strip the `="…"` wrapper) → edition; no ISBN → title + author match against our database and BN, with the user confirming uncertain matches.
  - `Exclusive Shelf` → status (`read`, `currently-reading`, `to-read`); custom `Bookshelves` → tags (option: → readlists).
  - `My Rating` 1–5 → 2–10; `Date Read` → finished read; `Read Count` > 1 → extra reads under "Past"; `My Review` + `Spoiler` → review; `Owned Copies` > 0 → copy in "Unsorted".
  - Runs as a background job with live progress; report of matched / needs review / failed rows; re-running is idempotent.
- **lubimyczytac.pl:** it has **no official export** and its terms forbid automated downloading, so we won't scrape it from our servers. We accept the Goodreads-format CSV that community exporters produce (the `lubimyczytac-exporter` script and the "Książkowy eksporter" browser extension) — with an in-app guide, detection of a 1–10 rating scale, and title/author matching for rows without an ISBN. Users can also request their data from lubimyczytac under GDPR.
- **Export:** Goodreads-compatible CSV + full JSON (all your data, GDPR).
- **Stats:** books and pages per year/month, rating distribution, average reading time, pace split, formats, top authors/tags, longest/shortest read.
- **Year in review:** an animated summary screen in mid-December/January + a shareable image card with a link preview.

**Done when**
- A real Goodreads export of more than 1,000 rows imports in under 2 minutes with at least 95 % matched automatically.
- A lubimyczytac community export imports with ratings on the correct scale.

---

## 5. Later (not scheduled)

Adding a whole shelf from one photo of the spines · collaborative readlists · book clubs (shared readlist + schedule + discussion) · quotes/highlights · more furniture types (boxes, piles, e-readers) · room floor plans · private profiles · native app wrappers if iOS PWA limits start to hurt (camera re-prompts, push).

## 6. Risks

| Risk | Mitigation |
|---|---|
| iOS PWA camera quirks (permission asked again in standalone mode, no torch) | Keep the camera stream alive for the whole scan session; manual entry fallback; test on real devices every phase |
| iOS push only works for the installed PWA | Email fallback; install guide on first launch |
| Free API quotas / gaps for Polish books | Our database first, BN for Polish ISBNs, a hit-rate metric deciding when to pay for ISBNdb |
| Google Books terms on storing data | Store our merged record with source attribution; prefer Open Library/BN data for what we keep |
| Visibility leaks | One SQL visibility function + a test matrix for every surface |
| Spam/abuse once public | Rate limits, email verification before posting, reports + admin queue, blocking |
