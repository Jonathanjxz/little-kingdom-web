import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "npm run server",
      port: 3001,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});