import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { applyApiRuntimeEnvAliases } from "./envAliases";

describe("applyApiRuntimeEnvAliases", () => {
  const backup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      "INTERNAL_ANALYTICS_TOKEN",
      "TARGET_INTERNAL_TOKEN",
      "TELEGRAM_BOT_API_BASE_URL",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_ALERT_CHAT_ID",
      "OWNER_CHAT_ID",
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

  it("builds TELEGRAM_BOT_API_BASE_URL from TELEGRAM_BOT_TOKEN", () => {
    process.env.TELEGRAM_BOT_TOKEN = "abc";
    applyApiRuntimeEnvAliases();
    expect(process.env.TELEGRAM_BOT_API_BASE_URL).toBe("https://api.telegram.org/botabc");
  });

  it("maps OWNER_CHAT_ID to TELEGRAM_ALERT_CHAT_ID", () => {
    process.env.OWNER_CHAT_ID = "999";
    applyApiRuntimeEnvAliases();
    expect(process.env.TELEGRAM_ALERT_CHAT_ID).toBe("999");
  });

  it("does not override explicit canonical vars", () => {
    process.env.INTERNAL_ANALYTICS_TOKEN = "x";
    process.env.TARGET_INTERNAL_TOKEN = "y";
    applyApiRuntimeEnvAliases();
    expect(process.env.INTERNAL_ANALYTICS_TOKEN).toBe("x");
  });
});
