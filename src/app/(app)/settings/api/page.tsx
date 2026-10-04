import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { API_RATE, MAX_KEYS } from "@/server/api-keys";
import { siteConfig } from "@/config/site";
import { revokeKey } from "./actions";
import { CreateKeyForm } from "./create-key-form";
import { EmptyState, PageHeader, PageStack, Panel } from "@/components/app/ui";

export const metadata: Metadata = { title: "API keys" };

const ENDPOINTS = [
  ["GET", "/api/v1/account", "READ", "Accounts and balances"],
  ["GET", "/api/v1/prices", "READ", "Live prices for tradable coins"],
  ["GET", "/api/v1/orders?status=OPEN", "READ", "Your orders (OPEN, FILLED, CANCELLED)"],
  ["POST", "/api/v1/orders", "TRADE", "Place a market or limit order"],
  ["DELETE", "/api/v1/orders/{id}", "TRADE", "Cancel an open limit order"],
];

export default async function ApiKeysPage() {
  const { user } = await requireUser("/settings/api");
  const keys = await db.apiKey.findMany({
    where: { userId: user.id },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    take: 20,
  });
  const active = keys.filter((k) => !k.revokedAt);

  const code =
    "rounded-xl border border-line bg-surface-strong p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]";

  return (
    <PageStack>
      <PageHeader
        title="API keys"
        subtitle="For advanced traders and tools. Treat keys like passwords: anyone with a trading key can place orders on your account. Keys can never withdraw funds."
      />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <Panel
            title={
              <span className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-accent" /> Create a key
              </span>
            }
          >
            {active.length >= MAX_KEYS ? (
              <p className="text-sm text-muted">
                You have {MAX_KEYS} active keys, the maximum. Revoke one to create another.
              </p>
            ) : (
              <CreateKeyForm />
            )}
          </Panel>

          <Panel title="Your keys">
            {keys.length === 0 ? (
              <EmptyState icon={<KeyRound className="h-5 w-5" />} title="No keys yet." />
            ) : (
              <ul className="divide-y divide-line text-sm" data-testid="key-list">
                {keys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-3 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className="min-w-0 break-words">{k.name}</span>
                        <span className="rounded-full bg-surface-strong px-2.5 py-0.5 text-xs font-semibold text-muted">
                          {k.permission === "TRADE" ? "Trade" : "Read only"}
                        </span>
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted">
                        <span className="font-mono">orb_{k.prefix}_…</span> · created{" "}
                        <LocalTime date={k.createdAt.toISOString()} />
                        {k.lastUsedAt && (
                          <>
                            {" "}
                            · last used <LocalTime date={k.lastUsedAt.toISOString()} />
                          </>
                        )}
                      </p>
                    </div>
                    {k.revokedAt ? (
                      <span className="rounded-full bg-surface-strong px-2.5 py-1 text-xs text-muted">Revoked</span>
                    ) : (
                      <form action={revokeKey}>
                        <input type="hidden" name="id" value={k.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-down transition-colors hover:border-down/40"
                        >
                          Revoke
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          title="Quick reference"
          description={`Send your key as a bearer token. Limit: ${API_RATE.limit} requests per minute per key.`}
          className="text-sm"
        >
          <pre className={code}>{`curl -H "Authorization: Bearer orb_xxx_yyy" ${siteConfig.url}/api/v1/account`}</pre>
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {ENDPOINTS.map(([method, path, perm, desc]) => (
              <li key={method + path} className="py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-surface-strong px-2 py-0.5 font-mono text-xs font-semibold">
                    {method}
                  </span>
                  <span className="min-w-0 font-mono text-xs [overflow-wrap:anywhere]">{path}</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  <span className="font-medium">{perm}</span> · {desc}
                </p>
              </li>
            ))}
          </ul>
          <pre className={`${code} mt-5`}>
            {`POST /api/v1/orders
{ "type": "market", "side": "BUY", "base": "BTC", "amount": "50",
  "clientOrderId": "<uuid, makes retries safe>" }
{ "type": "limit", "side": "SELL", "base": "ETH", "quantity": "0.5",
  "limitPrice": "4200", "clientOrderId": "<uuid>" }`}
          </pre>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Market BUY amount is USD to spend (fee included); market SELL amount is the coin quantity.
          </p>
        </Panel>
      </div>
    </PageStack>
  );
}
