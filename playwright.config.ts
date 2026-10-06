import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: process.env.CI ? 90000 : 45000,
  expect: { timeout: process.env.CI ? 15000 : 5000 },
  workers: 1,
  use: {
    baseURL: process.env.TEST_DIST
      ? "http://127.0.0.1:4173"
      : "http://127.0.0.1:5173",
    ...(process.env.CI ? {} : { channel: "chrome" }),
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: process.env.TEST_DIST
      ? "node scripts/serve.mjs"
      : "npm run dev -- --host 127.0.0.1",
    url: process.env.TEST_DIST
      ? "http://127.0.0.1:4173"
      : "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
