-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('FIAT', 'CRYPTO');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('TRADING', 'SAVINGS');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('TRANSFER', 'DEPOSIT', 'WITHDRAWAL', 'TRADE', 'FEE', 'ADJUSTMENT', 'DEV_SEED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SECURITY', 'ACCOUNT', 'KYC', 'TRANSFER', 'SYSTEM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'usd';

-- CreateTable
CREATE TABLE "assets" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "decimals" INTEGER NOT NULL,
    "coingecko_id" TEXT,
    "binance_symbol" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "system_code" TEXT,
    "asset_code" TEXT NOT NULL,
    "balance" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "allow_negative" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "type" "EntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "user_id" TEXT,
    "reason" TEXT,
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postings" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "ledger_account_id" TEXT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "balance_after" DECIMAL(38,18) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "user_id" TEXT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("user_id","asset_code")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_name_key" ON "accounts"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_account_id_asset_code_key" ON "ledger_accounts"("account_id", "asset_code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_system_code_asset_code_key" ON "ledger_accounts"("system_code", "asset_code");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_idempotency_key_key" ON "journal_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "journal_entries_user_id_created_at_idx" ON "journal_entries"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "postings_entry_id_idx" ON "postings"("entry_id");

-- CreateIndex
CREATE INDEX "postings_ledger_account_id_created_at_idx" ON "postings"("ledger_account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_asset_code_fkey" FOREIGN KEY ("asset_code") REFERENCES "assets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postings" ADD CONSTRAINT "postings_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postings" ADD CONSTRAINT "postings_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postings" ADD CONSTRAINT "postings_asset_code_fkey" FOREIGN KEY ("asset_code") REFERENCES "assets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_asset_code_fkey" FOREIGN KEY ("asset_code") REFERENCES "assets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===========================================================================
-- Ledger integrity, enforced by the database (not just the application).
-- ===========================================================================

-- A ledger account belongs to exactly one owner: a user account or the platform.
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_one_owner"
  CHECK (("account_id" IS NULL) <> ("system_code" IS NULL));

-- User balances can never go negative (system clearing accounts may).
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_non_negative"
  CHECK ("allow_negative" OR "balance" >= 0);

-- Postings move a non-zero amount.
ALTER TABLE "postings" ADD CONSTRAINT "postings_amount_non_zero" CHECK ("amount" <> 0);

-- 1) Inserting a posting is the ONLY way a balance changes. The trigger locks
--    the ledger account row (serialising concurrent postings), applies the
--    amount, and records the resulting balance on the posting.
CREATE FUNCTION apply_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  new_balance numeric(38, 18);
BEGIN
  UPDATE "ledger_accounts"
     SET "balance" = "balance" + NEW."amount"
   WHERE "id" = NEW."ledger_account_id" AND "asset_code" = NEW."asset_code"
  RETURNING "balance" INTO new_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'posting asset % does not match ledger account %', NEW."asset_code", NEW."ledger_account_id";
  END IF;
  NEW."balance_after" := new_balance;
  RETURN NEW;
END $$;

CREATE TRIGGER "postings_apply" BEFORE INSERT ON "postings"
  FOR EACH ROW EXECUTE FUNCTION apply_posting();

-- 2) Direct balance edits are rejected. Only the apply_posting trigger (nested,
--    so trigger depth > 1) may change a balance. Admin adjustments must be
--    journal entries with a reason, never silent edits.
CREATE FUNCTION guard_balance_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."balance" IS DISTINCT FROM OLD."balance" AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'balances change only through journal postings';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "ledger_accounts_guard_balance" BEFORE UPDATE ON "ledger_accounts"
  FOR EACH ROW EXECUTE FUNCTION guard_balance_update();

-- 3) History is append-only.
CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

CREATE TRIGGER "postings_append_only" BEFORE UPDATE OR DELETE ON "postings"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER "journal_entries_append_only" BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- 4) Double-entry: at commit, every entry has at least two postings and its
--    postings sum to zero for each asset.
CREATE FUNCTION check_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  entry text := CASE WHEN TG_TABLE_NAME = 'postings' THEN NEW."entry_id" ELSE NEW."id" END;
BEGIN
  IF (SELECT count(*) FROM "postings" WHERE "entry_id" = entry) < 2 THEN
    RAISE EXCEPTION 'journal entry % needs at least two postings', entry;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "postings" WHERE "entry_id" = entry
    GROUP BY "asset_code" HAVING sum("amount") <> 0
  ) THEN
    RAISE EXCEPTION 'journal entry % is unbalanced', entry;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "postings_balanced" AFTER INSERT ON "postings"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_entry_balanced();
CREATE CONSTRAINT TRIGGER "journal_entries_have_postings" AFTER INSERT ON "journal_entries"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_entry_balanced();

-- ===========================================================================
-- Reference data: supported assets (needed in every environment).
-- Enable/disable from the admin panel (Phase 5).
-- ===========================================================================
INSERT INTO "assets" ("code", "name", "type", "decimals", "coingecko_id", "binance_symbol", "sort_order") VALUES
  ('USD',  'US Dollar', 'FIAT',   2, NULL,          NULL,       0),
  ('BTC',  'Bitcoin',   'CRYPTO', 8, 'bitcoin',     'BTCUSDT',  1),
  ('ETH',  'Ethereum',  'CRYPTO', 8, 'ethereum',    'ETHUSDT',  2),
  ('SOL',  'Solana',    'CRYPTO', 6, 'solana',      'SOLUSDT',  3),
  ('USDT', 'Tether',    'CRYPTO', 2, 'tether',      NULL,       4),
  ('BNB',  'BNB',       'CRYPTO', 6, 'binancecoin', 'BNBUSDT',  5),
  ('XRP',  'XRP',       'CRYPTO', 4, 'ripple',      'XRPUSDT',  6),
  ('ADA',  'Cardano',   'CRYPTO', 4, 'cardano',     'ADAUSDT',  7),
  ('DOGE', 'Dogecoin',  'CRYPTO', 4, 'dogecoin',    'DOGEUSDT', 8),
  ('AVAX', 'Avalanche', 'CRYPTO', 6, 'avalanche-2', 'AVAXUSDT', 9),
  ('TRX',  'TRON',      'CRYPTO', 4, 'tron',        'TRXUSDT', 10),
  ('LINK', 'Chainlink', 'CRYPTO', 6, 'chainlink',   'LINKUSDT',11),
  ('DOT',  'Polkadot',  'CRYPTO', 6, 'polkadot',    'DOTUSDT', 12);