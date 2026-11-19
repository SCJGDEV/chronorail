# ChronoRail accounts (ChronoWare ID) — setup checklist

Status: built and tested locally on branch `feat/accounts`; **not live**. Accounts stay off until every "Silas" step below is done and `AUTH_ENABLED` is `"1"`.

## What's in the branch

| Piece | File |
|---|---|
| Worker: serves `./dist`, runs `/api/*` first | `src/worker.js` |
| Auth: Better Auth 1.7.26 (magic link + Google), D1, rate limits, delete account | `src/worker.js` |
| Rack sync API: `GET`/`PUT /api/rack` (cleaned, max 500 tools, notes ≤ 500 chars) | `src/worker.js` |
| Database schema (Better Auth tables + `rack`) | `migrations/0001_auth.sql` |
| Sign in / Account pages, rack merge + sync | `assets/app.js` |
| Terms + Privacy (DRAFT, needs Silas's review) | `assets/legal.js` → `/#terms`, `/#privacy` |
| Config: bindings, flags | `wrangler.jsonc`, `package.json` |

The UI only shows **Sign in** when `/api/status` reports `accounts: true`. The Google button only shows when the Google keys exist, and the email form only shows when a mail sender exists.

## Tested locally (wrangler dev + local D1)

- Magic link sent → verify → redirect to `/#rack` → 30-day session cookie.
- Rack: the local rack merged and uploaded on sign-in; bad IDs and statuses stripped server-side.
- Rate limit: 3 magic-link requests per 5 minutes per IP → 429.
- Cross-origin PUT → 403.
- Delete account → user, sessions and rack all removed (cascade).
- NOT tested: Google sign-in (needs the real client), real email delivery, a Cloudflare Workers Builds deploy of this branch.

## Steps

Silas does the steps marked 🔑, because they involve secrets or billing. Claude can do the rest.

1. **Pick the email path.** Magic links need an outbound mail service.
   - Cloudflare Email Sending: needs the **Workers Paid** plan. Includes 3,000 emails/month, then $0.35 per 1,000 (Cloudflare pricing page, read 2026-11-18). Free plans can only send to verified addresses, so they can't send magic links.
   - Or launch **Google-only** first (no email cost) and add magic links later.
2. **Create the D1 database** (free tier): `npx wrangler d1 create chronorail-accounts`, then put the returned id in `wrangler.jsonc` → `database_id`. Then run `npm run db:migrate:remote`.
3. 🔑 **Auth secret**, typed by Silas only: `npx wrangler secret put BETTER_AUTH_SECRET` with a long random value, e.g. from `openssl rand -base64 32`. Never paste it into chat or a file.
4. 🔑 **Google OAuth client.** In Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application):
   - Authorized JavaScript origin: `https://chronorail.si`
   - Authorized redirect URI: `https://chronorail.si/api/auth/callback/google`
   - OAuth consent screen: app name ChronoRail; support email io@scjg.cc; privacy `https://chronorail.si/#privacy`; terms `https://chronorail.si/#terms`.
   - Then run `npx wrangler secret put GOOGLE_CLIENT_ID` and `npx wrangler secret put GOOGLE_CLIENT_SECRET`.
5. **Email sending**, if chosen in step 1. Onboard the domain: `npx wrangler email sending enable chronorail.si`. Then uncomment `send_email` and `MAIL_FROM` (`signin@chronorail.si`) in `wrangler.jsonc`.
   - Send from chronorail.si, not chronoware.si. chronoware.si's DMARC policy is `p=reject`, which would block mail sent from it.
6. 🔑 **Review the Terms and Privacy text** in `assets/legal.js`, then remove "DRAFT" from `meta.updated` and set the launch date.
7. **Flip it on:** set `AUTH_ENABLED` to `"1"` in `wrangler.jsonc`, merge the PR, and check `https://chronorail.si/api/status`.

## One ChronoWare ID across apps (later)

Today the account lives on chronorail.si. To share one sign-in across ChronoScene, ChronoRack and the other apps, move this Worker's auth to `id.chronoware.si`. Better Auth supports cross-subdomain cookies, but our apps sit on different domains (`.si`), so that will need its own sign-in redirect. Plan it before the second app adds accounts.
