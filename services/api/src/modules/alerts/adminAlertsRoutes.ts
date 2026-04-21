/**
 * Единая read-only выдача governance alerts (те же данные, что GET /admin/economics/alerts).
 */
import { Router, type Request, type Response } from "express";
import type { Env } from "@mywave/config";
import { requireAdmin } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { getGovernanceAlertsDashboard } from "../economics/governanceAlerts/runCycle";

export function adminAlertsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", admin, async (_req: Request, res: Response) => {
    try {
      const dash = await getGovernanceAlertsDashboard(prisma);
      res.setHeader("Cache-Control", "no-store");
      res.json(dash);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "governance_alerts_failed" });
    }
  });

  return router;
}
