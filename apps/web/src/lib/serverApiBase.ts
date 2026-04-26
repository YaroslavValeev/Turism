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
