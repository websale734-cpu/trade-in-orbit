# Orbtrade

A crypto brokerage web platform: registration and KYC, funded accounts, trading, withdrawals, rewards, support, a public API and a full admin panel.

Built with **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4**, with **PostgreSQL on Neon via Prisma 7**.

> **Before going live:** operating a crypto brokerage requires licensing (e.g. VASP / money-transmitter registration) in each jurisdiction you serve, plus custody and liquidity partners. The legal pages are placeholders for lawyer-reviewed text. Payment and blockchain integrations run behind provider interfaces and must be connected to real, contracted providers.

## Build status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Project setup, design system, landing page, dark/light mode | ✅ Done |
| 2 | Registration, email + SMS codes, login, 2FA, KYC upload | ✅ Done |
| 3 | Dashboard, accounts, live prices, watchlist (+ ledger core, notifications) | ✅ Done |
| 4 | Deposits, trading, order book, withdrawals, ledger | ✅ Done |
| 5 | Admin panel | ✅ Done |
| 6 | Referrals, loyalty tiers, price alerts, recurring buys | ✅ Done (staking and gift cards postponed) |
| 7 | Support tickets + live chat, help pages, history, statements, tax reports, API keys | ✅ Done (blog, academy, leaderboard and multi-language postponed) |
| 8 | Security review, tests, CI, mobile polish, deployment guide | ✅ Done: see [SECURITY.md](SECURITY.md) and [DEPLOYMENT.md](DEPLOYMENT.md) |

## Getting started

