/**
 * Чтение доменных статусных событий (таймлайн в админке).
 */
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";
import type { Env } from "@mywave/config";

export function domainStatusEventsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", admin, async (req: Request, res: Response) => {
    const entityType = typeof req.query.entity_type === "string" ? req.query.entity_type.trim() : "";
    const entityId = typeof req.query.entity_id === "string" ? req.query.entity_id.trim() : "";
    if (!entityType || !entityId) {
      res.status(400).json({ error: "entity_type and entity_id required" });
      return;
    }
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 80;
    const items = await prisma.domainStatusEvent.findMany({
      where: { entityType, entityId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    res.json({ items });
  });

  return router;
}
