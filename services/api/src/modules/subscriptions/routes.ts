import { Router, Request, Response, NextFunction } from "express";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";
import { isTelegramBotApiConfigured } from "../telegram/telegramApi";
import { newSubscriptionToken, subscriptionFilters, subscriptionIdentity, SUBSCRIPTION_POLICY_VERSION } from "./policy";
import { isSmtpConfigured } from "./mailer";

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizeTelegramUsername(v: string): string {
  return v.trim().replace(/^@+/, "").replace(/\s+/g, "");
}

function buildTgLinks(env: Env, token: string | null): { tgOptInUrl: string | null; tgGroupInviteUrl: string | null } {
  const bot = env.TELEGRAM_UPDATES_BOT_USERNAME?.trim().replace(/^@+/, "") ?? "";
  const invite = env.TELEGRAM_UPDATES_INVITE_LINK?.trim() ?? "";
  const tgOptInUrl = bot && token ? `https://t.me/${bot}?start=mywave_sub_${token}` : null;
  return {
    tgOptInUrl,
    tgGroupInviteUrl: invite || null,
  };
}

export function publicSubscriptionsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as {
      email?: string;
      telegramUsername?: string;
      discipline?: string;
      region?: string;
      channelEmail?: boolean;
      channelTelegram?: boolean;
      emailOptIn?: boolean;
      telegramOptIn?: boolean;
      consent?: boolean;
      source?: string;
      utm?: Record<string, string>;
      levelRequired?: unknown;
      dateFrom?: unknown;
      dateTo?: unknown;
    };

    const email = String(body.email ?? "").trim().toLowerCase();
    const telegramUsernameRaw = String(body.telegramUsername ?? "").trim();
    const telegramUsername = telegramUsernameRaw ? normalizeTelegramUsername(telegramUsernameRaw) : "";
    const discipline = String(body.discipline ?? "").trim() || null;
    const region = String(body.region ?? "").trim() || null;

    const channelEmail = body.channelEmail === true || body.emailOptIn === true || (!!email && body.channelEmail !== false);
    const channelTelegram =
      body.channelTelegram === true || body.telegramOptIn === true || (!!telegramUsername && body.channelTelegram !== false);

    if (body.consent !== true) {
      res.status(400).json({ error: "Нужно согласие на получение обновлений." });
      return;
    }

    if (!channelEmail && !channelTelegram) {
      res.status(400).json({ error: "Укажите хотя бы один канал: email или Telegram." });
      return;
    }
    if (channelEmail && !email) {
      res.status(400).json({ error: "Для email-уведомлений нужен email." });
      return;
    }
    if (channelEmail && !isEmail(email)) {
      res.status(400).json({ error: "Некорректный email." });
      return;
    }
    if (channelTelegram && !telegramUsername) {
      res.status(400).json({ error: "Для Telegram-уведомлений нужен @username." });
      return;
    }
    if (channelTelegram && !/^[a-z0-9_]{5,32}$/i.test(telegramUsername)) {
      res.status(400).json({ error: "Некорректный Telegram username." });
      return;
    }
    if (channelTelegram && (!env.TELEGRAM_PUBLIC_BOT_ENABLED || !env.TELEGRAM_UPDATES_BOT_USERNAME?.trim() || !isTelegramBotApiConfigured(env))) {
      res.status(503).json({ error: "Личные Telegram-уведомления пока не подключены." +
        (isSmtpConfigured(env) ? " Используйте email." : " Доставка уведомлений пока недоступна.") });
      return;
    }
    let filters: ReturnType<typeof subscriptionFilters>;
    try { filters = subscriptionFilters(body); } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Некорректные условия подписки." });
      return;
    }

    const identityKey = subscriptionIdentity([email || null, telegramUsername.toLowerCase() || null,
      discipline?.toLowerCase() || null, region?.toLowerCase() || null, filters.levelRequired,
      filters.dateFrom?.toISOString() || null, filters.dateTo?.toISOString() || null, channelEmail, channelTelegram]);
    const existing = await prisma.updateSubscription.findUnique({ where: { identityKey } });
    const rebind = Boolean(existing && (existing.status !== "active" || !existing.channelTelegram));
    const token = channelTelegram && (!existing?.telegramChatId || rebind) ? newSubscriptionToken() : null;
    const links = buildTgLinks(env, token?.token ?? null);
    const consentAt = new Date();
    const previousMeta = existing?.metaJson && typeof existing.metaJson === "object" && !Array.isArray(existing.metaJson) ? existing.metaJson : {};
    const data = {
        email: email || null,
        telegramUsername: telegramUsername || null,
        channelEmail,
        channelTelegram,
        discipline,
        region,
        status: "active",
        ...filters,
        consentAt,
        // The bearer link is returned once; only its hash is stored in the DB.
        tgOptInUrl: null,
        tgGroupInviteUrl: links.tgGroupInviteUrl,
        ...(rebind ? { telegramChatId: null, telegramBoundAt: null } : {}),
        ...(token ? { telegramTokenHash: token.hash, telegramTokenExpiresAt: token.expiresAt } : {}),
        metaJson: {
          ...previousMeta,
          source: body.source ?? previousMeta.source ?? "site",
          utm: body.utm ?? previousMeta.utm ?? null,
          consentGiven: true,
          consentAt: consentAt.toISOString(),
          consentPolicyVersion: SUBSCRIPTION_POLICY_VERSION,
        },
    };
    const updated = await prisma.updateSubscription.upsert({
      where: { identityKey }, create: { identityKey, ...data }, update: data,
    });

    const emailDeliveryConfigured = isSmtpConfigured(env);
    const message = channelTelegram && !updated.telegramChatId
      ? "Условия сохранены. Для личных Telegram-уведомлений откройте бота и нажмите Start. Ссылка действует 24 часа."
      : "Подписка сохранена.";
    res.status(existing ? 200 : 201).json({
      id: updated.id,
      ok: true,
      created: !existing,
      tgOptInUrl: updated.telegramChatId ? null : links.tgOptInUrl,
      tgGroupInviteUrl: updated.tgGroupInviteUrl,
      telegramConfirmed: Boolean(updated.telegramChatId && updated.telegramBoundAt),
      emailDeliveryConfigured,
      message: message + (channelEmail && !emailDeliveryConfigured
        ? " Email-уведомления пока не подключены. Условия сохранены, но письма пока не отправляются." : ""),
    });
    } catch (error) { next(error); }
  });

  router.get("/unsubscribe", async (req: Request, res: Response) => {
    const email = String(req.query.email ?? "").trim().toLowerCase();
    const telegramUsernameRaw = String(req.query.telegramUsername ?? "").trim();
    const telegramUsername = telegramUsernameRaw ? normalizeTelegramUsername(telegramUsernameRaw) : "";
    if (!email && !telegramUsername) {
      res.status(400).json({ ok: false, error: "email или telegramUsername обязательны" });
      return;
    }
    if (email && !isEmail(email)) {
      res.status(400).json({ ok: false, error: "Некорректный email" });
      return;
    }
    const result = await prisma.updateSubscription.updateMany({
      where: {
        status: "active",
        OR: [
          ...(email ? [{ email }] : []),
          ...(telegramUsername ? [{ telegramUsername }] : []),
        ],
      },
      data: { status: "unsubscribed" },
    });
    res.status(200).json({
      ok: true,
      unsubscribed: result.count,
      message: result.count > 0 ? "Подписка отключена." : "Активные подписки не найдены.",
    });
  });

  router.post("/unsubscribe", async (req: Request, res: Response) => {
    const body = req.body as {
      email?: string;
      telegramUsername?: string;
      discipline?: string;
      region?: string;
    };

    const email = String(body.email ?? "").trim().toLowerCase();
    const telegramUsernameRaw = String(body.telegramUsername ?? "").trim();
    const telegramUsername = telegramUsernameRaw ? normalizeTelegramUsername(telegramUsernameRaw) : "";
    const discipline = String(body.discipline ?? "").trim() || null;
    const region = String(body.region ?? "").trim() || null;

    if (!email && !telegramUsername) {
      res.status(400).json({ error: "Для отписки укажите email или Telegram username." });
      return;
    }
    if (email && !isEmail(email)) {
      res.status(400).json({ error: "Некорректный email." });
      return;
    }

    const result = await prisma.updateSubscription.updateMany({
      where: {
        status: "active",
        ...(discipline ? { discipline } : {}),
        ...(region ? { region } : {}),
        OR: [
          ...(email ? [{ email }] : []),
          ...(telegramUsername ? [{ telegramUsername }] : []),
        ],
      },
      data: { status: "unsubscribed" },
    });

    if (result.count === 0) {
      res.status(404).json({ ok: false, error: "Активные подписки не найдены." });
      return;
    }

    res.status(200).json({
      ok: true,
      unsubscribed: result.count,
      message: "Подписка отключена.",
    });
  });

  // Защищенная выгрузка для ручных кампаний (CSV/JSON), только admin.
  router.get("/admin/export", admin, async (req: Request, res: Response) => {
    const { discipline, region, channel, status = "active", format = "json" } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    if (discipline) where.discipline = discipline;
    if (region) where.region = region;
    if (status) where.status = status;
    if (channel === "email") where.channelEmail = true;
    if (channel === "telegram") where.channelTelegram = true;

    const list = await prisma.updateSubscription.findMany({
      where,
      select: {
        id: true,
        email: true,
        telegramUsername: true,
        channelEmail: true,
        channelTelegram: true,
        discipline: true,
        region: true,
        status: true,
        createdAt: true,
        lastNotifiedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (format === "csv") {
      const header = [
        "id",
        "email",
        "telegramUsername",
        "channelEmail",
        "channelTelegram",
        "discipline",
        "region",
        "status",
        "createdAt",
        "lastNotifiedAt",
      ].join(",");
      const rows = list.map((row) =>
        [
          row.id,
          row.email ?? "",
          row.telegramUsername ?? "",
          row.channelEmail ? "1" : "0",
          row.channelTelegram ? "1" : "0",
          row.discipline ?? "",
          row.region ?? "",
          row.status,
          row.createdAt.toISOString(),
          row.lastNotifiedAt ? row.lastNotifiedAt.toISOString() : "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );
      const csv = [header, ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=subscriptions_export.csv");
      res.status(200).send(csv);
      return;
    }

    res.status(200).json({
      ok: true,
      count: list.length,
      items: list,
    });
  });

  return router;
}
