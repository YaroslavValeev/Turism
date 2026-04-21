import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import { getGrowthLoopCounters } from "./rewardService";

const COOKIE_NAME = "mw_ref";
const COOKIE_MAX_AGE_DAYS = 90;
const CODE_RE = /^[A-Z0-9-]{4,40}$/i;

function siteBase(env: Env): string {
  return (env.NOTIFICATIONS_SITE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function buildCookie(code: string): string {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${encodeURIComponent(code)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

/**
 * Публичный referral endpoint: принимает код из URL, инкрементит visits, кладёт cookie,
 * редиректит на главную. Учитывается как visit даже если пользователь не сконвертился.
 */
export function publicReferralRoutes(env: Env): Router {
  const router = Router();

  router.get("/referral/:code", async (req: Request, res: Response) => {
    const raw = String(req.params.code ?? "").trim();
    if (!raw || !CODE_RE.test(raw)) {
      res.redirect(302, siteBase(env));
      return;
    }
    const code = raw.toUpperCase();
    const row = await prisma.referralCode.findUnique({
      where: { code },
      include: { ownerUgc: { select: { programId: true, organizerId: true } } },
    });
    if (!row) {
      res.redirect(302, siteBase(env));
      return;
    }

    await prisma.referralCode.update({
      where: { code },
      data: {
        visits: { increment: 1 },
        lastVisitAt: new Date(),
      },
    });

    const eventTime = new Date().toISOString();
    emitBackendAnalyticsEventBestEffort({
      event_name: "referral_landing",
      event_version: 1,
      event_source: "backend",
      event_time: eventTime,
      idempotency_key: `referral_landing:${code}:${randomUUID()}`,
      program_id: row.ownerUgc?.programId ?? undefined,
      organizer_id: row.ownerUgc?.organizerId ?? undefined,
      traffic_source: "referral",
      properties_json: { referral_code: code },
    });

    res.setHeader("Set-Cookie", buildCookie(code));
    const redirectTo = `${siteBase(env)}/?ref=${encodeURIComponent(code)}`;
    res.redirect(302, redirectTo);
  });

  return router;
}

/**
 * Admin analytics для growth loop.
 */
export function adminReferralRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/overview", admin, async (_req: Request, res: Response) => {
    const counters = await getGrowthLoopCounters(prisma);
    res.json(counters);
  });

  router.get("/", admin, async (req: Request, res: Response) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
    const [rows, total] = await Promise.all([
      prisma.referralCode.findMany({
        orderBy: [{ bookings: "desc" }, { visits: "desc" }, { createdAt: "desc" }],
        skip: offset,
        take: limit,
        include: {
          ownerUgc: { select: { id: true, programId: true, authorName: true } },
        },
      }),
      prisma.referralCode.count(),
    ]);
    res.json({ rows, total, limit, offset });
  });

  return router;
}
