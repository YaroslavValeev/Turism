/**
 * Instagram режет запросы с IP Tourism VPS (HTTP 429), поэтому Instagram API и его CDN
 * можно пустить через тот же EU SOCKS, что и Telegram (INSTAGRAM_HTTP_PROXY).
 */
const INSTAGRAM_HOST_SUFFIXES = ["instagram.com", "cdninstagram.com", "fbcdn.net"];

export function isInstagramHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return INSTAGRAM_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function instagramProxyForUrl(url: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const proxy = env.INSTAGRAM_HTTP_PROXY?.trim();
  if (!proxy) return null;
  try {
    return isInstagramHost(new URL(url).hostname) ? proxy : null;
  } catch {
    return null;
  }
}
