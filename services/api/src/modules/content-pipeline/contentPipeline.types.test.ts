import { describe, expect, it } from "vitest";
import {
  CONTENT_DRAFT_TYPES,
  CONTENT_PUBLICATION_CHANNELS,
  CONTENT_WORKFLOW_STATUSES,
} from "@mywave/shared-types";

/**
 * Проверка, что shared-types не расходятся с ожидаемым контрактом (при смене Prisma enum — обновить и этот тест).
 */
describe("content pipeline types", () => {
  it("ContentWorkflowStatus включает стадии collect + editorial + publish", () => {
    expect(CONTENT_WORKFLOW_STATUSES).toContain("ingest_collected");
    expect(CONTENT_WORKFLOW_STATUSES).toContain("pending_owner_review");
    expect(CONTENT_WORKFLOW_STATUSES).toContain("published");
    expect(CONTENT_WORKFLOW_STATUSES).toContain("rewrite_requested");
    expect(CONTENT_WORKFLOW_STATUSES).toContain("skipped");
  });

  it("есть каналы первого приоритета", () => {
    expect(CONTENT_PUBLICATION_CHANNELS).toContain("telegram_channel");
    expect(CONTENT_PUBLICATION_CHANNELS).toContain("vk");
    expect(CONTENT_DRAFT_TYPES).toContain("blog_post");
  });
});
