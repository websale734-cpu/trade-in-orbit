# Security

This document records Orbtrade's security model and the results of the Phase 8 security review. It's written for engineers working on the codebase and for auditors.

To report a vulnerability, email the address in `NEXT_PUBLIC_SUPPORT_EMAIL` with "SECURITY" in the subject. Please don't open a public issue.

## Security model

### Identity and sessions

- **Sessions.** Random 256-bit tokens in an httpOnly, `SameSite=Lax` cookie. In production the cookie is `__Host-orb_session`: HTTPS only, host-only, path `/`, so no subdomain can set or read it. The database stores only an HMAC of the token, so revocation is immediate. Sessions time out after 30 minutes idle and 12 hours in total.
- **Passwords.** Argon2id, minimum 12 characters, with a common-password list and no email address inside the password. Timing for unknown emails matches known ones.
  - Changing a password requires the current password, plus a 2FA code when 2FA is on. It signs out every other device and sends an email notice.
  - Resetting a password revokes all sessions.
- **2FA.** TOTP secrets are encrypted with AES-256-GCM, and each code can be used only once (replay protection). There are 10 single-use recovery codes. 2FA is mandatory for all staff.
- **One-time codes.** Email and SMS codes are stored as HMACs. They expire after 10 minutes, allow 5 attempts per code (counted atomically) and 5 sends per hour.

### Authorization

- **Data Access Layer.** Every page, Server Action and route handler checks the session on the server: `requireUser` / `requireSession` in `src/server/auth/dal.ts`, and `requirePermission` / `assertPermission` in `src/server/admin/rbac.ts`. `src/proxy.ts` only does an optimistic redirect; it is never the only guard.
- **Ownership.** Queries for customer-owned records are scoped by `userId`: accounts, orders, alerts, recurring buys, tickets, API keys and sessions. Someone else's ID matches nothing and returns a 404, not a 403, so IDs can't be probed.
- **Staff roles.** SUPPORT, COMPLIANCE, ADMIN and SUPER_ADMIN, with least privilege. Every staff state change is written to an append-only audit log, protected by a database trigger. Staff can't approve their own KYC or withdrawals.

### Money

