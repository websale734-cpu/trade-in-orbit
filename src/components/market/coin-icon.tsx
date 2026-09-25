import Image from "next/image";
import { cn } from "@/lib/utils";

/** Coin logo from CoinGecko, with a lettered fallback when no image is available. */
export function CoinIcon({
  src,
  symbol,
  size = 28,
  className,
}: {
  src: string | null;
  symbol: string;
  size?: number;
  className?: string;
}) {
  if (!src) {
    return (
      <span
        className={cn(
          "bg-brand inline-grid shrink-0 place-items-center rounded-full font-semibold text-white",
          className,
        )}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        aria-hidden
      >
        {symbol.slice(0, 1)}
      </span>
    );
  }
  return <Image src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full", className)} />;
}
