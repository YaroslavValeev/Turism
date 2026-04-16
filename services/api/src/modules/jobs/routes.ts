import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { requireAdmin } from "../../middleware/auth";
import { getJobDashboard, runDailySyncJob, runDedupJob, runIngestionJob, runNormalizationJob } from "../ingestion/service";
import { processReviewRequestQueue } from "../reviews/reviewRequests";

export function jobsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/", admin, async (_req: Request, res: Response) => {
    const dashboard = await getJobDashboard();
    res.json(dashboard);
  });

  router.post("/run-ingestion", admin, async (req: Request, res: Response) => {
    try {
      const sourceIds = Array.isArray(req.body?.sourceIds)
        ? req.body.sourceIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : undefined;
      const result = await runIngestionJob(req.adminUserId ?? null, sourceIds);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Job failed" });
    }
  });

  router.post("/run-daily-sync", admin, async (req: Request, res: Response) => {
    try {
      const result = await runDailySyncJob(req.adminUserId ?? null, {
        autoPublishEnabled: env.INGESTION_AUTOPUBLISH_ENABLED,
        fallbackImageUrl: env.INGESTION_DEFAULT_FALLBACK_IMAGE_URL,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Job failed" });
    }
  });

  router.post("/run-normalization", admin, async (req: Request, res: Response) => {
    try {
      const sourceIds = Array.isArray(req.body?.sourceIds)
        ? req.body.sourceIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : undefined;
      const result = await runNormalizationJob(req.adminUserId ?? null, sourceIds);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Job failed" });
    }
  });

  router.post("/run-dedup", admin, async (req: Request, res: Response) => {
    try {
      const sourceIds = Array.isArray(req.body?.sourceIds)
        ? req.body.sourceIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : undefined;
      const result = await runDedupJob(req.adminUserId ?? null, sourceIds);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Job failed" });
    }
  });

  router.post("/run-review-reminders", admin, async (_req: Request, res: Response) => {
    try {
      const out = await processReviewRequestQueue();
      res.json({ ok: true, ...out });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Job failed" });
    }
  });

  return router;
}
