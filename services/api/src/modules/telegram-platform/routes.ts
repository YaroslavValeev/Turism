/**
 * REST API для Telegram platform (бот и Web App вызывают эти эндпоинты).
 */
import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { validateAndRecordDeeplink } from "./deeplink.service";
import { getProgramCardForTelegram, formatProgramCardText } from "./programCard";
import {
  startLeadAttempt,
  updateLeadAttemptStep,
  submitTelegramLead,
  getLeadByToken,
} from "./leads.service";
import { upsertTelegramUser } from "./users";
import { createClickToken, resolveClickAndRedirect } from "./click";
import { applyOrganizerLeadStatus, parseOrganizerLeadCallback } from "./organizerStatus";
import { requiredConsentsForProgram, CONSENT_TEXTS, type RequiredConsentType } from "./consentTexts";
import { prisma } from "../../lib/prisma";
import { logTelegramPlatformEvent } from "./events";
import { isProgramPubliclyVisible } from "../programs/publicVisibility";
import { createTelegramSubscription, listTelegramSubscriptions, unsubscribeTelegram } from "./subscriptions";
import { getOpsDashboardSnapshot, isOpsTelegramId, parseOpsAllowlist } from "./ops";
import { applyReconciliationCallback, parseReconciliationCallback } from "./reconciliation";
import { parseWebAppUser, validateTelegramWebAppInitData } from "./webapp";

function parseBigIntTelegramId(v: unknown): bigint | null {
  if (v == null) return null;
  try {
    return BigInt(String(v));
  } catch {
    return null;
  }
}

