/**
 * Базовый URL публичного API для fetch в браузере.
 *
 * На проде за nginx (тот же host, `/api/` → backend) нельзя оставлять в bundle
 * `http://localhost:3001` — браузер пользователя ходит на его localhost, каталог пустеет.
 * Если `NEXT_PUBLIC_API_URL` указывает на loopback, а страница открыта с обычного домена,
 * подставляем `${origin}/api`.
 *
 * Частая ошибка в `.env`: указать только `https://mywavetour.ru` без `/api` — тогда
 * `fetch(.../programs)` бьёт в Next.js и даёт 404. В этом случае нормализуем к `${origin}/api`.
 */
function stripWwwHost(host: string): string {
  return host.replace(/^www\./i, "");
}

/** Путь без завершающих слэшей; пустой трактуем как «корень». */
function normalizedPathname(pathname: string): string {
  const p = pathname.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

export function getPublicApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (typeof window === "undefined") {
    return raw || "http://localhost:3001";
  }
  const origin = window.location.origin;
  const bakedLoopback = raw.startsWith("http://127.0.0.1") || raw.startsWith("http://localhost");
  const onPublicSite = !origin.includes("localhost") && !origin.includes("127.0.0.1");
  if (bakedLoopback && onPublicSite) {
    return `${origin}/api`;
  }
  if (raw && onPublicSite && /^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const o = new URL(origin);
      const path = normalizedPathname(u.pathname);
      const sameSiteHost = stripWwwHost(u.hostname) === stripWwwHost(o.hostname);
      if (sameSiteHost && path === "/") {
        return `${origin}/api`;
      }
    } catch {
      /* malformed absolute URL — ниже вернём raw */
    }
  }
  if (raw) return raw;
  const localUi = origin.includes("localhost") || origin.includes("127.0.0.1");
  if (localUi) {
    return "http://localhost:3001";
  }
  return `${origin}/api`;
}
