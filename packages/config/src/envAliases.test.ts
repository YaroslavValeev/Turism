import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { applyApiRuntimeEnvAliases } from "./envAliases";

describe("applyApiRuntimeEnvAliases", () => {
  const backup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      "INTERNAL_ANALYTICS_TOKEN",
      "TARGET_INTERNAL_TOKEN",
      "TELEGRAM_API_BASE_URL",
      "TELEGRAM_BOT_API_BASE_URL",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_ALERT_CHAT_ID",
      "OWNER_CHAT_ID",
      "TELEGRAM_WEBHOOK_SECRET",
      "TELEGRAM_PLATFORM_WEBHOOK_SECRET",
      "TELEGRAM_BOT_USERNAME",
      "TELEGRAM_UPDATES_BOT_USERNAME",
    ]) {
      backup[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(backup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("maps TARGET_INTERNAL_TOKEN to INTERNAL_ANALYTICS_TOKEN", () => {
    process.env.TARGET_INTERNAL_TOKEN = "t1";
    applyApiRuntimeEnvAliases();
    expect(process.env.INTERNAL_ANALYTICS_TOKEN).toBe("t1");
  });

  it("defaults TELEGRAM_API_BASE_URL without duplicating TELEGRAM_BOT_TOKEN", () => {
    process.env.TELEGRAM_BOT_TOKEN = "abc";
    applyApiRuntimeEnvAliases();
    expect(process.env.TELEGRAM_API_BASE_URL).toBe("https://api.telegram.org");
    expect(process.env.TELEGRAM_BOT_API_BASE_URL).toBeUndefined();
  });

  it("maps OWNER_CHAT_ID to TELEGRAM_ALERT_CHAT_ID", () => {
    process.env.OWNER_CHAT_ID = "999";
    applyApiRuntimeEnvAliases();
    expect(process.env.TELEGRAM_ALERT_CHAT_ID).toBe("999");
  });

  it("maps the legacy platform webhook secret", () => {
    process.env.TELEGRAM_PLATFORM_WEBHOOK_SECRET = "webhook-secret";
    applyApiRuntimeEnvAliases();
    expect(process.env.TELEGRAM_WEBHOOK_SECRET).toBe("webhook-secret");
  });

  it("maps the updates bot username", () => {
    process.env.TELEGRAM_UPDATES_BOT_USERNAME = "MyWaveTour_bot";
    applyApiRuntimeEnvAliases();
    expect(process.env.TELEGRAM_BOT_USERNAME).toBe("MyWaveTour_bot");
  });

  it("does not override explicit canonical vars", () => {
    process.env.INTERNAL_ANALYTICS_TOKEN = "x";
    process.env.TARGET_INTERNAL_TOKEN = "y";
    applyApiRuntimeEnvAliases();
    expect(process.env.INTERNAL_ANALYTICS_TOKEN).toBe("x");
  });
});
