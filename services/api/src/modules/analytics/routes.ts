import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { requireInternalAnalyticsToken } from "../../middleware/internalAnalytics";
import { ingestEventsBatch } from "./service";
import { runAnalyticsAlerts } from "./alerts";
import { parsePeriodEndQuery, runMartRefreshWithLog, runScoresRecalculate } from "./opsRunner";

export function internalAnalyticsRoutes(env: Env): Router {
  const router = Router();
  const guard = requireInternalAnalyticsToken(env);

  router.post("/events", guard, async (req: Request, res: Response) => {
    const events = req.body?.events;
    if (!Array.isArray(events) || events.length === 0) {
      res.status(400).json({ error: "body.events must be a non-empty array" });
      return;
    }
    if (events.length > 500) {
      res.status(400).json({ error: "batch too large (max 500)" });
      return;
    }
    const summary = await ingestEventsBatch(env, events);
    res.json({ ok: true, ...summary });
  });

  router.post("/refresh", guard, async (_req: Request, res: Response) => {
    const result = await runMartRefreshWithLog();
    if (result.ok) {
      res.json({ ok: true, durationMs: result.durationMs });
    } else {
      res.status(500).json({ ok: false, error: result.error, durationMs: result.durationMs });
    }
  });

  router.post("/scores/recalculate", guard, async (req: Request, res: Response) => {
    const periodEnd = parsePeriodEndQuery(req.query.period_end as string | undefined);
    const out = await runScoresRecalculate(env, periodEnd);
    res.json({ ok: true, ...out });
  });

  router.post("/alerts/run", guard, async (_req: Request, res: Response) => {
    const result = await runAnalyticsAlerts();
    res.json({ ok: true, ...result });
  });

  return router;
}
