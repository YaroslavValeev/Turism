import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";
import { handleApprovalDecision, sendDraftToOwner } from "./approval.service";
import { MAX_CONTENT_PUBLICATION_RETRY, publishDraft, retryFailedPublication } from "./publisher.service";

export function contentPipelineRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/items", admin, async (req: Request, res: Response) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const minRevenueRaw = req.query.minRevenue;
    const minRevenue =
      typeof minRevenueRaw === "string" && minRevenueRaw.trim() !== ""
        ? Math.max(0, parseInt(minRevenueRaw, 10) || 0)
        : 0;
    const minLeadsRaw = req.query.minLeads;
    const minLeads =
      typeof minLeadsRaw === "string" && minLeadsRaw.trim() !== "" ? Math.max(0, parseInt(minLeadsRaw, 10) || 0) : 0;

    const where: Prisma.ContentItemWhereInput = {};
    if (status) where.workflowStatus = status as never;

    if (minRevenue > 0 || minLeads > 0) {
      const having: Prisma.Sql[] = [];
      if (minRevenue > 0) having.push(Prisma.sql`SUM("revenueRub") >= ${minRevenue}`);
      if (minLeads > 0) having.push(Prisma.sql`SUM("leads") >= ${minLeads}`);
      const havingClause = Prisma.join(having, " AND ");
      const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "contentItemId" as id
        FROM "content_metrics"
        GROUP BY "contentItemId"
        HAVING ${havingClause}
      `);
      const ids = rows.map((r) => r.id);
      if (!ids.length) {
        res.json([]);
        return;
      }
      where.id = { in: ids };
    }

    const items = await prisma.contentItem.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        rawItem: { select: { sourceUrl: true, rawTitle: true, sourceType: true } },
        drafts: {
          orderBy: [{ createdAt: "desc" }],
          take: 5,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    res.json(items);
  });

  router.get("/approvals", admin, async (_req: Request, res: Response) => {
    const rows = await prisma.contentApproval.findMany({
      include: {
        contentItem: { select: { id: true, workflowStatus: true } },
        contentDraft: { select: { id: true, draftType: true, version: true, generatedHeadline: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    res.json(rows);
  });

  router.get("/publications", admin, async (req: Request, res: Response) => {
    const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const where: Record<string, unknown> = {};
    if (channel) where.channel = channel;
    if (state) where.state = state;
    const pubs = await prisma.contentPublication.findMany({
      where,
      include: {
        contentDraft: { select: { id: true, draftType: true, version: true, generatedHeadline: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    res.json(pubs);
  });

  router.get("/blog-posts", admin, async (_req: Request, res: Response) => {
    const rows = await prisma.blogPost.findMany({
      orderBy: { publishedAt: "desc" },
      take: 300,
    });
    res.json(rows);
  });

  router.get("/blog-posts/:id", admin, async (req: Request, res: Response) => {
    const row = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(row);
  });

  router.patch("/blog-posts/:id", admin, async (req: Request, res: Response) => {
    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.BlogPostUpdateInput = {};

    function strOrNull(v: unknown): string | null {
      if (v === null || v === undefined) return null;
      if (typeof v !== "string") return null;
      return v.trim() || null;
    }

    const optText = (k: string) => b[k];
    if (optText("seoTitle") === null) data.seoTitle = null;
    else if (typeof optText("seoTitle") === "string") data.seoTitle = strOrNull(optText("seoTitle"));
    if (optText("seoDescription") === null) data.seoDescription = null;
    else if (typeof optText("seoDescription") === "string") data.seoDescription = strOrNull(optText("seoDescription"));
    if (optText("canonicalUrl") === null) data.canonicalUrl = null;
    else if (typeof optText("canonicalUrl") === "string") data.canonicalUrl = strOrNull(optText("canonicalUrl"));
    if (optText("ogImage") === null) data.ogImage = null;
    else if (typeof optText("ogImage") === "string") data.ogImage = strOrNull(optText("ogImage"));

    if (optText("discipline") === null) data.discipline = null;
    else if (typeof optText("discipline") === "string") data.discipline = strOrNull(optText("discipline"));
    if (optText("region") === null) data.region = null;
    else if (typeof optText("region") === "string") data.region = strOrNull(optText("region"));
    if (optText("country") === null) data.country = null;
    else if (typeof optText("country") === "string") data.country = strOrNull(optText("country"));

    if (typeof b.title === "string" && b.title.trim()) data.title = b.title.trim();
    if (b.excerpt === null) data.excerpt = null;
    else if (typeof b.excerpt === "string") data.excerpt = b.excerpt;
    if (b.body === null) data.body = null;
    else if (typeof b.body === "string") data.body = b.body;
    if (b.status === "string" && ["published", "draft", "archived"].includes(b.status)) {
      data.status = b.status;
    }
    if (b.sourceUrl === null) data.sourceUrl = null;
    else if (typeof b.sourceUrl === "string") data.sourceUrl = b.sourceUrl;

    if (Array.isArray(b.tags)) {
      const tags = (b.tags as unknown[]).filter((x): x is string => typeof x === "string");
      data.tags = { set: tags };
    }
    if (Array.isArray(b.relatedProgramIds)) {
      const ids = (b.relatedProgramIds as unknown[]).filter((x): x is string => typeof x === "string");
      data.relatedProgramIds = { set: ids };
    }
    if (Array.isArray(b.relatedOrganizerIds)) {
      const ids = (b.relatedOrganizerIds as unknown[]).filter((x): x is string => typeof x === "string");
      data.relatedOrganizerIds = { set: ids };
    }
    if (Array.isArray(b.relatedCollectionIds)) {
      const ids = (b.relatedCollectionIds as unknown[]).filter((x): x is string => typeof x === "string");
      data.relatedCollectionIds = { set: ids };
    }

    if (typeof b.slug === "string" && b.slug.trim()) {
      const nextSlug = b.slug.trim();
      const clash = await prisma.blogPost.findFirst({
        where: { placement: existing.placement, slug: nextSlug, NOT: { id: existing.id } },
      });
      if (clash) {
        res.status(400).json({ error: "slug_taken" });
        return;
      }
      data.slug = nextSlug;
    }

    try {
      const row = await prisma.blogPost.update({ where: { id: existing.id }, data });
      res.json(row);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/drafts/:id/send-owner", admin, async (req: Request, res: Response) => {
    const out = await sendDraftToOwner(env, req.params.id, { actorId: req.adminUserId || null });
    if (!out.ok) {
      res.status(400).json(out);
      return;
    }
    res.json(out);
  });

  router.post("/drafts/:id/decision", admin, async (req: Request, res: Response) => {
    const decision = String(req.body?.decision || "");
    if (!["approved", "rejected", "rewrite_requested", "deferred", "skipped"].includes(decision)) {
      res.status(400).json({ error: "invalid decision" });
      return;
    }
    const out = await handleApprovalDecision({
      contentDraftId: req.params.id,
      decision: decision as "approved" | "rejected" | "rewrite_requested" | "deferred" | "skipped",
      decidedBy: req.adminUserId || "admin",
      comment: typeof req.body?.comment === "string" ? req.body.comment : null,
      source: "admin",
    });
    if (!out.ok) {
      res.status(400).json(out);
      return;
    }
    res.json(out);
  });

  router.post("/publish", admin, async (req: Request, res: Response) => {
    const draftId = typeof req.body?.draftId === "string" ? req.body.draftId : "";
    const channels = Array.isArray(req.body?.channels)
      ? req.body.channels.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (!draftId || !channels.length) {
      res.status(400).json({ error: "draftId and channels[] required" });
      return;
    }
    try {
      const out = await publishDraft(env, {
        draftId,
        channels: channels as never[],
        actorId: req.adminUserId || null,
      });
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/publications/:id/retry", admin, async (req: Request, res: Response) => {
    const out = await retryFailedPublication(env, req.params.id, req.adminUserId || null);
    if (!out.ok) {
      res.status(400).json(out);
      return;
    }
    res.json(out);
  });

  /** Пакетный retry failed-публикаций (тот же лимит retry, что и у публикации). */
  router.post("/publications/retry-failed", admin, async (req: Request, res: Response) => {
    const limit = Math.min(30, Math.max(1, parseInt(String(req.body?.limit ?? 20), 10) || 20));
    const failed = await prisma.contentPublication.findMany({
      where: { state: "failed", retryCount: { lt: MAX_CONTENT_PUBLICATION_RETRY } },
      take: limit,
      orderBy: { updatedAt: "asc" },
    });
    const results: { id: string; ok: boolean; message: string }[] = [];
    for (const p of failed) {
      const out = await retryFailedPublication(env, p.id, req.adminUserId || null);
      results.push({ id: p.id, ok: out.ok, message: out.message });
    }
    res.json({ count: results.length, results });
  });

  /** Массовое owner/admin-решение по черновикам (тот же контракт, что `POST /drafts/:id/decision`). */
  router.post("/drafts/bulk-decision", admin, async (req: Request, res: Response) => {
    const rawIds = req.body?.draftIds;
    const draftIds = Array.isArray(rawIds) ? rawIds.filter((x: unknown): x is string => typeof x === "string") : [];
    if (!draftIds.length || draftIds.length > 30) {
      res.status(400).json({ error: "draftIds: 1..30" });
      return;
    }
    const decision = String(req.body?.decision || "");
    if (!["approved", "rejected", "rewrite_requested", "deferred", "skipped"].includes(decision)) {
      res.status(400).json({ error: "invalid decision" });
      return;
    }
    const decidedBy = req.adminUserId || "admin";
    const comment = typeof req.body?.comment === "string" ? req.body.comment : null;
    const results: { draftId: string; ok: boolean; error?: string }[] = [];
    for (const contentDraftId of draftIds) {
      const out = await handleApprovalDecision({
        contentDraftId,
        decision: decision as
          | "approved"
          | "rejected"
          | "rewrite_requested"
          | "deferred"
          | "skipped",
        decidedBy,
        comment,
        source: "admin",
      });
      if (out.ok) {
        results.push({ draftId: contentDraftId, ok: true });
      } else {
        results.push({ draftId: contentDraftId, ok: false, error: "error" in out ? out.error : "unknown" });
      }
    }
    res.json({ results });
  });

  // --- G3: content collections (admin) ---

  router.get("/content-collections", admin, async (_req: Request, res: Response) => {
    const rows = await prisma.contentCollection.findMany({
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    res.json(rows);
  });

  router.get("/content-collections/:id", admin, async (req: Request, res: Response) => {
    const row = await prisma.contentCollection.findUnique({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(row);
  });

  router.post("/content-collections", admin, async (req: Request, res: Response) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const slug = String(b.slug || "").trim();
    const title = String(b.title || "").trim();
    if (!slug || !title) {
      res.status(400).json({ error: "slug and title required" });
      return;
    }
    const taken = await prisma.contentCollection.findUnique({ where: { slug } });
    if (taken) {
      res.status(400).json({ error: "slug_taken" });
      return;
    }
    const status = b.status === "published" ? "published" : "draft";
    const publishedAt =
      status === "published"
        ? (typeof b.publishedAt === "string" && b.publishedAt ? new Date(b.publishedAt) : new Date())
        : b.publishedAt === null || b.publishedAt === undefined
          ? null
          : typeof b.publishedAt === "string" && b.publishedAt
            ? new Date(b.publishedAt)
            : null;
    const tags = Array.isArray(b.tags) ? (b.tags as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const relB =
      Array.isArray(b.relatedBlogPostIds) ? (b.relatedBlogPostIds as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const relP =
      Array.isArray(b.relatedProgramIds) ? (b.relatedProgramIds as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const relO =
      Array.isArray(b.relatedOrganizerIds) ? (b.relatedOrganizerIds as unknown[]).filter((x): x is string => typeof x === "string") : [];
    try {
      const row = await prisma.contentCollection.create({
        data: {
          slug,
          title,
          description: typeof b.description === "string" ? b.description : null,
          body: typeof b.body === "string" ? b.body : null,
          status,
          collectionType: typeof b.collectionType === "string" ? b.collectionType : "manual",
          discipline: typeof b.discipline === "string" ? b.discipline : null,
          region: typeof b.region === "string" ? b.region : null,
          country: typeof b.country === "string" ? b.country : null,
          season: typeof b.season === "string" ? b.season : null,
          seoTitle: typeof b.seoTitle === "string" ? b.seoTitle : null,
          seoDescription: typeof b.seoDescription === "string" ? b.seoDescription : null,
          canonicalUrl: typeof b.canonicalUrl === "string" ? b.canonicalUrl : null,
          ogImage: typeof b.ogImage === "string" ? b.ogImage : null,
          tags,
          relatedBlogPostIds: relB,
          relatedProgramIds: relP,
          relatedOrganizerIds: relO,
          publishedAt,
        },
      });
      res.json(row);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.patch("/content-collections/:id", admin, async (req: Request, res: Response) => {
    const existing = await prisma.contentCollection.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.ContentCollectionUpdateInput = {};

    function strOrNull(v: unknown): string | null {
      if (v === null || v === undefined) return null;
      if (typeof v !== "string") return null;
      return v.trim() || null;
    }

    if (typeof b.slug === "string" && b.slug.trim()) {
      const nextSlug = b.slug.trim();
      if (nextSlug !== existing.slug) {
        const clash = await prisma.contentCollection.findFirst({ where: { slug: nextSlug, NOT: { id: existing.id } } });
        if (clash) {
          res.status(400).json({ error: "slug_taken" });
          return;
        }
      }
      data.slug = nextSlug;
    }
    if (typeof b.title === "string" && b.title.trim()) data.title = b.title.trim();
    if (b.description === null) data.description = null;
    else if (typeof b.description === "string") data.description = b.description;
    if (b.body === null) data.body = null;
    else if (typeof b.body === "string") data.body = b.body;
    if (typeof b.status === "string" && ["draft", "published"].includes(b.status)) {
      data.status = b.status;
      if (b.status === "published" && !existing.publishedAt && b.publishedAt === undefined) {
        data.publishedAt = new Date();
      }
    }
    if (b.publishedAt === null) data.publishedAt = null;
    else if (typeof b.publishedAt === "string" && b.publishedAt) data.publishedAt = new Date(b.publishedAt);
    if (typeof b.collectionType === "string") data.collectionType = b.collectionType;
    if (b.discipline === null) data.discipline = null;
    else if (typeof b.discipline === "string") data.discipline = strOrNull(b.discipline);
    if (b.region === null) data.region = null;
    else if (typeof b.region === "string") data.region = strOrNull(b.region);
    if (b.country === null) data.country = null;
    else if (typeof b.country === "string") data.country = strOrNull(b.country);
    if (b.season === null) data.season = null;
    else if (typeof b.season === "string") data.season = strOrNull(b.season);
    if (b.seoTitle === null) data.seoTitle = null;
    else if (typeof b.seoTitle === "string") data.seoTitle = strOrNull(b.seoTitle);
    if (b.seoDescription === null) data.seoDescription = null;
    else if (typeof b.seoDescription === "string") data.seoDescription = strOrNull(b.seoDescription);
    if (b.canonicalUrl === null) data.canonicalUrl = null;
    else if (typeof b.canonicalUrl === "string") data.canonicalUrl = strOrNull(b.canonicalUrl);
    if (b.ogImage === null) data.ogImage = null;
    else if (typeof b.ogImage === "string") data.ogImage = strOrNull(b.ogImage);
    if (Array.isArray(b.tags)) {
      data.tags = { set: (b.tags as unknown[]).filter((x): x is string => typeof x === "string") };
    }
    if (Array.isArray(b.relatedBlogPostIds)) {
      data.relatedBlogPostIds = {
        set: (b.relatedBlogPostIds as unknown[]).filter((x): x is string => typeof x === "string"),
      };
    }
    if (Array.isArray(b.relatedProgramIds)) {
      data.relatedProgramIds = { set: (b.relatedProgramIds as unknown[]).filter((x): x is string => typeof x === "string") };
    }
    if (Array.isArray(b.relatedOrganizerIds)) {
      data.relatedOrganizerIds = { set: (b.relatedOrganizerIds as unknown[]).filter((x): x is string => typeof x === "string") };
    }

    try {
      const row = await prisma.contentCollection.update({ where: { id: existing.id }, data });
      res.json(row);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  return router;
}

