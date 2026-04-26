import type { Env } from "@mywave/config";

function hostnameOfBaseUrl(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalhostHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * В production публичные base URL не должны указывать на localhost — иначе письма и deep-link’и
 * ведут на несуществующий для пользователя хост.
 */
export function assertPublicBaseUrlsForProduction(env: Env): void {
  if (env.APP_ENV !== "production") return;
  if (process.env.ALLOW_LOCALHOST_IN_PUBLIC_URLS === "1") return;

  const issues: string[] = [];
  const web = hostnameOfBaseUrl(env.PUBLIC_WEB_BASE_URL);
  const api = hostnameOfBaseUrl(env.PUBLIC_API_BASE_URL);
  if (web && isLocalhostHost(web)) {
    issues.push(`PUBLIC_WEB_BASE_URL host is local: ${web}`);
  }
  if (api && isLocalhostHost(api)) {
    issues.push(`PUBLIC_API_BASE_URL host is local: ${api}`);
  }
  if (issues.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      "[config] Refusing to start API in production with localhost-like public URL(s). Set real PUBLIC_WEB_BASE_URL and PUBLIC_API_BASE_URL (https://...), or set ALLOW_LOCALHOST_IN_PUBLIC_URLS=1 to override (not for real prod).",
    );
    for (const m of issues) {
      // eslint-disable-next-line no-console
      console.error(`[config] ${m}`);
    }
    process.exit(1);
  }
}
