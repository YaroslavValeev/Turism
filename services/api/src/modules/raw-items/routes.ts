import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";

export function rawItemsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", admin, async (req: Request, res: Response) => {
    const { sourceId, hasNormalized } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (sourceId) where.sourceId = sourceId;
    if (hasNormalized === "1") where.normalizedItem = { isNot: null };
    if (hasNormalized === "0") where.normalizedItem = null;

    const items = await prisma.rawItem.findMany({
      where,
      include: {
        source: {
          select: {
            id: true,
            name: true,
            type: true,
            urlOrHandle: true,
          },
        },
        normalizedItem: {
          select: {
            id: true,
            title: true,
            discipline: true,
            startDate: true,
            confidenceScore: true,
          },
        },
      },
      orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
      take: 200,
    });

    res.json(items);
  });

  router.get("/:id", admin, async (req: Request, res: Response) => {
    const item = await prisma.rawItem.findUnique({
      where: { id: req.params.id },
      include: {
        source: true,
        normalizedItem: {
          include: {
            candidates: {
              include: {
                dedupGroup: true,
                publishedProgram: true,
              },
            },
          },
        },
      },
    });

    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(item);
  });

  return router;
}
