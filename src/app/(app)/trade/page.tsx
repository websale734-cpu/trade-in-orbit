import type { Metadata } from "next";
import { ComingSoonFeature } from "@/components/app/coming-soon-feature";

export const metadata: Metadata = { title: "Trade" };

// Phase 4: replace with buy / sell / swap and the order book.
export default function TradePage() {
  return <ComingSoonFeature name="Trading" path="/trade" />;
}
