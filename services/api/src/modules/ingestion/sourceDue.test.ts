import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: {} }));

import { isSourceDueForCollection, toAbsoluteSourceUrl } from "./service";

describe("toAbsoluteSourceUrl", () => {
  const ig = { type: "instagram", urlOrHandle: "https://www.instagram.com/wakehouse.ru/" };
  const tg = { type: "telegram", urlOrHandle: "https://t.me/raceenduro" };

  it("keeps absolute urls and fixes scheme-less ones", () => {
    expect(toAbsoluteSourceUrl(ig, "https://example.com/a")).toBe("https://example.com/a");
    expect(toAbsoluteSourceUrl(ig, "//example.com/a")).toBe("https://example.com/a");
    expect(toAbsoluteSourceUrl(ig, "wakehouse.ru")).toBe("https://wakehouse.ru");
    expect(toAbsoluteSourceUrl(ig, "kajt-shkola.ru/camps")).toBe("https://kajt-shkola.ru/camps");
  });

  it("maps handles per source type and drops garbage", () => {
    expect(toAbsoluteSourceUrl(ig, "@wakehouse.ru")).toBe("https://www.instagram.com/wakehouse.ru/");
    expect(toAbsoluteSourceUrl(ig, "kaif_camp")).toBe("https://www.instagram.com/kaif_camp/");
    expect(toAbsoluteSourceUrl(tg, "@raceenduro")).toBe("https://t.me/s/raceenduro");
    expect(toAbsoluteSourceUrl(ig, "см. профиль")).toBeNull();
  });
});

const now = new Date("2026-09-25T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe("isSourceDueForCollection", () => {
  const daily = { isActive: true, fetchIntervalMinutes: 1440 };

  it("waits the full interval after a successful check", () => {
    const checked = hoursAgo(4);
    expect(isSourceDueForCollection({ ...daily, lastCheckedAt: checked, lastSuccessAt: checked }, now)).toBe(false);
  });

  it("retries a failed source after 3 hours instead of a day", () => {
    const base = { ...daily, lastSuccessAt: hoursAgo(72) };
    expect(isSourceDueForCollection({ ...base, lastCheckedAt: hoursAgo(2) }, now)).toBe(false);
    expect(isSourceDueForCollection({ ...base, lastCheckedAt: hoursAgo(3) }, now)).toBe(true);
    expect(isSourceDueForCollection({ ...daily, lastSuccessAt: null, lastCheckedAt: hoursAgo(3) }, now)).toBe(true);
  });

  it("keeps short intervals and skips inactive sources", () => {
    const checked = hoursAgo(1);
    expect(
      isSourceDueForCollection({ isActive: true, fetchIntervalMinutes: 60, lastCheckedAt: checked, lastSuccessAt: null }, now),
    ).toBe(true);
    expect(isSourceDueForCollection({ ...daily, isActive: false, lastCheckedAt: null, lastSuccessAt: null }, now)).toBe(false);
  });
});
