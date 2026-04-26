import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { requireInternalAnalyticsToken } from "../../middleware/internalAnalytics";
import { createContentFromMarketing } from "./marketingBootstrap";
import { safeError } from "../../lib/safeLogger";

export function internalContentPipelineRoutes(env: Env): Router {
  const router = Router();
  const guard = requireInternalAnalyticsToken(env);

  router.post("/create-from-marketing", guard, async (req: Request, res: Response) => {
    const b = req.body as { topic?: string; source?: string; action_type?: string };
    const topic = typeof b.topic === "string" ? b.topic.trim() : "";
    const source = typeof b.source === "string" ? b.source.trim() : "";
    const actionType = typeof b.action_type === "string" ? b.action_type.trim() : "";
    if (!topic || !source || !actionType) {
      res.status(400).json({ error: "topic, source, action_type required" });
      return;
    }
    try {
      const out = await createContentFromMarketing("internal:marketing", { topic, source, actionType });
      res.status(201).json(out);
    } catch (e) {
      safeError("internal.create-from-marketing", e);
      res.status(500).json({ error: e instanceof Error ? e.message : "failed" });
    }
  });

  return router;
}
