# ChronoRail · directory prototype v1

Static prototype of the ChronoMedia music-tool directory. Vanilla HTML/CSS/JS, no framework, no backend. Built for Cloudflare Pages.

**Status:** prototype. `data/listings.json` holds the Gemini seed: 72 listings, all `unverified`, `confidence: ai-sourced`, with no `last_checked`. The site shows an UNVERIFIED SEED banner until at least one row is human-verified. Do not publish it as fact.

## Run it locally

```bash
cd chronorail
python3 -m http.server 8080      # or: npx serve .
# open http://localhost:8080
```

Opening `index.html` straight from disk will not work: the browser blocks `fetch()` on `file://`.

## What's here

```
index.html              app shell (all pages are hash routes)
config.js               SITE.name = "ChronoRail"  ← rename the product here only
assets/tokens.css       Pro Light design tokens (+ graphite variant), shared with the plugin kit
assets/app.css          rack-module UI
assets/app.js           data loading, routing, filters, search, JSON-LD, submit form
data/listings.json      listings (replace this)
data/categories.json    29 starter categories with module codes (DW, VI, FX…)
data/stacks.json        named lists of listing IDs
data/listings.template.csv   header row for the Google Sheet
listings/               seed imports (raw + cleaned CSV) and review-queue.md
feed/listings.json      public feed (generated)
llms.txt                AI-readable summary (generated)
scripts/build-data.mjs  validates data, converts Sheet CSV, writes feed + llms.txt
404.html, _headers, manifest.webmanifest, sw.js
```

## Routes

| Page | URL |
|---|---|
| Home (search, category bay, Discover, stacks) | `/` |
| Category index | `/#categories` |
| Category page (filterable) | `/#c-daws` |
| Listing detail + JSON-LD | `/#l-surge-xt` |
| Stack detail | `/#s-zero-cost-starter` |
| Search results | `/#search` |
| About / verification | `/#about` |
| Submit a listing | `/#submit` |
| Random listing | `/#discover` |
| Feed / LLM summary | `/feed/listings.json`, `/llms.txt` |

## Drop in a new listings.json

1. Replace `data/listings.json`. It can be a bare array of listing objects or `{ "listings": [...] }`.
2. Run `node scripts/build-data.mjs`. It validates every row, sorts by name, and rewrites `feed/listings.json` and `llms.txt`.
3. Commit all three files.

Rows that fail validation are skipped and listed in the output. Use `--strict` to fail the build instead (recommended in CI).

### Validation rules

- `id`: lowercase slug (`a-z0-9-`), unique. It becomes the URL: `#l-<id>`.
- `name`: required.
- `official_url`: required, must start with `https://`.
- `category`: must be a slug in `data/categories.json`.
- `price_type`: one of `free | freemium | paid | one-time | subscription | varies | unknown`. Aliases: `hardware`/`purchase`/`perpetual` → `one-time`, `mixed` → `varies`.
- `verification_status`: one of `unverified | verified | needs-recheck | rejected`. A `verified` row must have `last_checked`.
- `short_description`: 200 characters max. Write it yourself, no vendor marketing.

## Google Sheet → JSON

One row per listing, one column per field. Copy the header row from `data/listings.template.csv`.

| Sheet column | Field | Format |
|---|---|---|
| id | id | slug, e.g. `surge-xt` |
| name | name | text |
| maker | maker | text |
| category | category | category slug |
| subcategory | subcategory | free text |
| tags | tags | `synth; wavetable` (semicolon-separated) |
| short_description | short_description | one sentence, ≤200 chars |
| who_its_for | who_its_for | short phrase |
| platforms | platforms | `Windows; macOS; Linux; iOS; Android; Web` |
| formats | formats | `VST3; AU; CLAP; AAX; LV2; Standalone` (plugins only) |
| price_type | price_type | see list above |
| price_note | price_note | text; write `UNVERIFIED` if unsure |
| license | license | `Proprietary`, `GPL-3.0`, `MIT`, `N/A (hardware)`… |
| official_url | official_url | https URL |
| affiliate_ok | affiliate_ok | `TRUE` / `FALSE` |
| affiliate_url | affiliate_url | blank unless an affiliate link exists |
| featured | featured | `TRUE` / `FALSE` (label only) |
| paid_placement | paid_placement | `TRUE` / `FALSE` (label only) |
| scjg_owned | scjg_owned | `TRUE` for ChronoStudio, ChronoRack, Lava Lava, etc. |
| verification_status | verification_status | see list above |
| last_checked | last_checked | `YYYY-MM-DD` (other date formats are converted) |
| confidence | confidence | `high / medium / low` |

