-- Crypto-only deposits: record the network and the platform wallet address the customer sent to.
ALTER TABLE "deposits" ADD COLUMN "network" TEXT;
ALTER TABLE "deposits" ADD COLUMN "wallet_address" TEXT;
