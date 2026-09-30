import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { parseCompareIds, publicMethodology, sortPublicSpots, toPublicSpot } from "./publicView";

function publicSpotInclude(now: Date) {
  return {
    serviceUnits: {
      where: { isActive: true },
      orderBy: { createdAt: "asc" as const },
      include: {
        snapshots: {
          where: { publishedAt: { not: null }, revokedAt: null, expiresAt: { gt: now } },
          orderBy: { publishedAt: "desc" as const },
          take: 1,
        },
      },
    },
  };
}

export function publicSpotsRoutes(): Router {
  const router = Router();

  router.get("/spots/methodology", (_req: Request, res: Response) => {
    res.json({ ok: true, methodology: publicMethodology() });
  });

  router.get("/spots", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const region = typeof req.query.region === "string" && req.query.region.trim() ? req.query.region.trim() : undefined;
      const rows = await prisma.spot.findMany({
        where: { discoveryStatus: "listed", ...(region ? { region } : {}) },
        include: publicSpotInclude(now),
        take: 500,
      });
      const items = sortPublicSpots(rows.map((row) => toPublicSpot(row, now)));
      res.json({ ok: true, total: items.length, items });
    } catch (error) {
      next(error);
    }
  });

  router.get("/spots/compare", async (req: Request, res: Response, next: NextFunction) => {
    const parsed = parseCompareIds(req.query.ids);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const now = new Date();
      const rows = await prisma.spot.findMany({
        where: { id: { in: parsed.ids }, discoveryStatus: "listed" },
        include: publicSpotInclude(now),
      });
      const byId = new Map(rows.map((row) => [row.id, toPublicSpot(row, now)]));
      const items = parsed.ids.map((id) => byId.get(id)).filter((s) => s !== undefined);
      res.json({ ok: true, items, missing: parsed.ids.filter((id) => !byId.has(id)) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/spots/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const row = await prisma.spot.findFirst({
        where: { id: String(req.params.id), discoveryStatus: "listed" },
        include: publicSpotInclude(now),
      });
      if (!row) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.json({ ok: true, spot: toPublicSpot(row, now) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
