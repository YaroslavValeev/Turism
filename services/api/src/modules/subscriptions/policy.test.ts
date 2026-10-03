import { describe, expect, it } from "vitest";
import { hashSubscriptionToken, newSubscriptionToken, subscriptionFilters, subscriptionIdentity, subscriptionMatches } from "./policy";

describe("subscription policy", () => {
  it("validates dates, levels and reversed ranges", () => {
    for (const body of [{ dateFrom: "2026-02-30" }, { dateFrom: "nonsense" }, { levelRequired: "unknown" },
      { dateFrom: "2026-10-10", dateTo: "2026-10-01" }]) expect(() => subscriptionFilters(body)).toThrow();
    expect(subscriptionFilters({}).dateFrom).toBeNull();
    expect(subscriptionFilters({ dateFrom: "2026-10-01" }).dateFrom?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  it("uses random tokens within Telegram's 64-character payload limit", () => {
    const a = newSubscriptionToken(new Date("2026-10-03T00:00:00Z"));
    expect(`mywave_sub_${a.token}`.length).toBeLessThanOrEqual(64);
    expect(a.hash).toBe(hashSubscriptionToken(a.token));
    expect(a.token).not.toBe(newSubscriptionToken().token);
    expect(a.expiresAt.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(subscriptionIdentity(["a", null])).toBe(subscriptionIdentity(["a", null]));
    expect(subscriptionIdentity(["a"])).not.toBe(subscriptionIdentity(["b"]));
  });
  it("combines discipline OR, region, level and inclusive start-date boundaries", () => {
    const p = { discipline: "ski", region: "Камчатка", levelRequired: "beginner", startDate: new Date("2026-10-03T00:00:00Z"), scheduleType: "fixed" };
    const sub = { discipline: "mtb, ski", region: "камчатка", ...subscriptionFilters({ levelRequired: "beginner", dateFrom: "2026-10-03", dateTo: "2026-10-03" }) };
    expect(subscriptionMatches(sub, p)).toBe(true);
    expect(subscriptionMatches(sub, { ...p, startDate: new Date("2026-10-04") })).toBe(false);
    expect(subscriptionMatches(sub, { ...p, scheduleType: "on_request" })).toBe(false);
    expect(subscriptionMatches(sub, { ...p, levelRequired: "expert" })).toBe(false);
    expect(subscriptionMatches(sub, { ...p, discipline: "kite" })).toBe(false);
    expect(subscriptionMatches(subscriptionFilters({}), { ...p, scheduleType: "on_request" })).toBe(true);
  });
});