Requirements: **Node.js 20.9+** (developed on Node 24) and the [Neon CLI](https://neon.com/docs/cli/install) (`npm i -g neon`).

```bash
npm install                     # also generates the Prisma client
neon login                      # once, opens a browser
neon checkout dev               # use the dev branch; writes DATABASE_URL etc. to .env.local
```

Then add the non-Neon variables to `.env.local` (see [`.env.example`](.env.example)). For local development, at minimum:

```bash
SESSION_SECRET=<random, see .env.example>
DATA_ENCRYPTION_KEY=<random 32-byte base64>
EMAIL_PROVIDER=console          # codes are printed in the dev server log
SMS_PROVIDER=console
```

```bash
npm run db:migrate              # apply migrations to the dev branch
npm run db:seed                 # optional: demo users (dev branches only)
npm run dev                     # http://localhost:3000
```

**Staff accounts** (dev only): `admin@orbtrade.dev` (Super admin) and `support@orbtrade.dev` (Support), same password. The admin area requires 2FA: add the dev secret `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` to an authenticator app. The seed also puts a pending KYC submission in the review queue.

**Demo accounts** (after `db:seed`, dev branches only): `demo@orbtrade.dev` (KYC not started) and `verified@orbtrade.dev` (KYC approved), each with Trading and Savings accounts, demo balances and a watchlist. Password for both: `Orbtrade-Demo-2026!`. Demo balances are posted through the ledger as `DEV_SEED` entries from a dev-only faucet account.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run typecheck` | Generate Prisma client + route types, run `tsc` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (with Tailwind class sorting) |
| `npm run db:migrate` | Create/apply a migration on the linked (dev) branch |
| `npm run db:deploy` | Apply committed migrations, e.g. to production |
| `npm run db:seed` | Seed demo data (refuses to run on `production`) |
| `npm run db:studio` | Browse the database |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright smoke tests (reuses a running dev server; set `E2E_EMAIL`/`E2E_PASSWORD` for signed-in checks) |
| `npm run test:ledger` | Integration test that attacks the ledger's database guarantees (dev branches only) |

## Database branches (Neon)

- `production`: the live database. Only receives committed migrations via `npm run db:deploy`. Never seeded.
- `dev`: day-to-day development (copy-on-write clone of production). Seed data and test accounts live here.

Switch with `neon checkout <branch>`; it rewrites the connection strings in `.env.local`. For risky migrations, create a throwaway branch: `neon checkout my-feature --create`.

## Environment variables

All variables are documented in [`.env.example`](.env.example). Secrets are read only on the server; anything prefixed `NEXT_PUBLIC_` is visible in the browser. Server variables are validated at startup (`src/server/env.ts`), and a misconfiguration fails with a clear message.

| Variable | Phase | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | 1 | prod | Public base URL (metadata, email links, passkey origin) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | 1 | no | Support address shown to users |
| `NEXT_PUBLIC_SUPPORT_PHONE` | 7 | no | Support line shown in the help centre |
| `COINGECKO_API_KEY` | 1 | no | CoinGecko key for higher rate limits |
| `COINGECKO_API_PLAN` | 1 | no | `demo` (default) or `pro`, which picks the auth header |
| `COINGECKO_API_BASE` | 1 | no | CoinGecko base URL (change for the Pro API) |
| `NEXT_PUBLIC_BINANCE_WS_URL` | 1 | no | Real-time price WebSocket (Binance public market data) |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | 2 | yes | Neon pooled (app) / direct (migrations) connection strings |
| `NEON_BRANCH` | 2 | no | Linked branch name; the seed script refuses `production` |
| `SESSION_SECRET` | 2 | yes | Keys the HMACs of session tokens and one-time codes |
| `DATA_ENCRYPTION_KEY` | 2 | yes | AES-256-GCM key for TOTP secrets and KYC files. **Back it up.** |
| `SESSION_IDLE_MINUTES` / `SESSION_MAX_HOURS` | 2 | no | Idle timeout (30) / absolute session length (12) |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `SENDGRID_API_KEY`, `EMAIL_FROM` | 2 | yes | Verification and notification emails (`console` in dev only) |
| `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | 2 | yes | SMS codes via Twilio Verify (`console` in dev only) |
| `BINANCE_REST_URL` | 3 | no | Price history for charts (Binance public market data) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | 3 | for push | Web Push keys (`npx web-push generate-vapid-keys`); blank = in-app notifications only |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 4 | for cards | Card deposits |
| `CRON_SECRET` | 4 | prod | Protects `/api/cron/process` (orders, withdrawals, alerts, recurring buys, statement notices) |
| `E2E_BASE_URL`, `E2E_EMAIL`, `E2E_PASSWORD` | 8 | no | Playwright smoke tests |

## Project structure

```
prisma/
  schema.prisma              Data model (users, sessions, codes, 2FA, security log, KYC, rate limits)
  migrations/                Committed SQL migrations
  seed.ts                    Development-only demo users
src/
  proxy.ts                   Per-request CSP nonce + optimistic auth redirect (no DB); real checks are in the DAL
  app/
    layout.tsx               Root layout: fonts, theme script, i18n provider
    (marketing)/             Public pages: landing, help, FAQ, about, careers, contact, listing request, legal placeholders
    (auth)/                  Register, login (+2FA), forgot/reset password, and their actions
    (onboarding)/onboarding/ Email code, phone code, 2FA setup, KYC upload
    (app)/                   Signed-in area: dashboard, accounts, trade, deposit/withdraw, history,
                             rewards, alerts, recurring, support, more, settings (security, API keys)
    admin/                   Staff area (RBAC + 2FA), incl. support inbox and listing requests
    api/market/              Public market data (tickers, candles, depth)
    api/v1/                  Public REST API (API-key auth)
    api/cron/process/        Background jobs
    r/[code]/                Referral links
  components/                UI: brand, theme, market, landing, layout, auth, ui
  config/                    Site constants, fee schedule, tracked coins, countries
  i18n/                      Locale config, dictionaries, server/client helpers
  lib/                       Shared utilities (formatting, password strength)
  server/                    Server-only: env, db, crypto, rate limits, notify (email/SMS),
    auth/                      sessions, DAL, codes, TOTP, passwords, security log
    kyc.ts                     document validation and encrypted storage
    ledger.ts, trading.ts      double-entry ledger, trading engine (loyalty fee discounts)
    rewards.ts, automation.ts  referrals, loyalty tiers, price alerts, recurring buys
    support.ts, statements.ts  tickets/chat, history, statement and tax PDFs/CSV
    api-keys.ts                API key issuance and bearer authentication
tests/
  unit/                      Vitest unit tests
  e2e/                       Playwright smoke tests
  ledger.integration.ts      Ledger guarantees against a dev branch
```

## Key design decisions

### Phase 1: UI

- **Theming.** Every colour is a CSS variable in `globals.css`, switched by `data-theme` on `<html>`. Dark is the default. An inline script applies the saved choice before first paint, so there's no flash.
- **Multi-language.** Copy lives in typed dictionaries (`src/i18n/dictionaries`); the locale comes from the `orb_locale` cookie. To add a language, see `src/i18n/config.ts`; TypeScript flags missing keys. Only English ships for now (multi-language was postponed); newer screens use inline English copy.
- **Live prices.** A CoinGecko snapshot (cached 60 s) plus a Binance public WebSocket for real-time ticks. If no data is available, the UI says so; it never shows made-up prices.
- **Testimonials and content.** Only admin-approved reviews from real customers are shown; promotions, articles and FAQ come from the admin panel (the Phase 1 `DEV_FIXTURES` samples were removed in Phase 5).
- **Fees.** Read from `src/config/fees.ts` until admins manage them in Phase 5. **Review before launch.**

### Phase 2: identity and security

- **Sessions.** A random 256-bit token lives in an httpOnly, SameSite=Lax cookie (`Secure` in production); the database stores only its HMAC. This makes "log out all devices" and per-device logout immediate. Idle timeout of 30 min, absolute limit of 12 h.
- **Passwords.** Argon2id (19 MiB, 2 passes, via WebAssembly, so there's no native build step). Minimum 12 characters, a common-password list, and no email address inside the password. Unknown emails are verified against a dummy hash, so response timing can't reveal which emails are registered.
- **One-time codes.** 6 digits, stored as HMACs. They expire after 10 minutes, have a 60 s resend cooldown and allow 5 attempts per code (counted atomically, so parallel guesses can't exceed the limit), with at most 5 sends per hour. SMS uses Twilio Verify, which generates and checks the code; Orbtrade still enforces its own limits.
- **2FA.** TOTP (works with any authenticator app). The secret is encrypted at rest, and there are 10 single-use recovery codes. **Each code works once**: the last accepted time step is stored, so a code can't be replayed within its window.
- **Rate limiting.** Postgres-backed fixed windows (shared across serverless instances) on registration, login (per IP and per email), 2FA attempts, code sends, password reset and KYC submissions.
- **KYC.** Front/back of ID plus a selfie (the phone camera opens directly for the selfie). Files are validated by their content (magic bytes), not by name, limited to 5 MB each, and **AES-256-GCM encrypted** before storage. Users can browse the dashboard with KYC pending; deposits and withdrawals will require approval (Phase 4). The review queue arrives with the admin panel (Phase 5).
- **Security log.** Registration, logins (including failures), 2FA changes, password resets, KYC submissions and session revocations, with device, IP and (where the host provides geo headers) location.
- **CSRF / XSS.** State changes go through Server Actions, which reject cross-origin requests. React escapes all output, and inputs are validated with Zod on the server.
- **Password reset** revokes every session and emails a notice. The reset request looks identical whether or not the email exists.

### Phase 3: money, dashboard and notifications

- **Double-entry ledger, enforced by Postgres.** Balances change only by inserting postings; a trigger applies each posting, locks the row and records `balance_after`. The database also rejects:
  - direct balance edits
  - updates or deletes of postings and journal entries (append-only)
  - entries that don't sum to zero per asset, checked at commit
  - negative user balances
  - postings whose asset doesn't match the ledger account's

  `npm run test:ledger` attacks each rule, including a concurrent double-spend, and reconciles every balance against its postings. Admin adjustments (Phase 5) must also be journal entries with a reason.
- **Accounts.** Every user gets a default Trading account and can open up to 5 (Trading/Savings). Transfers between their own accounts are instant. Each has an idempotency key, so a double-click or retry can't post twice.
- **Dashboard.** Total balance in USD plus a chosen local currency (20 currencies; CoinGecko FX rates, display only), 24h change, holdings donut, a live price chart (1D/1W/1M/1Y from Binance history, last point updated live), watchlist, quick actions and a news feed.
  - Charts follow the data-viz rules: a validated colour-blind-safe palette (light and dark), colours tied to assets rather than rank, ≤ 6 donut segments with the tail in "Other", the legend doubling as a full table, crosshair tooltips usable by keyboard, and screen-reader tables.
- **News.** Public RSS feeds (Cointelegraph, CoinDesk, Decrypt, The Block), treated as untrusted: plain-text titles, `https` links on the publisher's own domain only, `noopener`.
- **Notifications.** In-app notification centre (bell with unread count). Security events (new-device sign-in, password or 2FA changes), KYC updates, transfers and new accounts create notifications. **Web Push** is opt-in per device via `/sw.js`; permission is requested only when the user clicks "Turn on", and expired subscriptions are cleaned up automatically.
- **Mobile.** Signed-in pages get a native-style bottom tab bar that respects the iPhone home-indicator area.
- **Deposit / Withdraw / Trade** quick actions lead to clearly labelled "coming in Phase 4" screens.

### Phase 4: funding, trading and withdrawals

- **Trading.** Instant buy, sell and swap, plus limit orders; Orbtrade is the counterparty (a `BROKER` system account representing liquidity partners).
  - Prices are always set on the server (Binance latest price, 5 s cache). The price the user saw only bounds slippage (max 1%).
  - Amounts round in the platform's disfavour (quantities down, fees up), and every trade is one balanced journal entry.
  - Limit orders move funds to escrow when placed and fill at the limit price once the market reaches it: via `/api/cron/process` (protected by `CRON_SECRET`) and on Trade page loads. Cancelling returns the escrow.
  - The order book shows reference market depth from Binance, labelled as such.
  - A converter and fee calculator sit alongside.
- **Demo mode.** A separate DEMO account with $10,000 of virtual USD and separate `DEMO_*` system accounts. It's labelled DEMO everywhere, excluded from totals, transfers and withdrawals.
- **Deposits** (bank, card, crypto, mobile money):
  - Fees, limits and arrival time are shown up front.
  - A deposit is **Pending** until confirmed; crediting is idempotent.
  - Card payments use Stripe Checkout when `STRIPE_SECRET_KEY` is set; `/api/webhooks/stripe` verifies Stripe's signature (and a 5-minute timestamp window) before crediting.
  - Other providers plug into `src/server/funding.ts`. Until then they run in **sandbox mode (development only, refused in production)**: sandbox deposits and crypto addresses are labelled, with "Simulate confirmation" tools.
- **Withdrawals** (bank, card, crypto, mobile money):
  - Funds (amount + fee) move to `WITHDRAWAL_HOLD` at request time.
  - Each request needs an authenticator code, or an emailed code if 2FA is off.
  - Status tracker: Requested → Under review → Approved → Sent → Completed. Rejection comes with a reason and returns the held funds.
  - Scheduled withdrawals are supported.
  - Crypto can only go to **address-book entries confirmed by email code**.
  - Bank and phone details are encrypted at rest.
- **Limits by KYC level.** 24-hour deposit and withdrawal limits in USD value (`src/config/funding.ts`). Unverified users see a verification gate instead of the forms.
- **Tests.** `tests/reset-test-user.ts` resets rate limits and open orders for repeatable end-to-end runs on dev branches.

### Phase 5: admin panel (`/admin`)

- **Role-based access.**
  - SUPPORT: users and transactions.
  - COMPLIANCE: adds KYC review, deposit and withdrawal queues, suspensions and the audit log.
  - ADMIN: adds settings, coins, content and balance adjustments.
  - SUPER_ADMIN: adds staff roles.

  Staff must have 2FA enabled. Every page and Server Action checks its permission on the server (`src/server/admin/rbac.ts`), and the navigation only shows permitted sections.
- **Audit log.** Every staff action is recorded (actor, IP, target, details) in `admin_audit_logs`. The table is append-only, enforced by a database trigger. KYC document views are logged too.
- **KYC review.** Documents are decrypted on the fly, only for compliance staff, and served `no-store` / `nosniff`. Approving sets KYC level 1; rejecting requires a reason the customer sees. Staff can't review their own verification.
- **Queues.** Deposits are confirmed only after funds arrive (credited through the ledger, idempotently) or failed with a reason. Withdrawals move review → approve → sent (payout reference required) → completed, or are rejected (funds returned). Staff can't approve their own withdrawal.
- **Users.** Search, profile, balances, ledger history, security log, suspend/unsuspend (which signs the user out everywhere), role changes (super admin).
- **Balance adjustments** are `ADJUSTMENT` journal entries with a mandatory reason and the admin's ID. Admins can't edit balances silently, and the database rejects overdrafts.
- **Settings** (fees, KYC limits, rewards) are admin-editable, validated against strict schemas and effective within 15 s. The public fee table reads them live. **Coins & pairs**: enable/disable each coin and its trading pair.
- **Content.** Countdown promotions, blog and academy articles (Markdown), FAQ (replaces the built-in FAQ once any entry exists) and testimonial moderation. Customers submit reviews from the dashboard; only approved reviews from real users are public.
- **Overview.** Customers, 30-day trading volume, fee revenue, deposits and withdrawals, queue counts, and daily volume and sign-up charts.
- **Resilience.** Database connection-acquisition failures (e.g. Neon waking from scale-to-zero) are retried once; they occur before any SQL is sent, so they're safe. There's also a branded error page.
- **Moved to Phase 7:** support ticket inbox and live chat (built with the customer-facing support system).

### Phase 6: rewards and automation

- **Referrals.** Each customer gets a link (`/r/CODE`). Clicks are counted (IPs stored only as keyed hashes) and the code is remembered for 30 days. The bonus is paid **once** per referred customer when their completed deposits reach the admin-set threshold. Bonuses are REWARD journal entries from a `REWARDS` system account, and a unique constraint makes double payment impossible. The Rewards page shows the link, clicks, sign-ups, qualified referrals, earnings and referred friends (first name + initial only).
- **Loyalty tiers.** Based on 30-day real (non-demo) trading volume. Each tier's fee discount is applied by the trading engine itself, so the Trade page shows exactly what's charged. Tiers are editable in the admin panel.
- **Price alerts.** Up to 20 active per customer. Each alert fires once (claimed atomically), notifies in-app and optionally by email.
- **Recurring buys.** Daily, weekly or monthly, minimum ``, up to 10 per customer. Each run is an instant buy with an idempotency key derived from the schedule and its due time, so a retried job can't buy twice. Missed runs after downtime aren't back-filled. Failures are notified, and three in a row pause the schedule. The page states plainly that buying regularly doesn't guarantee a profit.
- **Navigation.** Desktop: Dashboard, Accounts, Markets, Trade, History, More. Phones: five tabs (Home, Markets, Trade, History, More). The **More** hub links everything else.
- Staking and gift cards were postponed.

### Phase 7: support, records and API

- **Support.** Customers open tickets (category + message) and reply in threads. A **live chat** widget on every signed-in page polls only while it's open. Staff use **Admin → Support inbox**: filters, assign to me, status (Open / Awaiting customer / Resolved / Closed) and replies, all audit-logged. Customers are notified in-app, and by email for tickets; emails never include the message itself. Message bodies render as plain text.
- **Public pages.** Help centre (topics, FAQ, chat/ticket/email/phone contacts), FAQ, About (placeholder for company and licence details), Careers, Contact, and a coin listing request form (rate-limited, honeypot, reviewed in Admin → Listing requests). The blog and academy links were removed, since those were postponed.
- **History.** All ledger activity with type, date and text filters, pagination and CSV export (formula-safe).
- **Monthly statements (PDF).** Opening and closing balances plus every transaction. On the 1st–3rd of each month, customers with activity get a "statement ready" notice, recorded in `statement_dispatches` so it's sent once.
- **Tax report** (CSV / PDF). Buys, sells, swaps (both legs valued in USD at execution) and rewards for a calendar year, labelled "not tax advice".
- **API keys + REST API.**
  - Endpoints: `GET /api/v1/account`, `GET /api/v1/prices`, `GET/POST /api/v1/orders` and `DELETE /api/v1/orders/{id}`.
  - READ or TRADE permission, a password needed to create a key, the key shown once and stored only as an HMAC, 120 requests/min, instant revoke.
  - `clientOrderId` makes order retries safe (409 on repeat).
  - Keys can never withdraw funds.

### Phase 8: security review, tests and deployment

- The full review and threat model are in **[SECURITY.md](SECURITY.md)**. Changes made in this phase:
  - nonce-based CSP with `strict-dynamic`;
  - `__Host-` session cookie in production;
  - Cross-Origin-Opener-Policy;
  - change-password with re-authentication;
  - HTML escaping in notice emails;
  - rate limits on every new endpoint;
  - an authorization and IDOR audit of every action and route;
  - `npm audit` at 0 (patched transitive versions via `overrides`).
- **Tests.**
  - Vitest unit tests (encryption, HMAC scoping, redirect safety, password policy, CSV injection, schedules, formatting).
  - Playwright smoke tests on desktop and mobile that fail on any CSP violation.
  - The ledger integration test.
  - The Phase 6–8 browser end-to-end run passed 62/63 checks. The one failure was the test's own assertion; the feature was verified manually.
- **CI.** GitHub Actions (`.github/workflows/ci.yml`) runs prisma validate, lint, typecheck, unit tests, audit and build, plus optional e2e against a disposable Neon branch.
- **Deployment.** **[DEPLOYMENT.md](DEPLOYMENT.md)** covers Vercel + Neon, environment variables, migrations, cron (`vercel.json`), Stripe webhooks, providers and the go-live checklist.

### Postponed

- Staking, gift cards, leaderboard, blog, academy and multi-language (the i18n scaffolding remains; English only).
- Passkey (WebAuthn) login.
- Real bank, crypto and mobile-money payment rails. These run in sandbox mode in development, which production refuses.