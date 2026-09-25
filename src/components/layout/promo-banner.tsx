"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { Promotion } from "@/server/content";
import { useI18n } from "@/i18n/client";

const DISMISS_KEY = "orb_promo_dismissed";

// A shared one-second clock. Server snapshot is null: the countdown depends on
// the client's clock, so it only appears after hydration.
function subscribeClock(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
const clockSeconds = () => Math.floor(Date.now() / 1000);
const serverClock = () => null;

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}
const noopSubscribe = () => () => {};

/**
 * Admin-controlled promotion strip with a live countdown.
 * Hidden once the promotion ends or the visitor dismisses it (remembered per promotion id).
 */
export function PromoBanner({ promo }: { promo: Promotion }) {
  const { dict } = useI18n();
  const t = dict.promo;
  const nowSec = useSyncExternalStore(subscribeClock, clockSeconds, serverClock);
  const storedDismissal = useSyncExternalStore(noopSubscribe, readDismissed, serverClock);
  const [dismissedNow, setDismissedNow] = useState(false);

  const endsAt = new Date(promo.endsAt).getTime();
  if (dismissedNow || storedDismissal === promo.id || nowSec === null || nowSec * 1000 >= endsAt) return null;

  const left = endsAt - nowSec * 1000;
  const parts: Array<[number, string]> = [
    [Math.floor(left / 86_400_000), t.days],
    [Math.floor(left / 3_600_000) % 24, t.hours],
    [Math.floor(left / 60_000) % 60, t.minutes],
    [Math.floor(left / 1000) % 60, t.seconds],
  ];

  function dismiss() {
    setDismissedNow(true);
    try {
      localStorage.setItem(DISMISS_KEY, promo.id);
    } catch {}
  }

  return (
    <div className="bg-brand relative animate-fade-up text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-10 py-2 text-center text-sm">
        <span className="font-medium">{promo.message}</span>
        <span className="inline-flex items-center gap-1.5 text-white/85">
          {t.endsIn}
          <span className="tabular rounded-md bg-black/20 px-2 py-0.5 font-semibold">
            {parts.map(([n, unit]) => `${String(n).padStart(2, "0")}${unit}`).join(" ")}
          </span>
        </span>
        {promo.ctaHref && promo.ctaLabel && (
          <Link href={promo.ctaHref} className="font-semibold underline underline-offset-4 hover:no-underline">
            {promo.ctaLabel}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t.dismiss}
        className="absolute top-1/2 right-2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full hover:bg-white/15"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
