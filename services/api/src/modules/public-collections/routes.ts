import { Router, type Request, type Response } from "express";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { loadCollectionRelated } from "./related";
import { publicCollectionVisibilityWhere, resolveCollectionSeo } from "./resolve";

export function publicCollectionsRoutes(env: Env): Router {
  const router = Router();
  const pub = publicCollectionVisibilityWhere();

  router.get("/collections", async (req: Request, res: Response) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 48));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const [rows, total] = await Promise.all([
      prisma.contentCollection.findMany({
        where: pub,
        orderBy: { publishedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.contentCollection.count({ where: pub }),
    ]);
    res.json({
      ok: true,
      total,
      items: rows.map((r) => {
        const path = `/collections/${r.slug}`;
        const resolved = resolveCollectionSeo(env, r, path);
        return {
          id: r.id,
          slug: r.slug,
          title: r.title,
          description: r.description,
          publishedAt: r.publishedAt?.toISOString() ?? null,
          updatedAt: r.updatedAt.toISOString(),
          tags: r.tags,
          discipline: r.discipline,
          region: r.region,
          season: r.season,
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

  router.get("/collections/:slug/related", async (req: Request, res: Response) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      res.status(400).json({ error: "missing slug" });
      return;
    }
    const col = await prisma.contentCollection.findUnique({ where: { slug } });
    if (!col || col.status !== "published" || !col.publishedAt || col.publishedAt > new Date()) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const data = await loadCollectionRelated(env, col);
    res.json({ ok: true, ...data });
  });

  router.get("/collections/:slug", async (req: Request, res: Response) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      res.status(400).json({ error: "missing slug" });
      return;
    }
    const row = await prisma.contentCollection.findUnique({ where: { slug } });
    if (!row || row.status !== "published" || !row.publishedAt || row.publishedAt > new Date()) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const path = `/collections/${row.slug}`;
    const resolved = resolveCollectionSeo(env, row, path);
    res.json({
      ok: true,
      collection: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        body: row.body,
        status: row.status,
        collectionType: row.collectionType,
        discipline: row.discipline,
        region: row.region,
        country: row.country,
        season: row.season,
        tags: row.tags,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        canonicalUrl: row.canonicalUrl,
        ogImage: row.ogImage,
        relatedBlogPostIds: row.relatedBlogPostIds,
        relatedProgramIds: row.relatedProgramIds,
        relatedOrganizerIds: row.relatedOrganizerIds,
        publishedAt: row.publishedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
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
