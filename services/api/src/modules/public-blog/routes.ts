import { Router, type Request, type Response } from "express";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { loadBlogRelated } from "./related";
import { resolveBlogSeo } from "./resolve";

/**
 * Публичное чтение опубликованных материалов блога (без admin JWT).
 * placement=blog, status=published.
 */
export function publicBlogRoutes(env: Env): Router {
  const router = Router();

  const listQuery = {
    where: { placement: "blog", status: "published" as const },
    orderBy: { publishedAt: "desc" as const },
  };

  router.get("/blog", async (req: Request, res: Response) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const [rows, total] = await Promise.all([
      prisma.blogPost.findMany({
        ...listQuery,
        take: limit,
        skip: offset,
      }),
      prisma.blogPost.count({ where: listQuery.where }),
    ]);
    res.json({
      ok: true,
      total,
      items: rows.map((r) => {
        const path = `/blog/${r.slug}`;
        const resolved = resolveBlogSeo(env, r, path);
        return {
          id: r.id,
          slug: r.slug,
          title: r.title,
          excerpt: r.excerpt,
          publishedAt: r.publishedAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          sourceUrl: r.sourceUrl,
          tags: r.tags,
          discipline: r.discipline,
          region: r.region,
          country: r.country,
          seoTitle: r.seoTitle,
          seoDescription: r.seoDescription,
          canonicalUrl: r.canonicalUrl,
          ogImage: r.ogImage,
          resolved: {
            seoTitle: resolved.seoTitle,
            seoDescription: resolved.seoDescription,
            canonicalUrl: resolved.canonicalUrl,
            ogImage: resolved.ogImage,
          },
        };
      }),
    });
  });

  router.get("/blog/:slug/related", async (req: Request, res: Response) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      res.status(400).json({ error: "missing slug" });
      return;
    }
    const row = await prisma.blogPost.findFirst({
      where: { placement: "blog", status: "published", slug },
      orderBy: { publishedAt: "desc" },
    });
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const data = await loadBlogRelated(env, {
      id: row.id,
      slug: row.slug,
      placement: row.placement,
      relatedProgramIds: row.relatedProgramIds,
      relatedOrganizerIds: row.relatedOrganizerIds,
      discipline: row.discipline,
      region: row.region,
    });
    res.json({ ok: true, ...data });
  });

  router.get("/blog/:slug", async (req: Request, res: Response) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      res.status(400).json({ error: "missing slug" });
      return;
    }
    const row = await prisma.blogPost.findFirst({
      where: {
        placement: "blog",
        status: "published",
        slug,
      },
      orderBy: { publishedAt: "desc" },
    });
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const path = `/blog/${row.slug}`;
    const resolved = resolveBlogSeo(env, row, path);
    res.json({
      ok: true,
      post: {
        id: row.id,
        contentItemId: row.contentItemId,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        body: row.body,
        sourceUrl: row.sourceUrl,
        publishedAt: row.publishedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        canonicalUrl: row.canonicalUrl,
        ogImage: row.ogImage,
        tags: row.tags,
        discipline: row.discipline,
        region: row.region,
        country: row.country,
        relatedProgramIds: row.relatedProgramIds,
        relatedOrganizerIds: row.relatedOrganizerIds,
        resolved: {
          seoTitle: resolved.seoTitle,
          seoDescription: resolved.seoDescription,
          canonicalUrl: resolved.canonicalUrl,
          ogImage: resolved.ogImage,
        },
      },
    });
  });

  return router;
}
