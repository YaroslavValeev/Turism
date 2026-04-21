import { test, expect } from "@playwright/test";

const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3001";

let draftId: string | undefined;

test.beforeAll(async ({ request }) => {
  const token = process.env.ADMIN_E2E_TOKEN;
  if (!token) return;
  const res = await request.get(`${API_URL}/admin/conversion-drafts?status=awaiting_owner&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return;
  const data = (await res.json()) as { items?: { id: string }[] };
  draftId = data.items?.[0]?.id;
});

test.describe.serial("conversion drafts owner smoke", () => {
  test("список → фильтр awaiting_owner → карточка → правка → defer → reopen", async ({ page }) => {
    test.skip(!process.env.ADMIN_E2E_TOKEN, "Задайте ADMIN_E2E_TOKEN (JWT админа)");
    test.skip(!draftId, "В БД нет черновика со статусом awaiting_owner");

    const token = process.env.ADMIN_E2E_TOKEN!;
    await page.addInitScript((t: string) => {
      window.localStorage.setItem("admin_token", t);
    }, token);

    await page.goto("/admin/conversion-drafts");
    await expect(page.getByTestId("conversion-drafts-heading")).toBeVisible();

    await page.getByTestId("conversion-drafts-filter-status").fill("awaiting_owner");
    await page.getByTestId("conversion-drafts-apply-filters").click();
    await expect(page.getByTestId("conversion-drafts-table")).toBeVisible();

    await page.locator(`a[href="/admin/conversion-drafts/${draftId}"]`).click();

    await expect(page.getByTestId("conversion-draft-status")).toHaveText("awaiting_owner");
    await expect(page.getByTestId("conversion-draft-owner-notify")).toBeVisible();

    const ta = page.getByTestId("conversion-draft-message-text");
    await ta.fill((await ta.inputValue()) + "\n[e2e smoke]");
    await page.getByRole("button", { name: "Сохранить текст" }).click();

    await page.getByTestId("conversion-draft-defer").click();
    await expect(page.getByTestId("conversion-draft-status")).toHaveText("deferred", { timeout: 15_000 });

    await page.getByTestId("conversion-draft-reopen").click();
    await expect(page.getByTestId("conversion-draft-status")).toHaveText("awaiting_owner", { timeout: 15_000 });
  });

  test("главная: сводка conversion drafts", async ({ page }) => {
    test.skip(!process.env.ADMIN_E2E_TOKEN, "Задайте ADMIN_E2E_TOKEN");
    const token = process.env.ADMIN_E2E_TOKEN!;
    await page.addInitScript((t: string) => {
      window.localStorage.setItem("admin_token", t);
    }, token);

    await page.goto("/");
    await expect(page.getByTestId("admin-conversion-summary")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: /Открыть conversion drafts/i })).toBeVisible();
  });
});
