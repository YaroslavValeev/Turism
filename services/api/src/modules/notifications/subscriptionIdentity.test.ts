import { describe, expect, it } from "vitest";
import { buildSubscriptionIdentityKey, stableFiltersJson } from "./subscriptionIdentity";

describe("buildSubscriptionIdentityKey", () => {
  it("одинаковый ключ при разном порядке ключей в filters", () => {
    const a = buildSubscriptionIdentityKey({
      channel: "email",
      contactEmail: "User@Mail.ru",
      type: "seasonal",
      filters: { region: "x", discipline: "wake" },
    });
    const b = buildSubscriptionIdentityKey({
      channel: "email",
      contactEmail: "user@mail.ru",
      type: "seasonal",
      filters: { discipline: "wake", region: "x" },
    });
    expect(a).toBe(b);
  });

  it("разные type дают разный ключ", () => {
    const a = buildSubscriptionIdentityKey({
      channel: "email",
      contactEmail: "a@b.c",
      type: "seasonal",
      filters: {},
    });
    const b = buildSubscriptionIdentityKey({
      channel: "email",
      contactEmail: "a@b.c",
      type: "program_updates",
      filters: {},
    });
    expect(a).not.toBe(b);
  });

  it("канал max не смешивается с telegram", () => {
    const max = buildSubscriptionIdentityKey({
      channel: "max",
      maxRecipientId: "user-1",
      type: "seasonal",
      filters: {},
    });
    const tg = buildSubscriptionIdentityKey({
      channel: "telegram",
      telegramChatId: "user-1",
      type: "seasonal",
      filters: {},
    });
    expect(max).not.toBe(tg);
    expect(max.startsWith("max:")).toBe(true);
    expect(tg.startsWith("tg:")).toBe(true);
  });

  it("stableFiltersJson нормализует пустой ввод", () => {
    expect(stableFiltersJson(null)).toBe("{}");
  });
});