- **Double-entry ledger enforced by Postgres triggers.** Postings are append-only, entries must balance per asset (checked at commit), direct balance edits are rejected, and user balances can't go negative. `npm run test:ledger` attacks each of these rules.
- **Pricing.** Prices are always set on the server. The client's price only bounds slippage, and rounding always goes in the platform's disfavour.
- **Idempotency keys** on transfers, trades, swaps, limit orders (the API's `clientOrderId`), deposits, referral bonuses and recurring-buy runs. A retry can never post twice.
- **Withdrawals.** Each request needs 2FA or an email code. Crypto can only go to address-book entries confirmed by email, and every withdrawal passes staff review.
- **Referral bonuses** are paid once per referred customer, enforced by a unique constraint. They're paid only after KYC-gated deposits reach the threshold, and they come from a dedicated `REWARDS` ledger account so they're auditable.

### Data protection

- **Encrypted at rest (AES-256-GCM).** KYC documents, TOTP secrets, and bank and phone withdrawal details. The `DATA_ENCRYPTION_KEY` must be backed up.
- **KYC documents** are decrypted only for compliance staff and served `no-store` / `nosniff`. Every view is audit-logged.
- **Monthly statements** are generated on demand behind login and never sent as email attachments. Notice emails contain only a link.
- **Stored only as HMACs:** API key secrets, session tokens, codes, and referral-click IPs.

### Browser hardening

- **Content Security Policy** with a per-request nonce, set in `src/proxy.ts`:
  - `script-src 'self' 'nonce-…' 'strict-dynamic'`, with no `unsafe-inline` and no `unsafe-eval` in production.
  - `frame-ancestors 'none'`, `object-src 'none'` and `base-uri 'self'`.
  - `form-action` is limited to self and Stripe Checkout.
  - `connect-src` is limited to self and the Binance market-data WebSocket.
- **Nonced inline scripts.** The two inline scripts (the theme applied before paint, and local time formatting) carry the nonce.
- **API responses** get `default-src 'none'`.
- **Other headers:** HSTS (2 years, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`.
- **CSRF.** Server Actions reject cross-origin requests. The public API uses bearer tokens (no cookies), so it isn't exposed to CSRF.
- **XSS.** React escapes all output. User-supplied text (tickets, chat, listing requests, reviews) is rendered as plain text. Email templates HTML-escape their inputs. RSS news is treated as untrusted.
- **CSV exports** neutralise spreadsheet formulas: cells starting with `= + - @` get a `'` prefix.

### Public API (`/api/v1`)

- **Key format:** `orb_<prefix>_<secret>`. Only an HMAC of the secret is stored, and the full key is shown once. Keys are compared in constant time, including when the prefix is unknown.
- **Creating a key** requires the account password (rate-limited). It's logged in the security log and triggers a security notification.
- **Permissions.** READ keys can view data; TRADE keys can also place and cancel orders. **No key can withdraw or move funds**, and API trading is always real money, never demo.
- **Limits and checks:** 120 requests per minute per key. Suspended or not fully onboarded accounts are rejected. Keys can be revoked instantly.

### Abuse controls (rate limits, Postgres-backed)

| What | Limit |
| --- | --- |
| Registration / password reset | 10 per IP per hour |
| Login | 30 per IP and 8 per email per 15 min |
| 2FA attempts | 5 per login challenge |
| Code sends | 5 per user per hour |
| KYC submissions | 5 per user per day |
| Support messages / new tickets | 30 per 10 min / 10 per day |
| API key creation (password checks) | 5 per 15 min |
| Password change attempts | 5 per 15 min |
| Statement / tax / CSV downloads | 30 per 10 min |
| Coin listing requests | 5 per IP per day, plus a honeypot field |
| Public API | 120 per key per minute |
| Price alerts / recurring buys | at most 20 / 10 active per user |

## Phase 8 review: what was checked

1. **Authorization audit.** Every exported Server Action and route handler was listed and checked for a server-side guard. The only unguarded ones are intentionally public:
   - the login, register and reset flows (rate-limited);
   - the read-only market-data proxies (which accept only known assets and timeframes and are cached, so they can't be used as open proxies);
   - the referral redirect;
   - a redirect-only action.
2. **IDOR.** Ticket, alert, recurring-buy, API-key, order and session mutations are all scoped by owner. The e2e suite confirms that another customer gets a 404 on a ticket URL.
3. **Injection.** All database access goes through Prisma or tagged-template `$queryRaw`, which is parameterised. There is no string-built SQL.
4. **Dependencies.** `npm audit` reports 0 vulnerabilities. Patched transitive versions of `mysql2` and `deepmerge-ts` (pulled in by the Prisma CLI) are pinned via `overrides` in `package.json`.
5. **Secrets.** `.env.local`, `.neon` and the generated client are git-ignored, and no secrets are in the repo. Production refuses `console` email/SMS providers and sandbox payment flows.
6. **Fixes made during the review:**
   - added the nonce CSP;
   - switched the session cookie to `__Host-`;
   - added `Cross-Origin-Opener-Policy`;
   - added change-password with re-authentication;
   - added HTML escaping in notice emails;
   - added idempotency for API limit orders;
   - added rate limits on all new endpoints;
   - cleared the dependency advisories.

## Known limitations and follow-ups

- **Passkeys (WebAuthn)** aren't implemented yet. TOTP 2FA is available and required for staff.
- **`style-src 'unsafe-inline'`** remains, for inline style attributes (dynamic widths and colours). It doesn't allow script execution, but a hashed or nonced style policy would be stricter.
- **Referral fraud.** Self-referral through a second account is limited by KYC (one verified identity and phone per person) and the deposit threshold. Compliance should still review unusual referral clusters.
- **Rate limits** are fixed-window. A distributed attacker can spread attempts across IPs. The per-email login limit and 2FA cover the main risk; add a WAF or bot protection at the edge for production.
- **Legal and licensing.** Operating a brokerage needs licences (e.g. VASP registration) and lawyer-reviewed legal pages. The legal pages in this repo are placeholders.
- **Penetration test.** Commission an independent penetration test before launch.
