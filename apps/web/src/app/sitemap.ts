import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getServerApiBaseUrl, safeServerFetch } from "../lib/serverApiBase";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // API недоступен во время docker build: без этого sitemap собирался бы без программ, статей и тем.
  await connection();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mywavetour.ru").replace(/\/+$/, "");
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/blog`,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/collections`,
      changeFrequency: "weekly",
      priority: 0.78,
    },
    {
      url: `${siteUrl}/explore`,
      changeFrequency: "weekly",
      priority: 0.76,
    },
    {
      url: `${siteUrl}/organizers/program`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/organizers/verification`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/privacy-and-consent`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const base = getServerApiBaseUrl();
  {
    const resPrograms = await safeServerFetch(`${base}/programs`, { next: { revalidate: 300 } });
    if (resPrograms?.ok) {
      const data = (await resPrograms.json()) as { id?: string; updatedAt?: string }[];
      for (const it of Array.isArray(data) ? data : []) {
        if (!it.id) continue;
        const updatedAt = it.updatedAt ? new Date(it.updatedAt) : undefined;
        staticEntries.push({
          url: `${siteUrl}/program/${encodeURIComponent(it.id)}`,
          ...(updatedAt && !Number.isNaN(updatedAt.getTime()) ? { lastModified: updatedAt } : {}),
          changeFrequency: "weekly",
          priority: 0.8,
        });
      }
    }
  }

  {
    const res = await safeServerFetch(`${base}/public/blog?limit=500`, { next: { revalidate: 300 } });
    if (res?.ok) {
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
  }

  {
    const resCol = await safeServerFetch(`${base}/public/collections?limit=500`, { next: { revalidate: 300 } });
    if (resCol?.ok) {
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
  }

  {
    const resEx = await safeServerFetch(`${base}/public/explore`, { next: { revalidate: 300 } });
    if (resEx?.ok) {
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
  }

  staticEntries.push({ url: `${siteUrl}/spots/methodology`, changeFrequency: "monthly", priority: 0.5 });
  {
    const resSpots = await safeServerFetch(`${base}/public/spots`, { next: { revalidate: 300 } });
    if (resSpots?.ok) {
      const data = (await resSpots.json()) as { items?: { id: string }[] };
      const items = data.items ?? [];
      if (items.length > 0) {
        staticEntries.push({ url: `${siteUrl}/spots`, changeFrequency: "weekly", priority: 0.7 });
        for (const it of items) {
          staticEntries.push({
            url: `${siteUrl}/spots/${encodeURIComponent(it.id)}`,
            changeFrequency: "monthly",
            priority: 0.6,
          });
        }
      }
    }
  }

  return staticEntries;
}
