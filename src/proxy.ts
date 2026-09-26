import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth redirect (Next.js 16 "proxy", formerly middleware).
 *
 * Only checks that a session cookie exists, with no database call, so signed-out
 * visitors bounce to /login quickly. The real checks happen in the Data Access
 * Layer (src/server/auth/dal.ts) on every protected page and Server Action.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("orb_session")) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/accounts/:path*",
    "/markets/:path*",
    "/notifications/:path*",
    "/deposit/:path*",
    "/withdraw/:path*",
    "/trade/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/admin/:path*",
  ],
};
