import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizeTelegramUsername(v: string): string {
  return v.trim().replace(/^@+/, "").replace(/\s+/g, "");
}

function buildTgLinks(env: Env, subId: string): { tgOptInUrl: string | null; tgGroupInviteUrl: string | null } {
  const bot = env.TELEGRAM_UPDATES_BOT_USERNAME?.trim().replace(/^@+/, "") ?? "";
  const invite = env.TELEGRAM_UPDATES_INVITE_LINK?.trim() ?? "";
  const tgOptInUrl = bot ? `https://t.me/${bot}?start=mywave_sub_${subId}` : null;
  return {
    tgOptInUrl,
    tgGroupInviteUrl: invite || null,
  };
}

export function publicSubscriptionsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.post("/", async (req: Request, res: Response) => {
    const body = req.body as {
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
    };

    const email = String(body.email ?? "").trim().toLowerCase();
    const telegramUsernameRaw = String(body.telegramUsername ?? "").trim();
    const telegramUsername = telegramUsernameRaw ? normalizeTelegramUsername(telegramUsernameRaw) : "";
    const discipline = String(body.discipline ?? "").trim() || null;
    const region = String(body.region ?? "").trim() || null;

    const channelEmail = body.channelEmail === true || body.emailOptIn === true || (!!email && body.channelEmail !== false);
    const channelTelegram =
      body.channelTelegram === true || body.telegramOptIn === true || (!!telegramUsername && body.channelTelegram !== false);

    if (body.consent === false) {
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

    const existing = await prisma.updateSubscription.findFirst({
      where: {
        status: "active",
        email: email || null,
        telegramUsername: telegramUsername || null,
        discipline,
        region,
      },
      select: { id: true, tgOptInUrl: true, tgGroupInviteUrl: true },
    });

    if (existing) {
      res.status(200).json({
        id: existing.id,
        ok: true,
        created: false,
        tgOptInUrl: existing.tgOptInUrl,
        tgGroupInviteUrl: existing.tgGroupInviteUrl,
      });
      return;
    }

    const created = await prisma.updateSubscription.create({
      data: {
        email: email || null,
        telegramUsername: telegramUsername || null,
        channelEmail,
        channelTelegram,
        discipline,
        region,
        status: "active",
        metaJson: {
          source: body.source ?? "site",
          utm: body.utm ?? null,
          /** После проверки выше consent !== false; явное true при отсутствии поля — пилотный opt-in. */
          consentGiven: body.consent === true || body.consent === undefined,
        },
      },
    });

    const links = buildTgLinks(env, created.id);
    const updated = await prisma.updateSubscription.update({
      where: { id: created.id },
      data: {
        tgOptInUrl: links.tgOptInUrl,
        tgGroupInviteUrl: links.tgGroupInviteUrl,
        metaJson: {
          note: "Auto-add to Telegram groups is restricted by Telegram privacy/API; user joins via invite/deep-link.",
        },
      },
      select: { id: true, tgOptInUrl: true, tgGroupInviteUrl: true },
    });

    res.status(201).json({
      id: updated.id,
      ok: true,
      created: true,
      tgOptInUrl: updated.tgOptInUrl,
      tgGroupInviteUrl: updated.tgGroupInviteUrl,
      message:
        "Подписка активирована. Для Telegram откройте ссылку бота/группы: это стандартный opt-in flow Telegram.",
    });
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
