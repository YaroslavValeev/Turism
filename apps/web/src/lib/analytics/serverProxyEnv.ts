/**
 * Сервер-only env для прокси `/api/analytics/events` → API.
 * Должен совпадать с `INTERNAL_ANALYTICS_TOKEN` в `services/api` (без префикса NEXT_PUBLIC_).
 */
function trim(v: string | undefined): string {
  if (v === undefined || v === "") return "";
  return v.trim();
}

export type AnalyticsProxyEnv = {
  apiUrl: string;
  token: string;
};

export function getAnalyticsProxyEnv(): AnalyticsProxyEnv {
  const token =
    trim(process.env.INTERNAL_ANALYTICS_TOKEN) || trim(process.env.TARGET_INTERNAL_TOKEN);
  const apiUrl =
    trim(process.env.API_INTERNAL_BASE_URL) ||
    trim(process.env.NEXT_PUBLIC_API_URL) ||
    "http://localhost:3001";
  return { apiUrl, token };
}
