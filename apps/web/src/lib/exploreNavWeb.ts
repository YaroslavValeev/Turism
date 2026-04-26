import { exploreHubKey, type ExploreNavLink, filterValidExploreNavLinks } from "@mywave/explore-links";
import type { ExploreListItem } from "./exploreApi";

export function buildValidHubKeySetFromExploreIndex(items: ExploreListItem[]): Set<string> {
  return new Set(items.map((i) => exploreHubKey(i.type, i.slug)));
}

export function validExploreMainLinks(
  rawLinks: (ExploreNavLink | null | undefined)[],
  valid: Set<string>,
): ExploreNavLink[] {
  return filterValidExploreNavLinks(rawLinks, valid);
}

export function pickSimilarExploreHubs(
  items: ExploreListItem[],
  excludeKeys: Set<string>,
  limit: number,
): ExploreListItem[] {
  return items.filter((i) => !excludeKeys.has(exploreHubKey(i.type, i.slug))).slice(0, limit);
}

export { exploreHubKey };
