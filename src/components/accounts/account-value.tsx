"use client";

import { useMarket } from "@/components/market/market-provider";
import { formatMoney } from "@/config/currencies";

/** Live USD value of an account's balances. */
export function AccountValue({ balances }: { balances: { code: string; amount: string }[] }) {
  const { tickers } = useMarket();
  const total = balances.reduce((sum, b) => {
    const price = b.code === "USD" ? 1 : tickers.find((t) => t.symbol === b.code)?.priceUsd;
    return price === undefined ? sum : sum + Number(b.amount) * price;
  }, 0);
  return <span className="text-lg font-semibold">{formatMoney(total, "usd")}</span>;
}
