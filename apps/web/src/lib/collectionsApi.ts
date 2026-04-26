import type { PublicOrganizerRelated, PublicProgramRelated } from "./blogApi";
import { getServerApiBaseUrl, safeServerFetch } from "./serverApiBase";

export type ResolvedCollectionSeo = {
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImage: string;
};

export type PublicCollectionListItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  updatedAt: string;
  tags: string[];
  discipline: string | null;
  region: string | null;
  season: string | null;
  resolved: ResolvedCollectionSeo;
};

export type PublicCollectionDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  body: string | null;
  status: string;
  collectionType: string;
  discipline: string | null;
  region: string | null;
  country: string | null;
  season: string | null;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ogImage: string | null;
  relatedBlogPostIds: string[];
  relatedProgramIds: string[];
  relatedOrganizerIds: string[];
  publishedAt: string;
  updatedAt: string;
  resolved: ResolvedCollectionSeo;
};

export type PublicCollectionRelated = {
  ok: true;
  programs: PublicProgramRelated[];
  organizers: PublicOrganizerRelated[];
  blogPosts: {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    publishedAt: string;
  }[];
};

const REV = 120;

type ListRes = { ok: true; total: number; items: PublicCollectionListItem[] };
type OneRes = { ok: true; collection: PublicCollectionDetail };

export async function fetchPublicCollectionList(): Promise<ListRes> {
  const base = getServerApiBaseUrl();
  const res = await safeServerFetch(`${base}/public/collections?limit=80`, { next: { revalidate: REV } });
  if (!res || !res.ok) {
    return { ok: true, total: 0, items: [] };
  }
  return (await res.json()) as ListRes;
}

export async function fetchPublicCollection(slug: string): Promise<PublicCollectionDetail | null> {
  const base = getServerApiBaseUrl();
  const res = await safeServerFetch(`${base}/public/collections/${encodeURIComponent(slug)}`, {
    next: { revalidate: REV },
  });
  if (!res) return null;
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as OneRes;
  return data.collection;
}

export async function fetchPublicCollectionRelated(slug: string): Promise<PublicCollectionRelated | null> {
  const base = getServerApiBaseUrl();
  const res = await safeServerFetch(`${base}/public/collections/${encodeURIComponent(slug)}/related`, {
    next: { revalidate: REV },
  });
  if (!res) return null;
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return (await res.json()) as PublicCollectionRelated;
}
