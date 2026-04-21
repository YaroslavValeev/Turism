import { defineConfig, devices } from "@playwright/test";

/**
 * UI smoke для админки. Нужны: запущенные API (:3001) и admin (:3002), переменная ADMIN_E2E_TOKEN (JWT после /auth/login).
 * Пример: `ADMIN_E2E_TOKEN=... pnpm --filter admin test:e2e`
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_ADMIN_URL ?? "http://localhost:3002",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
});
