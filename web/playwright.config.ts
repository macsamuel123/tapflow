import { defineConfig } from "@playwright/test";

const PORT = 3100;

// Runs the production build, with an API address nothing listens on: a demo page that
// needed the API would fail here.
export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/cloud/**", // needs Supabase: make e2e-cloud
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    acceptDownloads: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "phone-390", use: { browserName: "chromium" } }],
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_DEMO_MODE: "true", API_INTERNAL_URL: "http://127.0.0.1:9" },
  },
});
