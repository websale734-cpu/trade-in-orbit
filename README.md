# Orbtrade

A crypto brokerage web platform: registration and KYC, funded accounts, trading, withdrawals, rewards and a full admin panel.

Built with **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4**, with PostgreSQL via Prisma arriving in Phase 2.

> **Before going live:** operating a crypto brokerage requires licensing (e.g. VASP / money-transmitter registration) in each jurisdiction you serve, plus custody and liquidity partners. The legal pages are placeholders for lawyer-reviewed text. Payment and blockchain integrations run behind provider interfaces and must be connected to real, contracted providers.

## Build status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Project setup, design system, landing page, dark/light mode | ✅ Done |
| 2 | Registration, email + SMS codes, login, 2FA, KYC upload | ⏳ Next |
| 3 | Dashboard, accounts, live prices, watchlist | |
| 4 | Deposits, trading, order book, withdrawals, ledger | |
| 5 | Admin panel | |
| 6 | Rewards, referrals, staking, alerts, recurring buys, gift cards | |
| 7 | Support, content pages, reports, API keys, multi-language | |
| 8 | Security review, testing, mobile polish, deployment guide | |

## Getting started

Requirements: **Node.js 20.9+** (developed on Node 24).

```bash
npm install
cp .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
npm run dev                  # http://localhost:3000
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run typecheck` | Generate route types and run `tsc` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (with Tailwind class sorting) |

## Environment variables

All variables are documented in [`.env.example`](.env.example). Secrets are read only on the server; anything prefixed `NEXT_PUBLIC_` is visible in the browser.

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
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | 2 | yes | Postgres pooled / direct connection strings |
| `SESSION_SECRET` | 2 | yes | Signs session tokens |
| `DATA_ENCRYPTION_KEY` | 2 | yes | AES-256-GCM key for sensitive fields at rest |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `SENDGRID_API_KEY`, `EMAIL_FROM` | 2 | yes | Verification and notification emails |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | 2 | yes | SMS verification codes |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 4 | for cards | Card deposits |

## Project structure

```
src/
  app/
    layout.tsx               Root layout: fonts, theme script, i18n provider
    loading.tsx, not-found.tsx
    (marketing)/             Public pages (header + footer shell)
      page.tsx               Landing page
      legal/[slug]/          Terms, Privacy, Risk Disclosure, AML/KYC (placeholders)
      [page]/                Temporary "coming in Phase N" pages for linked routes
    api/market/tickers/      Public market snapshot (JSON)
  components/
    brand/                   Logo, branded orb loader
    theme/                   Pre-paint theme script + toggle
    market/                  Live market provider (WebSocket), ticker, sparklines, charts
    landing/                 Landing page sections
    layout/                  Header, footer, promotion banner
    ui/                      Buttons, sections, scroll-reveal
  config/                    Site constants, default fee schedule, tracked coins
  i18n/                      Locale config, dictionaries, server/client helpers
  lib/                       Utilities, market data (CoinGecko client)
  server/                    Server-only data access (content, dev fixtures)
```

## Key design decisions

- **Theming.** Every colour is a CSS variable in `globals.css`, switched by `data-theme` on `<html>`. Dark is the default. An inline script applies the saved choice before first paint, so there's no flash. Tailwind's `dark:` variant follows `data-theme`, not the OS setting.
- **Multi-language.** Copy lives in typed dictionaries (`src/i18n/dictionaries`). The locale comes from the `orb_locale` cookie, so URLs stay clean. To add a language, see the steps in `src/i18n/config.ts`; TypeScript flags any missing keys.
- **Live prices.** The server fetches a CoinGecko snapshot (price, 24h change, 7-day sparkline), cached for 60 s and shared across requests. In the browser, a Binance public WebSocket streams real-time prices, and a REST poll every 60 s is the fallback. If no data is available, the UI says so; it never shows made-up prices.
- **Testimonials.** Only admin-approved reviews from real customers are shown. With none approved, the section shows an empty state.
- **Fees.** The public fee table reads `src/config/fees.ts` (basis points) until admins manage fees in Phase 5. **Review these values before launch.**
- **Seed data.** Development sample content lives only in `src/server/dev-fixtures.ts` and is off unless `DEV_FIXTURES=true` **and** `NODE_ENV` isn't `production`. Every sample is labelled `[DEV SAMPLE]`.
- **Security headers.** HSTS, `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy and a permissions policy are set in `next.config.ts`. A nonce-based CSP follows in Phase 8.
