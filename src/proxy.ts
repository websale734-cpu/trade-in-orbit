import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page request (Next.js 16 "proxy", formerly middleware):
 *
 * 1. Content-Security-Policy with a fresh per-request nonce. Next.js applies
 *    the nonce to its own scripts; our two inline scripts (theme, local time)
 *    read it via the x-nonce request header. 'strict-dynamic' lets those
 *    trusted scripts load their chunks; nothing else can run.
 * 2. Optimistic auth redirect for signed-in areas: only checks that a session
 *    cookie exists (no database call). The real checks happen in the Data
 *    Access Layer on every protected page, route and Server Action.
 */
const PROTECTED = [
  "/dashboard",
  "/accounts",
  "/markets",
  "/notifications",
  "/deposit",
  "/withdraw",
  "/trade",
  "/history",
  "/rewards",
  "/alerts",
  "/recurring",
  "/support",
  "/more",
  "/settings",
  "/onboarding",
  "/admin",
];

const SESSION_COOKIE_NAMES = ["__Host-orb_session", "orb_session"];

function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // 'unsafe-eval' only in development (React dev tooling / fast refresh).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used for dynamic widths/colours (no script execution possible via CSS here).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://coin-images.coingecko.com https://assets.coingecko.com",
    "font-src 'self'",
    "media-src 'self' blob:",
    `connect-src 'self' ${process.env.NEXT_PUBLIC_BINANCE_WS_URL ? new URL(process.env.NEXT_PUBLIC_BINANCE_WS_URL).origin : "wss://stream.binance.com:443"}${dev ? " ws:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const signedIn = SESSION_COOKIE_NAMES.some((n) => request.cookies.has(n));
    if (!signedIn) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Every page, but not API routes, static files, images or prefetches (which don't need a CSP or a nonce).
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|sw.js|.*\\.(?:png|jpg|svg|webp|ico|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
