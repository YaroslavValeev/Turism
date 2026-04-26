import type { ExploreHubType } from "./exploreTypes";
import { getManualHub, rawStringToHubSlug } from "./exploreMap";

/** Стабильный ключ публичного хаба (совпадает с GET /public/explore: type + slug). */
export function exploreHubKey(type: ExploreHubType, slug: string): string {
  return `${type}:${slug}`;
}

/** Путь на сайте (без query). */
export function explorePagePath(type: ExploreHubType, slug: string): string {
  return `/explore/${type}/${encodeURIComponent(slug)}`;
}

export type ExploreNavLink = {
  type: ExploreHubType;
  slug: string;
  label: string;
  path: string;
};

/**
 * Построить ссылку на хаб из сырой строки поля (как в БД).
 * Не проверяет, что хаб есть в индексе — для этого см. `filterValidExploreNavLinks` на вебе.
 */
export function exploreNavLinkFromRaw(
  type: ExploreHubType,
  raw: string | null | undefined,
): ExploreNavLink | null {
  if (!raw?.trim()) return null;
  const slug = rawStringToHubSlug(type, raw);
  if (!slug) return null;
  const manual = getManualHub(type, slug);
  return {
    type,
    slug,
    label: manual?.label ?? raw.trim(),
    path: explorePagePath(type, slug),
  };
}

export function filterValidExploreNavLinks(
  links: (ExploreNavLink | null | undefined)[],
  validHubKeys: Set<string>,
): ExploreNavLink[] {
  const out: ExploreNavLink[] = [];
  for (const l of links) {
    if (!l) continue;
    if (validHubKeys.has(exploreHubKey(l.type, l.slug))) out.push(l);
  }
  return out;
}
