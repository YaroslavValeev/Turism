import type { MetadataRoute } from "next";
import { getServerApiBaseUrl } from "../lib/serverApiBase";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mywavetour.ru").replace(/\/+$/, "");
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/blog`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/collections`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.78,
    },
    {
      url: `${siteUrl}/explore`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.76,
    },
    {
      url: `${siteUrl}/organizers/program`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/organizers/verification`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/privacy-and-consent`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const base = getServerApiBaseUrl();
  try {
    const res = await fetch(`${base}/public/blog?limit=500`, { next: { revalidate: 300 } });
    if (res.ok) {
      const data = (await res.json()) as { items?: { slug: string; updatedAt: string }[] };
      const items = data.items ?? [];
      for (const it of items) {
        staticEntries.push({
          url: `${siteUrl}/blog/${encodeURIComponent(it.slug)}`,
          lastModified: new Date(it.updatedAt),
          changeFrequency: "weekly",
          priority: 0.65,
        });
      }
    }
  } catch {
    // sitemap остаётся со статическими URL, если API недоступен на билде
  }

  try {
    const resCol = await fetch(`${base}/public/collections?limit=500`, { next: { revalidate: 300 } });
    if (resCol.ok) {
      const data = (await resCol.json()) as { items?: { slug: string; updatedAt: string }[] };
      for (const it of data.items ?? []) {
        staticEntries.push({
          url: `${siteUrl}/collections/${encodeURIComponent(it.slug)}`,
          lastModified: new Date(it.updatedAt),
          changeFrequency: "weekly",
          priority: 0.68,
        });
      }
    }
  } catch {
    // ignore
  }

  try {
    const resEx = await fetch(`${base}/public/explore`, { next: { revalidate: 300 } });
    if (resEx.ok) {
      const data = (await resEx.json()) as {
        items?: { type: string; slug: string; updatedAt: string }[];
      };
      for (const it of data.items ?? []) {
        staticEntries.push({
          url: `${siteUrl}/explore/${encodeURIComponent(it.type)}/${encodeURIComponent(it.slug)}`,
          lastModified: new Date(it.updatedAt),
          changeFrequency: "weekly",
          priority: 0.72,
        });
      }
    }
  } catch {
    // ignore
  }

  return staticEntries;
}
