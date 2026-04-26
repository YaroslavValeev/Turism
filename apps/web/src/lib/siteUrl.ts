/** Публичный origin сайта (канон, OG, ссылки). */
export function getPublicSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://mywavetour.ru").replace(/\/+$/, "");
}
