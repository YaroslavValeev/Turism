import { describe, expect, it } from "vitest";
import {
  buildTelegramBotApiUrl,
  buildTelegramFileApiUrl,
  isTelegramBotApiConfigured,
  resolveTelegramBotApiBaseUrl,
} from "./telegramApi";

describe("Telegram Bot API URL configuration", () => {
  it("builds method and file URLs from the canonical origin and token", () => {
    const env = {
      TELEGRAM_API_BASE_URL: "https://api.telegram.org/",
      TELEGRAM_BOT_TOKEN: "secret-token",
    };

    expect(buildTelegramBotApiUrl(env, "getMe")).toBe(
      "https://api.telegram.org/botsecret-token/getMe",
    );
    expect(buildTelegramFileApiUrl(env, "voice/file.ogg")).toBe(
      "https://api.telegram.org/file/botsecret-token/voice/file.ogg",
    );
  });

  it("accepts matching canonical and legacy configuration during migration", () => {
    const env = {
      TELEGRAM_API_BASE_URL: "https://api.telegram.org",
      TELEGRAM_BOT_TOKEN: "canonical-token",
      TELEGRAM_BOT_API_BASE_URL: "https://api.telegram.org/botcanonical-token",
    };

    expect(resolveTelegramBotApiBaseUrl(env)).toBe(
      "https://api.telegram.org/botcanonical-token",
    );
  });

  it("rejects conflicting canonical and legacy credentials", () => {
    expect(() =>
      resolveTelegramBotApiBaseUrl({
        TELEGRAM_API_BASE_URL: "https://api.telegram.org",
        TELEGRAM_BOT_TOKEN: "canonical-token",
        TELEGRAM_BOT_API_BASE_URL: "https://api.telegram.org/botlegacy-token",
      }),
    ).toThrow("credentials conflict");
  });

  it("requires the token when the canonical origin is explicitly configured", () => {
    expect(() =>
      resolveTelegramBotApiBaseUrl({
        TELEGRAM_API_BASE_URL: "https://api.telegram.org",
      }),
    ).toThrow("TELEGRAM_BOT_TOKEN is required");
  });

  it("supports the legacy full base URL during migration", () => {
    const env = {
      TELEGRAM_BOT_API_BASE_URL: "https://api.telegram.org/botlegacy-token/",
    };

    expect(buildTelegramBotApiUrl(env, "sendMessage")).toBe(
      "https://api.telegram.org/botlegacy-token/sendMessage",
    );
    expect(buildTelegramFileApiUrl(env, "/documents/file.pdf")).toBe(
      "https://api.telegram.org/file/botlegacy-token/documents/file.pdf",
    );
  });

  it("rejects a secret-bearing canonical base URL", () => {
    expect(() =>
      resolveTelegramBotApiBaseUrl({
        TELEGRAM_API_BASE_URL: "https://api.telegram.org/botsecret-token",
        TELEGRAM_BOT_TOKEN: "secret-token",
      }),
    ).toThrow("must be an origin without a path");
  });

  it("reports missing configuration", () => {
    expect(isTelegramBotApiConfigured({})).toBe(false);
    expect(buildTelegramBotApiUrl({}, "getMe")).toBeUndefined();
  });
});
