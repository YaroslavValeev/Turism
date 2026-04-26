import { describe, expect, it } from "vitest";
import { buildUtm } from "./publisher.service";

describe("publisher.service", () => {
  it("строит стабильные UTM", () => {
    const utm = buildUtm("cm_item_123", "telegram_channel");
    expect(utm.source).toBe("content_telegram_channel");
    expect(utm.campaign).toBe("item_cm_item_123");
  });
});

