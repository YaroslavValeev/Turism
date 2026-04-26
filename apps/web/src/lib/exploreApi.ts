import { getServerApiBaseUrl } from "./serverApiBase";
import type { PublicProgramRelated } from "./blogApi";

export type ExploreHubType = "discipline" | "region" | "season";

export type ExploreListItem = {
  type: ExploreHubType;
  slug: string;
  label: string;
  counts: { blogPosts: number; programs: number; collections: number; total: number };
  updatedAt: string;
};

export type ResolvedExploreSeo = {
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImage: string;
};

export type ExploreHubPayload = {
  type: ExploreHubType;
  slug: string;
  label: string;
  resolved: ResolvedExploreSeo;
  blogPosts: {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    publishedAt: string;
    updatedAt: string;
    resolved: ResolvedExploreSeo;
  }[];
  collections: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    publishedAt: string | null;
    updatedAt: string;
    resolved: ResolvedExploreSeo;
  }[];
  programs: PublicProgramRelated[];
  counts: { blogPosts: number; programs: number; collections: number; total: number };
  breadcrumbs: { items: { name: string; path: string | null }[] };
};

export async function fetchPublicExploreList(): Promise<ExploreListItem[]> {
  const base = getServerApiBaseUrl();
  const res = await fetch(`${base}/public/explore`, { next: { revalidate: 300 } });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: ExploreListItem[] };
  return data.items ?? [];
}

export async function fetchPublicExploreHub(type: string, slug: string): Promise<ExploreHubPayload | null> {
  const t = type.trim();
  const s = decodeURIComponent(slug).trim();
  if (!s) return null;
  const base = getServerApiBaseUrl();
  const res = await fetch(`${base}/public/explore/${encodeURIComponent(t)}/${encodeURIComponent(s)}`, {
    next: { revalidate: 300 },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { ok?: boolean; hub?: ExploreHubPayload };
  return data.hub ?? null;
}
