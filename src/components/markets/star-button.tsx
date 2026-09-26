"use client";

import { useOptimistic, useTransition } from "react";
import { Star } from "lucide-react";
import { toggleWatchlist } from "@/app/(app)/actions";
import { cn } from "@/lib/utils";

/** Watchlist star. Flips instantly (optimistic) and reconciles with the server. */
export function StarButton({ assetCode, watching }: { assetCode: string; watching: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(watching);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? `Remove ${assetCode} from watchlist` : `Add ${assetCode} to watchlist`}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleWatchlist(assetCode);
        })
      }
      className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-surface-strong"
    >
      <Star
        className={cn("h-[18px] w-[18px] transition-all", optimistic ? "scale-110 fill-warn text-warn" : "text-subtle")}
      />
    </button>
  );
}
