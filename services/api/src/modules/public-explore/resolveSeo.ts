import type { Env } from "@mywave/config";
import { defaultOgImageUrl } from "../public-blog/resolve";
import type { ExploreHubType } from "@mywave/explore-links";

export type ResolvedExploreSeo = {
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImage: string;
};

export function resolveExploreHubSeo(
  env: Env,
  type: ExploreHubType,
  slug: string,
  label: string,
): ResolvedExploreSeo {
  const base = env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "");
  const path = `/explore/${type}/${slug}`;
  const canonicalUrl = `${base}${path}`.trim();
  const seoTitle = `${label}: программы, подборки и статьи | MyWave`;
  const seoDescription = `Подборка программ, материалов и организаторов по теме ${label}: актуальные выезды, кэмпы, тренировки и активный отдых.`.trim();
  return {
    seoTitle,
    seoDescription,
    canonicalUrl,
    ogImage: defaultOgImageUrl(env),
  };
}
