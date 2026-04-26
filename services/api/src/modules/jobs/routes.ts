import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { requireAdmin } from "../../middleware/auth";
import { getJobDashboard, runDailySyncJob, runDedupJob, runIngestionJob, runNormalizationJob } from "../ingestion/service";
import { runContentDraftGenerationJob } from "../content-pipeline/draft.service";
import { sendDraftToOwner } from "../content-pipeline/approval.service";
import { processReviewRequestQueue } from "../reviews/reviewRequests";
import { safeError } from "../../lib/safeLogger";
import { generateOrganizerOutreachCampaigns, sendOutreachEmailForCampaign } from "../organizer-outreach/service";
import { runContentPipeline } from "../content-pipeline/pipeline.runner";

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
      safeError("jobs.run-ingestion failed", error);
      res.status(400).json({ error: "Job failed" });
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
      safeError("jobs.run-daily-sync failed", error);
      res.status(400).json({ error: "Job failed" });
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
      safeError("jobs.run-normalization failed", error);
      res.status(400).json({ error: "Job failed" });
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
      safeError("jobs.run-dedup failed", error);
      res.status(400).json({ error: "Job failed" });
    }
  });

  router.post("/send-content-draft-to-telegram", admin, async (req: Request, res: Response) => {
    try {
      const id = typeof req.body?.contentDraftId === "string" ? req.body.contentDraftId : "";
      if (!id) {
        res.status(400).json({ error: "contentDraftId required" });
        return;
      }
      const result = await sendDraftToOwner(env, id, { actorId: req.adminUserId ?? null });
      res.json(result);
    } catch (error) {
      safeError("jobs.send-content-draft failed", error);
      res.status(400).json({ error: "Job failed" });
    }
  });

  router.post("/run-content-pipeline", admin, async (req: Request, res: Response) => {
    try {
      const sourceIds = Array.isArray(req.body?.sourceIds)
        ? req.body.sourceIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : undefined;
      const draftLimit =
        typeof req.body?.draftLimit === "number" && Number.isFinite(req.body.draftLimit)
          ? Math.floor(req.body.draftLimit)
          : undefined;
      const contentItemIdsForDrafts = Array.isArray(req.body?.contentItemIdsForDrafts)
        ? req.body.contentItemIdsForDrafts.filter(
            (value: unknown): value is string => typeof value === "string" && value.length > 0,
          )
        : undefined;
      const out = await runContentPipeline(req.adminUserId ?? null, {
        sourceIds,
        draftLimit,
        contentItemIdsForDrafts,
      });
      res.json(out);
    } catch (error) {
      safeError("jobs.run-content-pipeline failed", error);
      res.status(400).json({ error: "Job failed" });
    }
  });

  router.post("/run-content-drafts", admin, async (req: Request, res: Response) => {
    try {
      const contentItemIds = Array.isArray(req.body?.contentItemIds)
        ? req.body.contentItemIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        : undefined;
      const limit =
        typeof req.body?.limit === "number" && Number.isFinite(req.body.limit)
          ? Math.floor(req.body.limit)
          : undefined;
      const result = await runContentDraftGenerationJob(req.adminUserId ?? null, { contentItemIds, limit });
      res.json(result);
    } catch (error) {
      safeError("jobs.run-content-drafts failed", error);
      res.status(400).json({ error: "Job failed" });
    }
  });

  router.post("/run-review-reminders", admin, async (_req: Request, res: Response) => {
    try {
      const out = await processReviewRequestQueue();
      res.json({ ok: true, ...out });
    } catch (error) {
      safeError("jobs.run-review-reminders failed", error);
      res.status(400).json({ error: "Job failed" });
    }
  });

  router.post("/generate-organizer-outreach", admin, async (req: Request, res: Response) => {
    try {
      const r = await generateOrganizerOutreachCampaigns(env, req.adminUserId ?? null);
      res.json(r);
    } catch (error) {
      safeError("jobs.generate-organizer-outreach failed", error);
      res.status(400).json({ error: "Job failed" });
    }
  });

  router.post("/send-approved-organizer-outreach", admin, async (req: Request, res: Response) => {
    const id = typeof req.body?.campaignId === "string" ? req.body.campaignId : "";
    if (!id) {
      res.status(400).json({ error: "campaignId required" });
      return;
    }
    const r = await sendOutreachEmailForCampaign(env, id, req.adminUserId ?? null);
    if (!r.ok) {
      res.status(400).json({ error: r.error });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
