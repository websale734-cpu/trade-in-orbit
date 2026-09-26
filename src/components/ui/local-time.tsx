"use client";

import { useId } from "react";
import { useNonce } from "@/components/security/nonce";

const OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/**
 * A timestamp shown in the viewer's own locale and time zone.
 *
 * The server can only format in its own zone, so an inline script rewrites the
 * text during HTML parsing (before paint) on full page loads; on client-side
 * navigations the component formats in the browser directly. This is the
 * pattern from Next's "preventing flash before hydration" guide.
 */
export function LocalTime({ date }: { date: string }) {
  const id = useId();
  const nonce = useNonce();
  return (
    <>
      <time id={id} dateTime={date} suppressHydrationWarning>
        {new Date(date).toLocaleString(undefined, OPTIONS)}
      </time>
      <script
        nonce={nonce}
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `{var n=document.getElementById(${JSON.stringify(id)});if(n)n.textContent=new Date(${JSON.stringify(date)}).toLocaleString(undefined,${JSON.stringify(OPTIONS)})}`,
        }}
      />
    </>
  );
}
