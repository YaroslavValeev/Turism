import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyFetch } from "../../lib/proxyFetch";
import { fetchIngestionTextWithRetry, isTelegramWebUrl } from "./sourceFetch";

vi.mock("../../lib/proxyFetch", () => ({
  proxyFetch: vi.fn(),
}));

describe("ingestion source fetch", () => {
  beforeEach(() => {
    vi.mocked(proxyFetch).mockReset();
    vi.mocked(proxyFetch).mockResolvedValue(new Response("source body", { status: 200 }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    "https://t.me/s/example",
    "https://www.t.me/s/example",
    "https://telegram.me/s/example",
  ])("recognizes Telegram web URL %s", (url) => {
    expect(isTelegramWebUrl(url)).toBe(true);
  });

  it.each([
    "https://example.com/?next=https://t.me/s/example",
    "https://t.me.example.com/s/example",
    "not-a-url",
  ])("does not classify non-Telegram URL %s", (url) => {
    expect(isTelegramWebUrl(url)).toBe(false);
  });

  it("uses TELEGRAM_BOT_HTTP_PROXY for t.me ingestion", async () => {
    const proxyUrl = "socks5://172.18.0.1:1088";

    await expect(fetchIngestionTextWithRetry("https://t.me/s/example", proxyUrl)).resolves.toBe("source body");

    expect(proxyFetch).toHaveBeenCalledTimes(1);
    expect(proxyFetch).toHaveBeenCalledWith(
      "https://t.me/s/example",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          accept: expect.stringContaining("text/html"),
        }),
      }),
      proxyUrl,
    );
  });

  it("does not send non-Telegram ingestion through the Telegram proxy", async () => {
    await expect(
      fetchIngestionTextWithRetry("https://example.com/feed.xml", "socks5://172.18.0.1:1088"),
    ).resolves.toBe("source body");

    expect(proxyFetch).toHaveBeenCalledWith(
      "https://example.com/feed.xml",
      expect.any(Object),
      undefined,
    );
  });

  it("retries an HTTP failure through the same Telegram proxy", async () => {
    vi.useFakeTimers();
    const proxyUrl = "socks5://172.18.0.1:1088";
    vi.mocked(proxyFetch)
      .mockResolvedValueOnce(new Response("temporarily unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("recovered", { status: 200 }));

    const result = fetchIngestionTextWithRetry("https://t.me/s/example", proxyUrl);
    await vi.advanceTimersByTimeAsync(400);

    await expect(result).resolves.toBe("recovered");
    expect(proxyFetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(proxyFetch).mock.calls.map((call) => call[2])).toEqual([proxyUrl, proxyUrl]);
  });
});
