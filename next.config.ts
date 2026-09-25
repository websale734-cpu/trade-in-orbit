import type { NextConfig } from "next";

/**
 * Baseline security headers for every response.
 * A full Content-Security-Policy (with nonces for the inline theme script) is
 * added in Phase 8 once all third-party origins (Stripe, Twilio, etc.) are known.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self)" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Coin logos served by CoinGecko.
    remotePatterns: [
      { protocol: "https", hostname: "coin-images.coingecko.com" },
      { protocol: "https", hostname: "assets.coingecko.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
