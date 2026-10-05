import type { MetadataRoute } from "next";

/** Web app manifest: lets phones and desktop browsers install Trade In Orbit as a full-screen app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Trade In Orbit",
    short_name: "Trade In Orbit",
    description: "Buy, sell and track crypto with Trade In Orbit.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#07070c",
    theme_color: "#07070c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
