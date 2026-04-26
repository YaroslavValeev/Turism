import type { ContentCollection } from "@prisma/client";
import type { Env } from "@mywave/config";
import { defaultOgImageUrl } from "../public-blog/resolve";

export type ResolvedCollectionSeo = {
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImage: string;
};

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function fallbackDescription(row: Pick<ContentCollection, "description" | "body" | "title">): string {
  if (row.description?.trim()) return clip(row.description, 320);
  if (row.body?.trim()) {
    const one = row.body.replace(/\s+/g, " ").trim();
    return clip(one, 320);
  }
  return clip(`Подборка MyWaveTour: ${row.title}`, 320);
}

export function resolveCollectionSeo(
  env: Env,
  row: ContentCollection,
  pathFromSiteRoot: string,
): ResolvedCollectionSeo {
  const base = env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "");
  const path = pathFromSiteRoot.startsWith("/") ? pathFromSiteRoot : `/${pathFromSiteRoot}`;
  const seoTitle = (row.seoTitle?.trim() || row.title).trim();
  const seoDescription = (row.seoDescription?.trim() || fallbackDescription(row)).trim();
  const canonicalUrl = (row.canonicalUrl?.trim() || `${base}${path}`).trim();
  const ogImage = (row.ogImage?.trim() || defaultOgImageUrl(env)).trim();
  return { seoTitle, seoDescription, canonicalUrl, ogImage };
}

/** Публичная выборка: опубликовано и дата публикации задана и не в будущем. */
export function publicCollectionVisibilityWhere(now: Date = new Date()) {
  return {
    AND: [{ status: "published" as const }, { publishedAt: { not: null } }, { publishedAt: { lte: now } }],
  };
}
