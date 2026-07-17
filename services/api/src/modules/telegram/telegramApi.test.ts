import { beforeEach, describe, expect, it, vi } from "vitest";
import { proxyFetch } from "../../lib/proxyFetch";
import { callTelegramJson } from "./telegramApi";

vi.mock("../../lib/proxyFetch", () => ({
  proxyFetch: vi.fn(),
}));

describe("callTelegramJson", () => {
  beforeEach(() => {
    vi.mocked(proxyFetch).mockReset();
    vi.mocked(proxyFetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { username: "test_bot" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("uses TELEGRAM_API_BASE_URL and TELEGRAM_BOT_TOKEN", async () => {
    const result = await callTelegramJson(
      {
        TELEGRAM_API_BASE_URL: "https://api.telegram.org",
        TELEGRAM_BOT_TOKEN: "secret-token",
        TELEGRAM_BOT_HTTP_PROXY: "socks5://127.0.0.1:1088",
      } as never,
      "getMe",
      {},
    );

    expect(result.ok).toBe(true);
    expect(proxyFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/botsecret-token/getMe",
      expect.objectContaining({ method: "POST" }),
      "socks5://127.0.0.1:1088",
    );
  });

  it("keeps the legacy full base URL as a compatibility fallback", async () => {
    await callTelegramJson(
      { TELEGRAM_BOT_API_BASE_URL: "https://api.telegram.org/botlegacy-token" } as never,
      "getWebhookInfo",
      {},
    );

    expect(proxyFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/botlegacy-token/getWebhookInfo",
      expect.any(Object),
      undefined,
    );
  });

  it("fails without making a request when configuration is absent", async () => {
    const result = await callTelegramJson({} as never, "getMe", {});

    expect(result).toEqual({ ok: false, description: "Telegram Bot API is not configured" });
    expect(proxyFetch).not.toHaveBeenCalled();
  });
});