export function telegramPlatformRoutes(env: Env): Router {
  const router = Router();

  router.post("/deeplink/validate", async (req: Request, res: Response) => {
    const body = req.body as {
      payload?: string;
      telegramUserId?: string;
      telegramAccountId?: string | number;
      username?: string;
      firstName?: string;
      campaign?: string;
    };
    if (!body.payload?.trim()) {
      res.status(400).json({ error: "payload required" });
      return;
    }

    let internalUserId: string | undefined;
    const tgId = parseBigIntTelegramId(body.telegramAccountId ?? body.telegramUserId);
    if (tgId != null) {
      const u = await upsertTelegramUser({
        telegramUserId: tgId,
        username: body.username,
        firstName: body.firstName,
      });
      internalUserId = u.id;
      await logTelegramPlatformEvent({
        eventName: "bot_started",
        telegramUserId: u.id,
        properties: { username: body.username },
      });
    }

    const result = await validateAndRecordDeeplink({
      payload: body.payload.trim(),
      telegramUserId: internalUserId,
      campaign: body.campaign,
    });

    res.json({
      ok: result.ok,
      parsed: result.parsed,
      programId: result.programId,
      leadToken: result.leadToken,
      telegramUserId: internalUserId,
    });
  });

  router.get("/programs/:programId/card", async (req: Request, res: Response) => {
    const card = await getProgramCardForTelegram(String(req.params.programId));
    if (!card) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const telegramUserId = typeof req.query.telegramUserId === "string" ? req.query.telegramUserId : undefined;
    if (telegramUserId) {
      await logTelegramPlatformEvent({
        eventName: "program_viewed",
        telegramUserId,
        programId: card.id,
        organizerId: card.organizer.id,
      });
    }
    res.json({ card, text: formatProgramCardText(card) });
  });

  router.post("/leads/start", async (req: Request, res: Response) => {
    const body = req.body as {
      telegramAccountId?: string | number;
      username?: string;
      firstName?: string;
      programId?: string;
      sourcePostId?: string;
      deeplinkPayload?: string;
    };
    const tgId = parseBigIntTelegramId(body.telegramAccountId);
    if (tgId == null || !body.programId) {
      res.status(400).json({ error: "telegramAccountId and programId required" });
      return;
    }
    const user = await upsertTelegramUser({
      telegramUserId: tgId,
      username: body.username,
      firstName: body.firstName,
    });
    const out = await startLeadAttempt({
      telegramUserId: user.id,
      programId: body.programId,
      sourcePostId: body.sourcePostId,
      deeplinkPayload: body.deeplinkPayload,
    });
    if (!out.ok) {
      res.status(404).json(out);
      return;
    }
    res.status(201).json(out);
  });

  router.patch("/leads/:attemptId/step", async (req: Request, res: Response) => {
    const body = req.body as {
      telegramUserId?: string;
      step?: string;
      patch?: Record<string, unknown>;
    };
    if (!body.telegramUserId || !body.step) {
      res.status(400).json({ error: "telegramUserId and step required" });
      return;
    }
    const out = await updateLeadAttemptStep(
      String(req.params.attemptId),
      body.telegramUserId,
      body.step,
      (body.patch ?? {}) as Parameters<typeof updateLeadAttemptStep>[3]
    );
    if (!out.ok) {
      res.status(404).json(out);
      return;
    }
    res.json(out);
  });

  router.get("/leads/consents/:programId", async (req: Request, res: Response) => {
    const program = await prisma.program.findUnique({
      where: { id: String(req.params.programId) },
      select: { publishStatus: true, riskLevel: true, audienceFit: true },
    });
    if (!program || !isProgramPubliclyVisible(program)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const isKids =
      (program.audienceFit ?? "").toLowerCase().includes("дет") ||
      (program.audienceFit ?? "").toLowerCase().includes("kids");
    const required = requiredConsentsForProgram(program.riskLevel, isKids);
    res.json({
      required,
      texts: Object.fromEntries(required.map((k) => [k, CONSENT_TEXTS[k]])),
    });
  });

  router.post("/leads/:attemptId/submit", async (req: Request, res: Response) => {
    const body = req.body as {
      telegramUserId?: string;
      consents?: RequiredConsentType[];
    };
    if (!body.telegramUserId || !Array.isArray(body.consents)) {
      res.status(400).json({ error: "telegramUserId and consents required" });
      return;
    }
    const out = await submitTelegramLead(env, {
      attemptId: String(req.params.attemptId),
      telegramUserId: body.telegramUserId,
      consents: body.consents,
    });
    if (!out.ok) {
      const status = out.error === "consent_required" ? 400 : 404;
      res.status(status).json(out);
      return;
    }
    res.status(201).json(out);
  });

  router.get("/leads/token/:leadToken", async (req: Request, res: Response) => {
    const telegramUserId = typeof req.query.telegramUserId === "string" ? req.query.telegramUserId : undefined;
    const lead = await getLeadByToken(String(req.params.leadToken), telegramUserId);
    if (!lead) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(lead);
  });

  router.post("/organizer/lead-status", async (req: Request, res: Response) => {
    const body = req.body as { callbackData?: string; leadToken?: string; action?: string; actorId?: string };
    let leadToken = body.leadToken;
    let action = body.action;
    if (body.callbackData) {
      const parsed = parseOrganizerLeadCallback(body.callbackData);
      if (!parsed) {
        res.status(400).json({ error: "invalid_callback" });
        return;
      }
      leadToken = parsed.leadToken;
      action = parsed.action;
    }
    if (!leadToken || !action) {
      res.status(400).json({ error: "leadToken and action required" });
      return;
    }
    const out = await applyOrganizerLeadStatus({
      leadToken,
      action,
      actorId: body.actorId,
    });
    if (!out.ok) {
      res.status(404).json(out);
      return;
    }
    res.json(out);
  });

  router.post("/clicks", async (req: Request, res: Response) => {
    const body = req.body as {
      destinationUrl?: string;
      programId?: string;
      organizerId?: string;
      telegramUserId?: string;
      sourcePostId?: string;
      campaign?: string;
    };
    if (!body.destinationUrl?.trim()) {
      res.status(400).json({ error: "destinationUrl required" });
      return;
    }
    const token = await createClickToken({
      destinationUrl: body.destinationUrl.trim(),
      programId: body.programId,
      organizerId: body.organizerId,
      telegramUserId: body.telegramUserId,
      sourcePostId: body.sourcePostId,
      campaign: body.campaign,
    });
    const base = env.PUBLIC_API_BASE_URL.replace(/\/+$/, "");
    res.status(201).json({ token, redirectUrl: `${base}/public/telegram/platform/click/${token}` });
  });

  router.get("/click/:token", async (req: Request, res: Response) => {
    const resolved = await resolveClickAndRedirect(String(req.params.token));
    if (!resolved) {
      res.status(404).send("Not found");
      return;
    }
    res.redirect(302, resolved.url);
  });

  router.post("/subscriptions", async (req: Request, res: Response) => {
    const body = req.body as {
      telegramUserId?: string;
      disciplineSlug?: string;
      regionSlug?: string;
      digestFrequency?: string;
      riskFilter?: string;
      kidsFilter?: string;
    };
    if (!body.telegramUserId) {
      res.status(400).json({ error: "telegramUserId required" });
      return;
    }
    const sub = await createTelegramSubscription({
      telegramUserId: body.telegramUserId,
      disciplineSlug: body.disciplineSlug,
      regionSlug: body.regionSlug,
      digestFrequency: body.digestFrequency,
      riskFilter: body.riskFilter,
      kidsFilter: body.kidsFilter,
    });
    res.status(201).json(sub);
  });

  router.get("/subscriptions/:telegramUserId", async (req: Request, res: Response) => {
    const subs = await listTelegramSubscriptions(String(req.params.telegramUserId));
    res.json({ items: subs });
  });

  router.delete("/subscriptions/:telegramUserId/:subscriptionId", async (req: Request, res: Response) => {
    const result = await unsubscribeTelegram(
      String(req.params.telegramUserId),
      String(req.params.subscriptionId)
    );
    res.json({ updated: result.count });
  });

  router.get("/ops/dashboard", async (req: Request, res: Response) => {
    const accountId = req.query.telegramAccountId;
    const allowlist = parseOpsAllowlist(process.env.TELEGRAM_PLATFORM_OPS_IDS);
    let accountNum: bigint | null = null;
    try {
      if (accountId != null) accountNum = BigInt(String(accountId));
    } catch {
      accountNum = null;
    }
    if (accountNum == null || !isOpsTelegramId(accountNum, allowlist)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const snapshot = await getOpsDashboardSnapshot();
    res.json(snapshot);
  });

  router.post("/webapp/auth", async (req: Request, res: Response) => {
    const body = req.body as { initData?: string };
    const token =
      process.env.TELEGRAM_PLATFORM_BOT_TOKEN?.trim() ||
      process.env.TELEGRAM_BOT_TOKEN?.trim() ||
      "";
    if (!body.initData?.trim() || !token) {
      res.status(400).json({ error: "initData and bot token required" });
      return;
    }
    const valid = validateTelegramWebAppInitData(body.initData.trim(), token);
    if (!valid) {
      res.status(401).json({ error: "invalid_init_data" });
      return;
    }
    const user = parseWebAppUser(body.initData.trim());
    if (!user) {
      res.status(400).json({ error: "user_missing" });
      return;
    }
    const tgUser = await upsertTelegramUser({
      telegramUserId: BigInt(user.id),
      username: user.username,
    });
    res.json({ ok: true, telegramUserId: tgUser.id, telegramAccountId: user.id });
  });

  router.post("/reconciliation/callback", async (req: Request, res: Response) => {
    const body = req.body as { callbackData?: string; leadToken?: string; action?: string; dealAmountRub?: number };
    let leadToken = body.leadToken;
    let action = body.action;
    if (body.callbackData) {
      const parsed = parseReconciliationCallback(body.callbackData);
      if (!parsed) {
        res.status(400).json({ error: "invalid_callback" });
        return;
      }
      leadToken = parsed.leadToken;
      action = parsed.action;
    }
    if (!leadToken || !action) {
      res.status(400).json({ error: "leadToken and action required" });
      return;
    }
    const out = await applyReconciliationCallback({
      leadToken,
      action,
      dealAmountRub: body.dealAmountRub,
    });
    if (!out.ok) {
      res.status(404).json(out);
      return;
    }
    res.json(out);
  });

  return router;
}
