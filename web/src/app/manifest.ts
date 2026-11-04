import type { MetadataRoute } from "next";

// PWA manifest only (no offline service worker in the MVP — see PLAN.md §5).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TapFlow",
    short_name: "TapFlow",
    description: "Scan. Order. Serve. QR ordering for any venue.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111827",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
