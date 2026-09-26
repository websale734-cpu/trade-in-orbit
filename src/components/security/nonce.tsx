"use client";

import { createContext, useContext } from "react";

/**
 * The per-request CSP nonce (set by src/proxy.ts), made available to client
 * components that render inline scripts during SSR. Browsers hide nonce values
 * from the DOM after parsing, so it's only meaningful in server-rendered HTML.
 */
const NonceContext = createContext<string | undefined>(undefined);

export function NonceProvider({ nonce, children }: { nonce: string | undefined; children: React.ReactNode }) {
  return <NonceContext value={nonce}>{children}</NonceContext>;
}

export function useNonce() {
  return useContext(NonceContext);
}
