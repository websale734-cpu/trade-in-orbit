import { NextResponse } from "next/server";
import { isReferralCode, recordReferralClick, REFERRAL_COOKIE } from "@/server/rewards";
import { getRequestInfo } from "@/server/request-info";

/**
 * GET /r/:code
 * Referral link: counts the click, remembers the code for 30 days in a cookie,
 * and sends the visitor to sign-up. Always redirects to our own /register, so
 * it can't be used as an open redirect.
 */
export async function GET(request: Request, ctx: RouteContext<"/r/[code]">) {
  const code = (await ctx.params).code.toUpperCase();
  const res = NextResponse.redirect(new URL("/register", request.url));
  if (!isReferralCode(code)) return res;
  await recordReferralClick(code, (await getRequestInfo()).ip).catch(() => {});
  res.cookies.set(REFERRAL_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86_400,
  });
  return res;
}
