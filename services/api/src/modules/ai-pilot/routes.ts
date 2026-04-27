import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { requireAdmin } from "../../middleware/auth";
import { safeError } from "../../lib/safeLogger";
import { normalizeProgram } from "./normalizeProgram";
import { runCardAuditor } from "./cardAuditor";
import { checkSafetyHeuristic } from "./safetyHeuristic";
import { buildFounderPilotSummary, type FounderPilotPeriod } from "./founderPilotSummary";
import { logAiPilotAction } from "./auditAiPilot";
import { buildSeoAssistant } from "./seoAssistant";
import { buildOutreachDraft, submitOutreachDraftForOwnerApproval } from "./outreachDraft";

function adminId(req: Request): string | null {
  return req.adminUserId ?? null;
}

export function aiPilotRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  /**
   * Канон правил: AI не публикует и не шлёт без владельца; автопаблиш выключен по умолчанию.
   */
  router.get("/owner-policy", admin, (_req: Request, res: Response) => {
    res.json({
      AI_OWNER_APPROVAL_REQUIRED: env.AI_OWNER_APPROVAL_REQUIRED,
      AI_AUTOPUBLISH_ENABLED: env.AI_AUTOPUBLISH_ENABLED,
      openaiConfigured: Boolean(env.OPENAI_API_KEY?.trim()),
      AI_ENABLED: env.AI_ENABLED,
      note: "Публикация, рассылка, смена статуса/Verified, деньги — только через явные шаги админа/владельца.",
    });
  });

  router.post("/normalize", admin, async (req: Request, res: Response) => {
    const b = req.body as { text?: string; sourceUrl?: string; discipline?: string; region?: string };
    if (typeof b.text !== "string" || !b.text.trim()) {
      res.status(400).json({ error: "text required" });
      return;
    }
    const text = b.text;
    try {
      const out = await normalizeProgram(env, {
        text,
        sourceUrl: b.sourceUrl,
        discipline: b.discipline,
        region: b.region,
      });
      await logAiPilotAction("ai_normalize", {
        status: out.source === "llm" ? "ok" : "fallback",
        detail: out.reason,
        changedBy: adminId(req),
      });
      res.json({ result: out.data, meta: { source: out.source, reason: out.reason } });
    } catch (e) {
      safeError("ai.normalize", e);
      await logAiPilotAction("ai_normalize", { status: "error", detail: String(e), changedBy: adminId(req) });
      res.status(500).json({ error: "normalize_failed" });
    }
  });

  router.post("/card-auditor", admin, async (req: Request, res: Response) => {
    const card = req.body as { card?: unknown };
    if (!card || typeof card.card !== "object" || card.card === null) {
      res.status(400).json({ error: "card object required" });
      return;
    }
    try {
      const out = await runCardAuditor(env, card.card as Record<string, unknown>);
      await logAiPilotAction("ai_card_auditor", {
        status: out.source === "llm" ? "ok" : "fallback",
        changedBy: adminId(req),
      });
      res.json({ result: out.data, meta: { source: out.source } });
    } catch (e) {
      safeError("ai.card_auditor", e);
      await logAiPilotAction("ai_card_auditor", { status: "error", detail: String(e), changedBy: adminId(req) });
      res.status(500).json({ error: "card_auditor_failed" });
    }
  });

  router.post("/safety-check", admin, async (req: Request, res: Response) => {
    const b = req.body as { text?: string };
    if (typeof b.text !== "string") {
      res.status(400).json({ error: "text required" });
      return;
    }
    try {
      const result = checkSafetyHeuristic(b.text);
      await logAiPilotAction("ai_safety_check", { status: "ok", changedBy: adminId(req) });
      res.json({ result, meta: { source: "heuristic" } });
    } catch (e) {
      safeError("ai.safety_check", e);
      res.status(500).json({ error: "safety_check_failed" });
    }
  });

  router.get("/founder-summary", admin, async (req: Request, res: Response) => {
    const q = typeof req.query.period === "string" ? req.query.period : "weekly";
    const period: FounderPilotPeriod = q === "daily" ? "daily" : "weekly";
    try {
      const out = await buildFounderPilotSummary(env, period);
      await logAiPilotAction("ai_founder_summary", {
        status: out.source === "llm" ? "ok" : "fallback",
        detail: out.fallbackReason,
        changedBy: adminId(req),
      });
      res.json(out);
    } catch (e) {
      safeError("ai.founder_summary", e);
      await logAiPilotAction("ai_founder_summary", { status: "error", detail: String(e), changedBy: adminId(req) });
      res.status(500).json({ error: "founder_summary_failed" });
    }
  });

  router.get("/founder-summary/weekly", admin, async (req: Request, res: Response) => {
    try {
      const out = await buildFounderPilotSummary(env, "weekly");
      await logAiPilotAction("ai_founder_summary_weekly", {
        status: out.source === "llm" ? "ok" : "fallback",
        detail: out.fallbackReason,
        changedBy: adminId(req),
      });
      res.json(out);
    } catch (e) {
      safeError("ai.founder_summary_weekly", e);
      await logAiPilotAction("ai_founder_summary_weekly", {
        status: "error",
        detail: String(e),
        changedBy: adminId(req),
      });
      res.status(500).json({ error: "founder_summary_weekly_failed" });
    }
  });

  router.post("/seo-assistant", admin, async (req: Request, res: Response) => {
    const b = req.body as { title?: string; discipline?: string; region?: string; summary?: string };
    try {
      const out = await buildSeoAssistant(env, b);
      await logAiPilotAction("ai_seo_assistant", {
        status: out.source === "llm" ? "ok" : "fallback",
        detail: out.reason,
        changedBy: adminId(req),
      });
      res.json({ result: out.result, meta: { source: out.source, reason: out.reason } });
    } catch (e) {
      safeError("ai.seo_assistant", e);
      await logAiPilotAction("ai_seo_assistant", { status: "error", detail: String(e), changedBy: adminId(req) });
      res.status(500).json({ error: "seo_assistant_failed" });
    }
  });

  /**
   * P1: только черновик outreach, без отправки. Следующий шаг — owner approval.
   */
  router.post("/outreach-draft", admin, async (req: Request, res: Response) => {
    const b = req.body as { organizerId?: string; tone?: string };
    if (typeof b.organizerId !== "string" || !b.organizerId.trim()) {
      res.status(400).json({ error: "organizerId required" });
      return;
    }
    try {
      const out = await buildOutreachDraft(env, { organizerId: b.organizerId, tone: b.tone });
      await logAiPilotAction("ai_outreach_draft", {
        status: out.source === "llm" ? "ok" : "fallback",
        changedBy: adminId(req),
      });
      res.json(out);
    } catch (e) {
      safeError("ai.outreach_draft", e);
      await logAiPilotAction("ai_outreach_draft", { status: "error", detail: String(e), changedBy: adminId(req) });
      res.status(500).json({ error: "outreach_draft_failed" });
    }
  });

  /**
   * Явный шаг owner approval для драфта; отправки здесь нет.
   */
  router.post("/outreach-draft/:campaignId/submit-owner-approval", admin, async (req: Request, res: Response) => {
    try {
      const out = await submitOutreachDraftForOwnerApproval(req.params.campaignId, adminId(req));
      await logAiPilotAction("ai_outreach_submit_owner_approval", {
        status: "ok",
        changedBy: adminId(req),
      });
      res.json({ ...out, sendBlocked: true });
    } catch (e) {
      safeError("ai.outreach_submit_owner_approval", e);
      await logAiPilotAction("ai_outreach_submit_owner_approval", {
        status: "error",
        detail: String(e),
        changedBy: adminId(req),
      });
      res.status(400).json({ error: "outreach_submit_owner_approval_failed" });
    }
  });

  return router;
}
