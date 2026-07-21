import { proxyFetch } from "../../lib/proxyFetch";

const TELEGRAM_WEB_HOSTS = new Set(["t.me", "telegram.me"]);

export function isTelegramWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return (url.protocol === "http:" || url.protocol === "https:") && TELEGRAM_WEB_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

export async function fetchIngestionTextWithRetry(
  url: string,
  telegramProxyUrl?: string | null,
): Promise<string> {
  let lastError: Error | null = null;
  const proxyUrl = isTelegramWebUrl(url) ? telegramProxyUrl : undefined;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await proxyFetch(
        url,
        {
          signal: controller.signal,
          headers: {
            "user-agent": "MyWaveTravelBot/0.1 (+internal ingestion pipeline)",
            accept: "text/html,application/rss+xml,application/atom+xml,application/xml,text/xml,*/*",
          },
        },
        proxyUrl,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Unable to fetch source");
}
