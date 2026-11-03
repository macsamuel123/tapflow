import type { NextConfig } from "next";

// Browser → /api/* (same origin) → FastAPI. One origin keeps CORS out of the picture
// and lets a single HTTPS tunnel (make tunnel) cover both web and API.
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // web/ is its own pnpm project (the repo root only holds tooling); pin the tracing root.
  outputFileTracingRoot: __dirname,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiInternalUrl}/:path*` }];
  },
};

export default nextConfig;
