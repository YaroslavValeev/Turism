/**
 * Base URL API для server-side fetch (RSC) в `apps/web`.
 * В Docker/проде: задайте `API_INTERNAL_BASE_URL=http://api:3001` (имя сервиса compose).
 * Если `NEXT_PUBLIC_API_URL=/api` (same-origin в браузере), в Node нужен абсолютный URL — см. fallback.
 */
export function getServerApiBaseUrl(): string {
  const internal = (process.env.API_INTERNAL_BASE_URL || "").trim().replace(/\/+$/, "");
  if (internal) return internal;

  const pub = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (pub.startsWith("http://") || pub.startsWith("https://")) return pub;

  // Относительный путь (/api) — только для браузера; RSC ходит в контейнер API по сети compose.
  if (pub.startsWith("/")) {
    return "http://api:3001";
  }

  return "http://localhost:3001";
}

/**
 * `fetch` для RSC при `next build` / SSG: при ECONNRESET и офлайн API не падает, а возвращает `null`
 * (страницы деградируют в пустые списки / 404, см. public explore/blog/collections).
 */
export async function safeServerFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response | null> {
  try {
    return await fetch(input, init);
  } catch {
    return null;
  }
}
