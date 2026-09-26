import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { API_RATE, MAX_KEYS } from "@/server/api-keys";
import { siteConfig } from "@/config/site";
import { revokeKey } from "./actions";
import { CreateKeyForm } from "./create-key-form";

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
  const keys = await db.apiKey.findMany({ where: { userId: user.id }, orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }], take: 20 });
  const active = keys.filter((k) => !k.revokedAt);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">API keys</h1>
        <p className="mt-1 text-sm text-muted">
          For advanced traders and tools. Treat keys like passwords: anyone with a trading key can place orders on your
          account. Keys can never withdraw funds.
        </p>
      </div>

      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4 text-accent" /> Create a key
        </h2>
        {active.length >= MAX_KEYS ? (
          <p className="mt-3 text-sm text-muted">You have {MAX_KEYS} active keys, the maximum. Revoke one to create another.</p>
        ) : (
          <CreateKeyForm />
        )}
      </section>

      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
        <h2 className="font-semibold">Your keys</h2>
        {keys.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No keys yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm" data-testid="key-list">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {k.name}{" "}
                    <span className="ml-1 rounded bg-surface-strong px-1.5 py-0.5 text-xs font-semibold text-muted">
                      {k.permission === "TRADE" ? "Trade" : "Read only"}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    <span className="font-mono">orb_{k.prefix}_…</span> · created <LocalTime date={k.createdAt.toISOString()} />
                    {k.lastUsedAt && (
                      <>
                        {" "}
                        · last used <LocalTime date={k.lastUsedAt.toISOString()} />
                      </>
                    )}
                  </p>
                </div>
                {k.revokedAt ? (
                  <span className="text-xs text-muted">Revoked</span>
                ) : (
                  <form action={revokeKey}>
                    <input type="hidden" name="id" value={k.id} />
                    <button type="submit" className="text-sm font-medium text-down hover:underline">
                      Revoke
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass rounded-[var(--radius-card)] p-5 text-sm sm:p-6">
        <h2 className="font-semibold">Quick reference</h2>
        <p className="mt-2 text-muted">
          Send your key as a bearer token. Limit: {API_RATE.limit} requests per minute per key.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-strong p-3 text-xs">
          {`curl -H "Authorization: Bearer orb_xxx_yyy" ${siteConfig.url}/api/v1/account`}
        </pre>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-line">
              {ENDPOINTS.map(([method, path, perm, desc]) => (
                <tr key={method + path}>
                  <td className="py-2 pr-3 font-mono font-semibold">{method}</td>
                  <td className="py-2 pr-3 font-mono">{path}</td>
                  <td className="py-2 pr-3 text-muted">{perm}</td>
                  <td className="py-2 text-muted">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-surface-strong p-3 text-xs">
          {`POST /api/v1/orders
{ "type": "market", "side": "BUY", "base": "BTC", "amount": "50",
  "clientOrderId": "<uuid, makes retries safe>" }
{ "type": "limit", "side": "SELL", "base": "ETH", "quantity": "0.5",
  "limitPrice": "4200", "clientOrderId": "<uuid>" }`}
        </pre>
        <p className="mt-2 text-xs text-muted">Market BUY amount is USD to spend (fee included); market SELL amount is the coin quantity.</p>
      </section>
    </div>
  );
}
