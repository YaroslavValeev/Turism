import { Router, type Request, type Response } from "express";
import type { Env } from "@mywave/config";
import { isExploreHubType } from "@mywave/explore-links";
import { loadExploreHub, loadExploreIndex } from "./aggregator";

export function publicExploreRoutes(_env: Env): Router {
  const router = Router();

  router.get("/explore", async (_req: Request, res: Response) => {
    const items = await loadExploreIndex();
    res.json({ ok: true, total: items.length, items });
  });

  router.get("/explore/:type/:slug", async (req: Request, res: Response) => {
    const type = String(req.params.type || "").trim();
    const slug = String(req.params.slug || "").trim();
    if (!isExploreHubType(type) || !slug) {
      res.status(400).json({ error: "invalid type or slug" });
      return;
    }
    const data = await loadExploreHub(_env, type, slug);
    if (!data) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ ok: true, hub: data });
  });

  return router;
}
