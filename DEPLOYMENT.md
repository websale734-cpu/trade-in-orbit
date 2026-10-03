# Deploying Orbtrade

This guide deploys Orbtrade to **Vercel** with **Supabase Postgres**, then covers the go-live checklist. It's written for whoever runs production.

> Orbtrade handles money and identity documents. Don't open it to the public until every item in the [go-live checklist](#go-live-checklist) is done, including licensing and legal review.

## 1. Database (Supabase)

Use a dedicated Supabase project for production, separate from development.

1. Get the production connection strings from the Supabase dashboard (Project Settings → Database → Connection string): the Transaction pooler URL (port 6543, append `?pgbouncer=true`) for the app, and the direct/Session URL (port 5432) for migrations.
2. Apply migrations, and nothing else, to production. Point `DATABASE_URL_UNPOOLED` (and `DATABASE_ENV=production`) at the production project, then:
   ```bash
   npm run db:deploy               # prisma migrate deploy: only committed migrations
   ```
   **Never run `db:seed` against production.** The seed script refuses to anyway (it checks `DATABASE_ENV`).
3. Recommended:
   - enable Point-in-Time Recovery on the production project (paid plans);
   - add the app's egress IPs to the network restrictions / allow list if your plan supports it;
   - rehearse every risky migration against a disposable Supabase project or branch first.

## 2. Environment variables

Set these in Vercel → Project → Settings → Environment Variables (Production). [`.env.example`](.env.example) documents each one.

| Required | Variables |
| --- | --- |
| Always | `NEXT_PUBLIC_APP_URL` (your https domain), `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct), `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET` |
| Email | `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (or `sendgrid` + `SENDGRID_API_KEY`), `EMAIL_FROM` (a verified sender) |
| SMS | `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` |
| Card deposits | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Bank deposits | `BANK_ACCOUNT_NAME`, `BANK_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_ROUTING` |
| Push (optional) | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`npx web-push generate-vapid-keys`) |
| Optional | `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_PHONE`, `COINGECKO_API_KEY` (+ `COINGECKO_API_PLAN`, `COINGECKO_API_BASE`), `SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS` |

Generate the secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it once each for `SESSION_SECRET`, `DATA_ENCRYPTION_KEY` and `CRON_SECRET`, using different values.

- **Back up `DATA_ENCRYPTION_KEY`** in a password manager or KMS. Without it, KYC files, 2FA secrets and saved bank details can't be decrypted.
- Rotating `SESSION_SECRET` signs everyone out and invalidates API keys, pending codes and 2FA challenges.

The app validates its server environment at runtime and refuses to serve pages when it is misconfigured. For example, `console` email/SMS providers are rejected in production.

## 3. Vercel project

1. Import the Git repository in Vercel. The framework preset is Next.js and the build command is `npm run build` (it runs `prisma generate` first).
2. Set the environment variables above and deploy.
3. Add your custom domain. HTTPS is required: the session cookie is `__Host-` and HSTS is sent.
4. **Background jobs.** `vercel.json` schedules `GET /api/cron/process` every minute. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set. Per-minute crons need a Vercel Pro plan; on Hobby, call the endpoint every minute from an external scheduler with that header. The job:
   - fills limit orders;
   - releases scheduled withdrawals;
   - triggers price alerts;
   - executes recurring buys;
   - sends monthly "statement ready" notices on the 1st–3rd of each month.

## 4. Providers

- **Stripe (card deposits).** Create a webhook endpoint at `https://<domain>/api/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
- **Resend / SendGrid.** Verify your sending domain (SPF, DKIM, DMARC) and use it in `EMAIL_FROM`.
- **Twilio Verify.** Create a Verify service and enable the SMS channel. Consider geo-permissions to block high-fraud regions.
- **Bank, crypto and mobile-money rails.** Until contracted providers are wired into `src/server/funding.ts`, those methods run in sandbox mode, which production refuses. Connect real providers (and a custody partner for crypto addresses) before enabling them.
- **Market data.** CoinGecko works without a key but is rate-limited; a paid key is recommended. Binance public market data needs no key.

## 5. First deploy

1. Create the first super admin: register normally, verify, enable 2FA, then promote the account in the database:
   ```sql
   UPDATE users SET role = 'SUPER_ADMIN' WHERE email = 'you@yourcompany.com';
   ```
   After that, manage roles from Admin → Users.
2. In Admin → Fees, limits & rewards, review the fee schedule, KYC limits, loyalty tiers and referral bonus amounts. **Only offer referral bonuses where they're legally allowed.**
3. In Admin → Coins & pairs, enable the coins you are licensed and able to offer.
4. In Admin → Content, add FAQ entries. Promotions and reviews start empty; only real customer reviews are ever shown.

## 6. Operating

- **Monitoring.** Watch Vercel logs for `[cron]`, `[trade]`, `[admin]` and `[api/orders]` errors. Add an uptime check on `/` and alerting on 5xx rates.
- **Ledger integrity.** Run `npm run test:ledger` against a disposable copy of production (e.g. a restored Supabase project or branch), never production itself. The ledger triggers enforce integrity continuously; reconcile the `BROKER` and `FEES` system accounts against partner statements.
- **Backups.** Supabase automated backups / Point-in-Time Recovery, plus periodic logical dumps (`pg_dump`) stored encrypted.
- **Migrations.** Every schema change goes through `prisma/migrations`. Rehearse on a disposable project, then run `npm run db:deploy`. Never edit production by hand.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

- `prisma validate`, lint, typecheck, unit tests (Vitest), `npm audit --audit-level=high` and a production build;
- **optionally**, Playwright smoke tests against a disposable Supabase CI project. To enable them, set the repo variable `E2E_ENABLED=true` and the secrets `CI_DATABASE_URL`, `CI_DATABASE_URL_UNPOOLED`, `CI_SESSION_SECRET` and `CI_DATA_ENCRYPTION_KEY`. **Never point CI at production.**

## Go-live checklist

- [ ] Licences and registrations for every jurisdiction served (e.g. VASP / money transmitter); AML officer appointed.
- [ ] Terms, Privacy, Risk and AML pages replaced with lawyer-reviewed text (they're placeholders now), and `TERMS_VERSION` bumped in `src/app/(auth)/actions.ts`.
- [ ] About page company details, registration and licence numbers filled in.
- [ ] Custody and liquidity partners contracted; real deposit and withdrawal rails connected; sandbox flows confirmed disabled.
- [ ] Email and SMS providers live with verified sender domains.
- [ ] Stripe live keys and webhook configured.
- [ ] All secrets set, different from development, with `DATA_ENCRYPTION_KEY` backed up.
- [ ] Migrations applied to production with `npm run db:deploy`. No seed data in production.
- [ ] Cron running every minute (check the response of `/api/cron/process` in logs).
- [ ] Super admin created with 2FA; staff accounts least-privilege.
- [ ] Fees, limits, rewards and coin list reviewed in the admin panel.
- [ ] Independent penetration test done and findings fixed (see [SECURITY.md](SECURITY.md)).
- [ ] Uptime monitoring, error alerting and backups in place.
