"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the current server-rendered page every few seconds while the tab is visible. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      // Don't refresh while someone is typing a reply.
      const el = document.activeElement;
      if (document.visibilityState === "visible" && !(el instanceof HTMLTextAreaElement && el.value)) router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
