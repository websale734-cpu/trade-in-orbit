import type { NextConfig } from "next";

/**
 * Baseline security headers for every response. Pages get a per-request,
 * nonce-based Content-Security-Policy from src/proxy.ts; API responses (JSON
 * only) get a locked-down static one below.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Hide the floating Next.js dev-tools button in development.
  devIndicators: false,
  // KYC uploads: up to three 5 MB files per submission, plus form overhead.
  experimental: {
    serverActions: { bodySizeLimit: "16mb" },
    proxyClientMaxBodySize: "16mb",
  },
  images: {
    // Coin logos served by CoinGecko.
    remotePatterns: [
      { protocol: "https", hostname: "coin-images.coingecko.com" },
      { protocol: "https", hostname: "assets.coingecko.com" },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
    ];
  },
};

export default nextConfig;
