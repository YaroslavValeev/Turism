import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { publicMethodology, sortPublicSpots, toPublicSpot } from "./publicView";

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
