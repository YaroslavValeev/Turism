import { getServerApiBaseUrl, safeServerFetch } from "./serverApiBase";

export type ResolvedBlogSeo = {
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImage: string;
};

export type PublicBlogListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string;
  updatedAt: string;
  sourceUrl: string | null;
  tags: string[];
  discipline: string | null;
  region: string | null;
  country: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ogImage: string | null;
  resolved: ResolvedBlogSeo;
};

export type PublicBlogPost = {
  id: string;
  contentItemId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  sourceUrl: string | null;
  publishedAt: string;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ogImage: string | null;
  tags: string[];
  discipline: string | null;
  region: string | null;
  country: string | null;
  relatedProgramIds: string[];
  relatedOrganizerIds: string[];
  resolved: ResolvedBlogSeo;
};

export type PublicProgramRelated = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  priceFromRub: number | null;
  levelRequired: string | null;
  audienceFit: string | null;
  riskLevel: string | null;
  autoPublished: boolean;
  sourceType: string | null;
  reviewStatus: string | null;
  publishStatus: string;
  media: { id: string; url: string; mediaType: string }[];
  organizer: { id: string; displayName: string; verificationStatus: string };
};

export type PublicOrganizerRelated = {
  id: string;
  displayName: string;
  verificationStatus: string;
  legalStatus: string | null;
};

export type PublicCollectionRef = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  discipline: string | null;
  region: string | null;
  season: string | null;
};

export type PublicBlogRelated = {
  ok: true;
  programs: PublicProgramRelated[];
  organizers: PublicOrganizerRelated[];
  collections: PublicCollectionRef[];
  similarPosts: { id: string; slug: string; title: string; excerpt: string | null; publishedAt: string }[];
};

type ListResponse = { ok: true; total: number; items: PublicBlogListItem[] };
type PostResponse = { ok: true; post: PublicBlogPost };

const REVALIDATE_LIST = 60;
const REVALIDATE_POST = 120;
const REVALIDATE_RELATED = 120;

export async function fetchPublicBlogList(params?: { limit?: number; offset?: number }): Promise<ListResponse> {
  const base = getServerApiBaseUrl();
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const q = sp.toString();
  const res = await safeServerFetch(`${base}/public/blog${q ? `?${q}` : ""}`, {
    next: { revalidate: REVALIDATE_LIST },
  });
  if (!res || !res.ok) {
    return { ok: true, total: 0, items: [] };
  }
  return (await res.json()) as ListResponse;
}

export async function fetchPublicBlogPost(slug: string): Promise<PublicBlogPost | null> {
  const base = getServerApiBaseUrl();
  const res = await safeServerFetch(`${base}/public/blog/${encodeURIComponent(slug)}`, {
    next: { revalidate: REVALIDATE_POST },
  });
  if (!res) return null;
  if (res.status === 404) return null;
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as PostResponse;
  return data.post;
}

export async function fetchPublicBlogRelated(slug: string): Promise<PublicBlogRelated | null> {
  const base = getServerApiBaseUrl();
  const res = await safeServerFetch(`${base}/public/blog/${encodeURIComponent(slug)}/related`, {
    next: { revalidate: REVALIDATE_RELATED },
  });
  if (!res) return null;
  if (res.status === 404) return null;
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as PublicBlogRelated;
}

/** Описание для микроразметки, если resolved недоступен на клиенте. */
export function blogDescriptionFallback(excerpt: string | null, body: string | null, title: string): string {
  if (excerpt && excerpt.trim()) return excerpt.trim().slice(0, 300);
  if (body && body.trim()) {
    const t = body.replace(/\s+/g, " ").trim();
    return t.slice(0, 300) + (t.length > 300 ? "…" : "");
  }
  return `Материал блога MyWaveTour: ${title}`.slice(0, 300);
}
