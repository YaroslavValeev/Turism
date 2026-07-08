import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { runAbandonedLeadReminders, ensureReconciliationTasks, runReconciliationPrompts } from "./schedulers";

function requireInternalToken(env: Env) {
  return (req: Request, res: Response, next: () => void) => {
    const token = req.header("x-internal-token") ?? req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const expected = env.INTERNAL_ANALYTICS_TOKEN?.trim();
    if (!expected || token !== expected) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

export function telegramPlatformInternalRoutes(env: Env): Router {
  const router = Router();
  const guard = requireInternalToken(env);

  router.post("/abandoned/run", guard, async (_req, res) => {
    const result = await runAbandonedLeadReminders(env);
    res.json(result);
  });

  router.post("/reconciliation/ensure", guard, async (_req, res) => {
    const result = await ensureReconciliationTasks();
    res.json(result);
  });

  router.post("/reconciliation/run", guard, async (_req, res) => {
    await ensureReconciliationTasks();
    const result = await runReconciliationPrompts(env);
    res.json(result);
  });

  router.post("/digest/run", guard, async (_req, res) => {
    // MVP: digest job hook — полная рассылка в follow-up PR (program notify templates).
    res.json({ ok: true, sent: 0, note: "digest_runner_stub" });
  });

  return router;
}

