import type { Env } from "@mywave/config";
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";
import {
  getGuardrailsDashboard,
  runEconomicsGuardrailsJob,
} from "./guardrailsService";
import {
  getProgramEconomicsEffectivePayload,
  getReferralEconomicsEffectivePayload,
  previewProgramEconomicsOverride,
  previewReferralEconomicsOverride,
} from "./economicsEffectiveService";
import {
  applyProgramEconomicsOverride,
  applyReferralEconomicsOverride,
  clearProgramEconomicsOverride,
  clearReferralEconomicsOverride,
} from "./overrideService";
import {
  programOverrideApplyBodySchema,
  programOverridePreviewBodySchema,
  referralOverrideApplyBodySchema,
  referralOverridePreviewBodySchema,
  zodErrorPayload,
} from "./economicsSchemas";
import {
  getGovernanceAlertsDashboard,
  runGovernanceAlertCycle,
  runGovernanceDigest,
} from "./governanceAlerts/runCycle";
import { buildEconomicsOverview, buildEconomicsOverviewComparison, parseEconomicsDateRange } from "./overviewService";
import { buildReconciliationCsv } from "./reconciliationExport";

export function economicsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  /**
   * Сводка unit economics + funnel (UGC → reward → referral → booking → discount → commission).
   * Query: date_from, date_to (ISO), programId?, organizerId? — по умолчанию последние 30 дней.
   */
  router.get("/overview", admin, async (req: Request, res: Response) => {
    const parsed = parseEconomicsDateRange(req.query as Record<string, unknown>);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const overview = await buildEconomicsOverview(prisma, parsed.value);
      res.setHeader("Cache-Control", "no-store");
      res.json(overview);
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "economics_overview_failed",
      });
    }
  });

  /** WoW/MoM: текущее окно + baseline предыдущего периода той же длины + дельты по ключевым метрикам. */
  router.get("/overview/compare", admin, async (req: Request, res: Response) => {
    const parsed = parseEconomicsDateRange(req.query as Record<string, unknown>);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const out = await buildEconomicsOverviewComparison(prisma, parsed.value);
      res.setHeader("Cache-Control", "no-store");
      res.json(out);
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "economics_overview_compare_failed",
      });
    }
  });

  /** CSV экспорт комиссий по бронированиям в окне (reconciliation-friendly). */
  router.get("/reconciliation/export", admin, async (req: Request, res: Response) => {
    const parsed = parseEconomicsDateRange(req.query as Record<string, unknown>);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const csv = await buildReconciliationCsv(prisma, parsed.value);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(csv);
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "reconciliation_export_failed",
      });
    }
  });

  /** Активные ограничения, пороги env, списки программ и referral-кодов. */
  router.get("/guardrails", admin, async (_req: Request, res: Response) => {
    try {
      const dash = await getGuardrailsDashboard(prisma, env);
      res.setHeader("Cache-Control", "no-store");
      res.json(dash);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "guardrails_dashboard_failed" });
    }
  });

  /** Пересчитать program/referral флаги и expiry health (audit). */
  router.post("/guardrails/run", admin, async (_req: Request, res: Response) => {
    try {
      const out = await runEconomicsGuardrailsJob(prisma, env);
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "guardrails_run_failed" });
    }
  });

  /** Текущее effective economics по программе (raw + manual + effective + объяснение). */
  router.get("/programs/:id/effective", admin, async (req: Request, res: Response) => {
    try {
      const out = await getProgramEconomicsEffectivePayload(prisma, env, req.params.id);
      if (!out.ok) {
        res.status(404).json({ error: out.error });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "program_effective_failed" });
    }
  });

  /** Dry-run: как будет выглядеть effective после override (без записи в audit). */
  router.post("/programs/:id/override/preview", admin, async (req: Request, res: Response) => {
    try {
      const parsed = programOverridePreviewBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json(zodErrorPayload(parsed.error));
        return;
      }
      const out = await previewProgramEconomicsOverride(prisma, env, req.params.id, parsed.data);
      if (!out.ok) {
        const status = out.error === "program_not_found" ? 404 : 400;
        res.status(status).json({ error: out.error });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "program_override_preview_failed" });
    }
  });

  /** Ручной override множителя reward по программе (TTL). */
  router.post("/programs/:id/override", admin, async (req: Request, res: Response) => {
    try {
      const parsed = programOverrideApplyBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json(zodErrorPayload(parsed.error));
        return;
      }
      const r = await applyProgramEconomicsOverride(prisma, env, {
        programId: req.params.id,
        body: parsed.data,
        adminUserId: req.adminUserId!,
      });
      if (!r.ok) {
        const status = r.error === "program_not_found" ? 404 : 400;
        res.status(status).json({ error: r.error });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "program_override_failed" });
    }
  });

  router.delete("/programs/:id/override", admin, async (req: Request, res: Response) => {
    try {
      const r = await clearProgramEconomicsOverride(prisma, env, {
        programId: req.params.id,
        adminUserId: req.adminUserId!,
      });
      if (!r.ok) {
        const status = r.error === "program_not_found" ? 404 : 400;
        res.status(status).json({ error: r.error });
        return;
      }
      res.json({
        ok: true,
        old_effective: r.old_effective,
        new_effective: r.new_effective,
        recomputed: r.recomputed,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "program_override_clear_failed" });
    }
  });

  router.get("/referrals/:code/effective", admin, async (req: Request, res: Response) => {
    try {
      const code = decodeURIComponent(req.params.code);
      const out = await getReferralEconomicsEffectivePayload(prisma, env, code);
      if (!out.ok) {
        res.status(404).json({ error: out.error });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "referral_effective_failed" });
    }
  });

  router.post("/referrals/:code/override/preview", admin, async (req: Request, res: Response) => {
    try {
      const code = decodeURIComponent(req.params.code);
      const parsed = referralOverridePreviewBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json(zodErrorPayload(parsed.error));
        return;
      }
      const out = await previewReferralEconomicsOverride(prisma, env, code, parsed.data);
      if (!out.ok) {
        const status = out.error === "referral_not_found" ? 404 : 400;
        res.status(status).json({ error: out.error });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "referral_override_preview_failed" });
    }
  });

  /** Ручной override качества реферального кода. */
  router.post("/referrals/:code/override", admin, async (req: Request, res: Response) => {
    try {
      const code = decodeURIComponent(req.params.code);
      const parsed = referralOverrideApplyBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json(zodErrorPayload(parsed.error));
        return;
      }
      const r = await applyReferralEconomicsOverride(prisma, env, {
        code,
        body: parsed.data,
        adminUserId: req.adminUserId!,
      });
      if (!r.ok) {
        const status = r.error === "referral_not_found" ? 404 : 400;
        res.status(status).json({ error: r.error });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "referral_override_failed" });
    }
  });

  router.delete("/referrals/:code/override", admin, async (req: Request, res: Response) => {
    try {
      const code = decodeURIComponent(req.params.code);
      const r = await clearReferralEconomicsOverride(prisma, env, {
        code,
        adminUserId: req.adminUserId!,
      });
      if (!r.ok) {
        const status = r.error === "referral_not_found" ? 404 : 400;
        res.status(status).json({ error: r.error });
        return;
      }
      res.json({
        ok: true,
        old_effective: r.old_effective,
        new_effective: r.new_effective,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "referral_override_clear_failed" });
    }
  });

  /** Активные governance alerts + время последнего digest. */
  router.get("/alerts", admin, async (_req: Request, res: Response) => {
    try {
      const dash = await getGovernanceAlertsDashboard(prisma);
      res.setHeader("Cache-Control", "no-store");
      res.json(dash);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "governance_alerts_failed" });
    }
  });

  /** Один проход evaluate + доставка critical (при ECON_GOVERNANCE_ALERTS_ENABLED). */
  router.post("/alerts/evaluate", admin, async (_req: Request, res: Response) => {
    try {
      const out = await runGovernanceAlertCycle(prisma, env);
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "governance_evaluate_failed" });
    }
  });

  /** Daily digest warning → email (вручную или по расписанию). */
  router.post("/alerts/digest", admin, async (_req: Request, res: Response) => {
    try {
      const out = await runGovernanceDigest(prisma, env);
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "governance_digest_failed" });
    }
  });

  return router;
}
