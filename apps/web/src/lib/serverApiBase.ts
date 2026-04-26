/**
 * Base URL API для server-side fetch (RSC) в `apps/web`.
 * В Docker/проде предпочтительно `API_INTERNAL_BASE_URL`, иначе `NEXT_PUBLIC_API_URL`.
 */
export function getServerApiBaseUrl(): string {
  return (
    (process.env.API_INTERNAL_BASE_URL || "").trim() ||
    (process.env.NEXT_PUBLIC_API_URL || "").trim() ||
    "http://localhost:3001"
  );
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
