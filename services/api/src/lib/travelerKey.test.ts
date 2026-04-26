import { describe, expect, it } from "vitest";
import { computeTravelerKeyHash, normalizeGuestContact } from "./travelerKey";
import type { Env } from "@mywave/config";

const baseEnv = {
  APP_ENV: "test",
  DATABASE_URL: "postgresql://x",
  JWT_SECRET: "x".repeat(32),
  ADMIN_JWT_SECRET: "y".repeat(32),
  INGESTION_DAILY_ENABLED: false,
  INGESTION_DAILY_HOUR_LOCAL: 8,
  INGESTION_AUTOPUBLISH_ENABLED: false,
  ANALYTICS_ENABLED: false,
  ANALYTICS_ALERT_COOLDOWN_SECONDS: 3600,
  TRAVELER_KEY_SALT: "test-salt-please-change",
  SOURCES_LINKAGE_BACKFILL_WRITE_ENABLED: false,
} as Env;

describe("travelerKey", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeGuestContact("  Foo@BAR.com \n")).toBe("foo@bar.com");
  });

  it("returns null without salt", () => {
    const env = { ...baseEnv, TRAVELER_KEY_SALT: undefined };
    expect(computeTravelerKeyHash(env, "same contact")).toBeNull();
  });

  it("is stable for same normalized contact", () => {
    const a = computeTravelerKeyHash(baseEnv, "  +7 900 000-00-00 ");
    const b = computeTravelerKeyHash(baseEnv, "+7 900 000-00-00");
    expect(a).toBeTruthy();
    expect(a).toEqual(b);
  });
});
