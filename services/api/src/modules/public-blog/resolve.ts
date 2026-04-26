import type { BlogPost } from "@prisma/client";
import type { Env } from "@mywave/config";

export type ResolvedBlogSeo = {
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

function fallbackDescription(row: Pick<BlogPost, "excerpt" | "body" | "title">): string {
  if (row.excerpt?.trim()) return clip(row.excerpt, 320);
  if (row.body?.trim()) {
    const one = row.body.replace(/\s+/g, " ").trim();
    return clip(one, 320);
  }
  return clip(`Материал блога MyWaveTour: ${row.title}`, 320);
}

/** Абсолютный URL дефолтной картинки OG (корень сайта). */
export function defaultOgImageUrl(env: Env): string {
  const base = env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "");
  return `${base}/favicon.svg`;
}

export function resolveBlogSeo(env: Env, row: BlogPost, pathFromSiteRoot: string): ResolvedBlogSeo {
  const base = env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "");
  const seoTitle = (row.seoTitle?.trim() || row.title).trim();
  const seoDescription = (row.seoDescription?.trim() || fallbackDescription(row)).trim();
  const path = pathFromSiteRoot.startsWith("/") ? pathFromSiteRoot : `/${pathFromSiteRoot}`;
  const canonicalUrl = (row.canonicalUrl?.trim() || `${base}${path}`).trim();
  const ogImage = (row.ogImage?.trim() || defaultOgImageUrl(env)).trim();
  return { seoTitle, seoDescription, canonicalUrl, ogImage };
}