### Automatic cleanup on every build

- `Hardware` is removed from platforms and formats. Hardware rows show "N/A (hardware)" for platforms, and a `Proprietary` license becomes `N/A (hardware)`.
- `NKS` moves from formats to tags (it's an integration, not a plugin format).
- License spelling is normalized (`proprietary` → `Proprietary`, `GPLv3` → `GPL-3.0`).

### Internal columns

`source_notes`, `review_flag` and `notes` can stay in the Sheet. They are never written to the public data or feed. Rows with a `review_flag` are written to `listings/review-queue.md` as a checklist.

### Verifying a row

Check it against `official_url`, fix what's wrong, then set `verification_status` = `verified`, `last_checked` = today, `confidence` = `high`. Remove ` · UNVERIFIED` from `price_note` once the price is confirmed.

The script also accepts these header aliases: `Last verified`, `Who it's for`, `URL`, `Website`, `Description`, `Platform`, `Format`, `Price`, `SCJG owned`, `Status`, `Affiliate ok`.

Export and build:

```bash
# Sheet: File → Download → Comma-separated values (current sheet)
node scripts/build-data.mjs --csv ~/Downloads/ChronoRail\ -\ Listings.csv --strict
```

Later, automate it: a Cloudflare Pages build command can download the published-to-web CSV, then run the script.

```bash
curl -sL "$SHEET_CSV_URL" -o /tmp/listings.csv && node scripts/build-data.mjs --csv /tmp/listings.csv --strict --site https://<domain>
```

## Labels and ranking (do not change without a policy decision)

- Sort is **name** (default) or **recently checked**. `featured`, `paid_placement` and `affiliate_url` are never read by the sort.
- If those fields are true, the listing shows **Featured**, **Paid placement** or **Affiliate**. An affiliate link appears as a separate button with a disclosure line. The **Official site** button always uses `official_url`.
- `scjg_owned: true` shows an **SCJG-owned** label.
- No vendor logos or screenshots. Listings use an initial tile. The future image spec is 1080×1080, for when makers grant assets.

## Module IDs

Listing IDs like `DW-03` are computed: category code plus position by name within that category. They can shift when listings are added. Use `id` for anything permanent.

## AI-readable

- Listing pages inject schema.org JSON-LD: `SoftwareApplication` for software, `Product` for hardware categories, `WebApplication` for services.
- `/feed/listings.json` has every field, plus metadata, the ranking policy and the category list. `_headers` allows CORS on `/feed/*`.
- `/llms.txt` is regenerated by the build script.

**Known v1 limit:** JSON-LD is added client-side on hash routes. Google renders JS, but many AI crawlers don't. The v1.1 fix is a pre-render step that writes `/tools/<id>/index.html` with JSON-LD in the static HTML (tracker item).

## Deploy

Live: https://chronorail.pages.dev (direct upload). Repo deploys: connect this repo as a Cloudflare Worker (`wrangler.jsonc` serves `./dist` as static assets).

Update flow: edit data → `bash scripts/make-dist.sh` → commit `data/`, `feed/`, `llms.txt` and `dist/` → push. Cloudflare redeploys on push.

`listings/` (seeds, source notes, review queue) is git-ignored and must stay out of this public repo.

### Older notes

Cloudflare Pages → new project → upload this folder (or connect the repo). No build step is required. Use `node scripts/build-data.mjs --strict` as the build command once the Sheet pipeline is live. Output directory: `/`.

## Submit form

`config.js → submitEndpoint` is empty, so the form validates and shows the JSON payload but sends nothing. To go live, set it to a Basin form URL or an Apps Script web-app URL. The payload is the listing shape plus a `_submission` block (relation, contact, timestamp). Every submission arrives `unverified`.

## Out of scope in v1

No Stripe or checkout, no email sending (the waitlist field is a stub), no scraping, no accounts, no admin UI, no photo, video or CG branches.
