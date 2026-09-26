"use client";

import { useEffect } from "react";
import { LogoMark } from "@/components/brand/logo";

/**
 * App-wide error boundary: a calm, branded message instead of a raw error.
 * Details stay in the server logs (the digest links the two).
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid flex-1 place-items-center px-4 py-32 text-center">
      <div className="max-w-sm">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm text-muted">
          We couldn&apos;t complete that just now. No money was moved. Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="bg-brand mt-8 inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold text-white"
        >
          Try again
        </button>
        {error.digest && <p className="mt-4 font-mono text-xs text-subtle">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
