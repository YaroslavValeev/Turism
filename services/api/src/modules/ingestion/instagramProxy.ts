/**
 * Instagram режет запросы с IP Tourism VPS (HTTP 429), поэтому Instagram API и его CDN
 * можно пустить через тот же EU SOCKS, что и Telegram (INSTAGRAM_HTTP_PROXY).
 */
const INSTAGRAM_HOST_SUFFIXES = ["instagram.com", "cdninstagram.com", "fbcdn.net"];

export function isInstagramHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return INSTAGRAM_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * Instagram отдаёт посты профиля только авторизованной сессии (иначе 401 require_login).
 * INSTAGRAM_SESSION_ID — cookie `sessionid` отдельного служебного аккаунта; уходит только на instagram.com.
 */
export function instagramSessionHeaders(url: string, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const sessionId = env.INSTAGRAM_SESSION_ID?.trim();
  if (!sessionId || /[;\r\n]/.test(sessionId)) return {};
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host !== "instagram.com" && !host.endsWith(".instagram.com")) return {};
  } catch {
    return {};
  }
  return { cookie: `sessionid=${sessionId}` };
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
