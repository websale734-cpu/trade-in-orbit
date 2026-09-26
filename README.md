# Orbtrade

A crypto brokerage web platform: registration and KYC, funded accounts, trading, withdrawals, rewards and a full admin panel.

Built with **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4**, with **PostgreSQL on Neon via Prisma 7**.

> **Before going live:** operating a crypto brokerage requires licensing (e.g. VASP / money-transmitter registration) in each jurisdiction you serve, plus custody and liquidity partners. The legal pages are placeholders for lawyer-reviewed text. Payment and blockchain integrations run behind provider interfaces and must be connected to real, contracted providers.

## Build status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Project setup, design system, landing page, dark/light mode | ✅ Done |
| 2 | Registration, email + SMS codes, login, 2FA, KYC upload | ✅ Done |
| 3 | Dashboard, accounts, live prices, watchlist | ⏳ Next |
| 4 | Deposits, trading, order book, withdrawals, ledger | |
| 5 | Admin panel | |
| 6 | Rewards, referrals, staking, alerts, recurring buys, gift cards | |
| 7 | Support, content pages, reports, API keys, multi-language | |
| 8 | Security review, testing, mobile polish, deployment guide | |

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

**Demo accounts** (after `db:seed`, dev branches only): `demo@orbtrade.dev` (KYC not started) and `verified@orbtrade.dev` (KYC approved). Password for both: `Orbtrade-Demo-2026!`.

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
| `DEV_FIXTURES` | 1 | no | `true` shows **development-only** sample content; ignored in production |
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
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 4 | for cards | Card deposits |

## Project structure

```
prisma/
  schema.prisma              Data model (users, sessions, codes, 2FA, security log, KYC, rate limits)
  migrations/                Committed SQL migrations
  seed.ts                    Development-only demo users
src/
  proxy.ts                   Optimistic auth redirect (no DB); real checks are in the DAL
  app/
    layout.tsx               Root layout: fonts, theme script, i18n provider
    (marketing)/             Public pages: landing, legal placeholders, "coming soon" pages
    (auth)/                  Register, login (+2FA), forgot/reset password, and their actions
    (onboarding)/onboarding/ Email code, phone code, 2FA setup, KYC upload
    (app)/                   Signed-in area: dashboard, settings/security
    api/market/tickers/      Public market snapshot (JSON)
  components/                UI: brand, theme, market, landing, layout, auth, ui
  config/                    Site constants, fee schedule, tracked coins, countries
  i18n/                      Locale config, dictionaries, server/client helpers
  lib/                       Shared utilities (formatting, password strength)
  server/                    Server-only: env, db, crypto, rate limits, notify (email/SMS),
    auth/                      sessions, DAL, codes, TOTP, passwords, security log
    kyc.ts                     document validation and encrypted storage
```

## Key design decisions

### Phase 1: UI

- **Theming.** Every colour is a CSS variable in `globals.css`, switched by `data-theme` on `<html>`. Dark is the default. An inline script applies the saved choice before first paint, so there's no flash.
- **Multi-language.** Copy lives in typed dictionaries (`src/i18n/dictionaries`); the locale comes from the `orb_locale` cookie. To add a language, see `src/i18n/config.ts`; TypeScript flags missing keys. (Server-side validation messages are English for now; they move into dictionaries in Phase 7.)
- **Live prices.** A CoinGecko snapshot (cached 60 s) plus a Binance public WebSocket for real-time ticks. If no data is available, the UI says so; it never shows made-up prices.
- **Testimonials and seed content.** Only admin-approved real reviews are shown. Development samples are labelled `[DEV SAMPLE]` and appear only with `DEV_FIXTURES=true` outside production.
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

### Deferred (tracked)

- Passkey / biometric login (WebAuthn) and the withdrawal address book: planned alongside withdrawals (Phase 4) and the security review (Phase 8).
- A nonce-based Content-Security-Policy: Phase 8.
- `npm audit` reports advisories in `mysql2`, a transitive dependency of the Prisma tooling. Orbtrade doesn't use MySQL; the suggested fix is a downgrade to Prisma 6, so it's left as is and will be re-checked in Phase 8.
