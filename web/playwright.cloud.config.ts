import { defineConfig } from "@playwright/test";

const PORT = 3200;

// One worker: every test shares the demo tables and starts by clearing them.
export default defineConfig({
  testDir: "./e2e/cloud",
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
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
  },
});
