import { test, expect } from "@playwright/test";

/**
 * Минимальный smoke для реестра источников (Wave 1).
 * Нужны: admin (:3002), ADMIN_E2E_TOKEN (JWT после /auth/login).
 */
test.describe("sources registry smoke", () => {
  test("страница источников: заголовок и таблица", async ({ page }) => {
    test.skip(!process.env.ADMIN_E2E_TOKEN, "Задайте ADMIN_E2E_TOKEN (JWT админа)");

    const token = process.env.ADMIN_E2E_TOKEN!;
    await page.addInitScript((t: string) => {
      window.localStorage.setItem("admin_token", t);
    }, token);

    await page.goto("/sources");
    await expect(page.getByTestId("sources-registry-heading")).toBeVisible();
    await expect(page.getByTestId("sources-contract-sync-panel")).toBeVisible();
    await expect(page.getByTestId("sources-table")).toBeVisible({ timeout: 15_000 });
  });
});
