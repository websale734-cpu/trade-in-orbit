"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, Copy } from "lucide-react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { buttonClasses } from "@/components/ui/button";
import { useMarket } from "@/components/market/market-provider";
import { CoinIcon } from "@/components/market/coin-icon";
import { SandboxBadge } from "@/components/app/kyc-gate";
import { formatQty } from "@/lib/assets";
import { submitDeposit } from "./actions";

export type DepositCoin = {
  code: string;
  name: string;
  networks: { id: string; label: string; address: string | null; qr: string | null }[];
};

/**
 * Crypto deposit in three steps: pick a coin, pick its network (only for coins
 * on several networks, e.g. USDT), then send to the address shown and tell us
 * the amount. That records a Pending deposit; an admin approves it once the
 * funds arrive.
 */
export function DepositForm({ coins, sandbox }: { coins: DepositCoin[]; sandbox: boolean }) {
  const { tickers } = useMarket();
  const [code, setCode] = useState<string | null>(null);
  const [networkId, setNetworkId] = useState<string | null>(null);
  const coin = coins.find((c) => c.code === code) ?? null;
  const network =
    coin && (coin.networks.length === 1 ? coin.networks[0] : coin.networks.find((n) => n.id === networkId));
  const icon = (c: string, size = 36) => (
    <CoinIcon src={tickers.find((t) => t.symbol === c)?.image ?? null} symbol={c} size={size} />
  );
  const reset = () => {
    setCode(null);
    setNetworkId(null);
  };

  if (!coin)
    return (
      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6" aria-label="Choose a coin">
        <h2 className="text-base font-semibold sm:text-lg">Which coin are you depositing?</h2>
        <p className="mt-1 text-sm text-muted">Choose a coin to see its deposit address and QR code.</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {coins.map((c) => {
            const available = c.networks.some((n) => n.address);
            return (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => setCode(c.code)}
                  className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-strong"
                >
                  {icon(c.code)}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{c.code}</span>
                    <span className="block truncate text-sm text-muted">
                      {available
                        ? c.networks.length > 1
                          ? `${c.name} · ${c.networks.length} networks`
                          : c.name
                        : `${c.name} · not available yet`}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );

  const back = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm font-medium text-accent hover:underline"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );

  if (!network)
    return (
      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6 lg:max-w-3xl" aria-label="Choose a network">
        {back("Choose another coin", reset)}
        <h2 className="mt-3 flex items-center gap-3 text-base font-semibold sm:text-lg">
          {icon(coin.code, 28)} Which network will you send {coin.code} on?
        </h2>
        <p className="mt-1 text-sm text-muted">
          Each network has its own address. Pick the same network you&apos;ll send from.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Network">
          {coin.networks.map((n) => (
            <button
              key={n.id}
              type="button"
              role="radio"
              aria-checked={false}
              onClick={() => setNetworkId(n.id)}
              className="flex items-center justify-between gap-3 rounded-xl border border-line p-4 text-left transition-colors hover:border-line-strong hover:bg-surface-strong"
            >
              <span>
                <span className="block font-semibold">{n.label}</span>
                <span className="block text-sm text-muted">
                  {n.address ? `${coin.code} on ${n.id}` : "Not available yet"}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            </button>
          ))}
        </div>
      </section>
    );

  return (
    <SendStep
      key={`${coin.code}:${network.id}`}
      coin={coin}
      network={network}
      icon={icon(coin.code, 28)}
      sandbox={sandbox}
      back={
        coin.networks.length > 1
          ? back("Choose another network", () => setNetworkId(null))
          : back("Choose another coin", reset)
      }
      onDone={reset}
    />
  );
}

function SendStep({
  coin,
  network,
  icon,
  sandbox,
  back,
  onDone,
}: {
  coin: DepositCoin;
  network: DepositCoin["networks"][number];
  icon: React.ReactNode;
  sandbox: boolean;
  back: React.ReactNode;
  onDone: () => void;
}) {
  const [state, action] = useActionState(submitDeposit, undefined);
  const [copied, setCopied] = useState(false);
  const multi = coin.networks.length > 1;

  if (state?.created)
    return (
      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6 lg:max-w-3xl" aria-label="Deposit submitted">
        <CheckCircle2 className="h-10 w-10 text-up" />
        <h2 className="mt-3 text-lg font-semibold">Deposit submitted</h2>
        <p className="mt-1 text-sm text-muted">
          {formatQty(state.created.amount)} {state.created.assetCode} on {state.created.network}. Status:{" "}
          <strong className="text-warn">Pending</strong>. We&apos;ll add it to your balance once it&apos;s approved, and
          email you when it is.
        </p>
        <p className="mt-1 font-mono text-xs text-muted">Reference: {state.created.reference}</p>
        <button type="button" onClick={onDone} className={buttonClasses({ size: "lg", className: "mt-5 w-full" })}>
          Done
        </button>
      </section>
    );

  return (
    <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6 lg:max-w-3xl" aria-label={`Deposit ${coin.code}`}>
      {back}
      <h2 className="mt-3 flex flex-wrap items-center gap-3 text-base font-semibold sm:text-lg">
        {icon} Deposit {coin.code}
        {multi && <span className="text-sm font-medium text-muted">· {network.label}</span>}
        {sandbox && <SandboxBadge />}
      </h2>

      {!network.address || !network.qr ? (
        <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          {coin.code} deposits{multi ? ` on ${network.label}` : ""} aren&apos;t available yet. Please choose another{" "}
          {multi ? "network or coin" : "coin"}.
        </p>
      ) : (
        <>
          <div
            className="mt-4 flex gap-2.5 rounded-xl border-2 border-warn bg-warn/10 p-3 text-sm leading-relaxed"
            role="note"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <span>
              Send only <strong>{coin.code}</strong> on the <strong>{network.label}</strong> network to this address.
              Sending another coin, or using any other network, can result in the permanent loss of your funds.
            </span>
          </div>

          <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- server-generated data: URL */}
            <img
              src={network.qr}
              alt={`QR code for the ${coin.code} deposit address on ${network.label}`}
              width={176}
              height={176}
              className="shrink-0 rounded-xl bg-white p-2"
            />
            <div className="w-full min-w-0 flex-1 space-y-2">
              <p className="text-sm text-muted">
                Network: <strong className="text-fg">{network.label}</strong>
              </p>
              <code className="block rounded-lg border border-line bg-surface p-3 font-mono text-sm break-all select-all">
                {network.address}
              </code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(network.address!).catch(() => {});
                  setCopied(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg py-1 text-sm font-medium text-accent"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy address"}
              </button>
            </div>
          </div>

          <form action={action} className="mt-6 space-y-4 border-t border-line pt-5" noValidate>
            <div>
              <h3 className="font-semibold">Already sent it?</h3>
              <p className="mt-1 text-sm text-muted">
                Tell us how much you sent. Your deposit shows as Pending until an admin confirms it arrived, then
                it&apos;s added to your {coin.code} balance.
              </p>
            </div>
            <FormMessage state={state} />
            <input type="hidden" name="assetCode" value={coin.code} />
            <input type="hidden" name="networkId" value={network.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={`Amount sent (${coin.code})`}
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                defaultValue={state?.values?.amount}
              />
              <Field
                label="Transaction ID (optional)"
                name="txHash"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Helps us find it faster"
                defaultValue={state?.values?.txHash}
              />
            </div>
            <SubmitButton pendingLabel="Submitting…">I&apos;ve sent it</SubmitButton>
          </form>
        </>
      )}
    </section>
  );
}
