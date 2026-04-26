/** UTM + collection_id для ссылок с витринных страниц (G3, метрики позже). */
export function buildCollectionUtmQuery(collectionSlug: string, collectionId: string): string {
  const p = new URLSearchParams();
  p.set("utm_source", "collection");
  p.set("utm_medium", "web");
  p.set("utm_campaign", `collection_${collectionSlug}`);
  p.set("collection_id", collectionId);
  return p.toString();
}

/** G3.2: тематические SEO-хабы /explore/{type}/{slug} */
export function buildExploreUtmQuery(exploreType: string, exploreSlug: string): string {
  const p = new URLSearchParams();
  p.set("utm_source", "explore");
  p.set("utm_medium", "web");
  p.set("utm_campaign", `explore_${exploreType}_${exploreSlug}`);
  p.set("explore_type", exploreType);
  p.set("explore_slug", exploreSlug);
  return p.toString();
}
