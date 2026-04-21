/**
 * Публичные эндпоинты подписок (без JWT). CORS уже открыт на API.
 */
import type { Env } from "@mywave/config";
import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { createOrUpdateSubscription } from "./subscriptionCreateService";
import { verifyNotificationUnsubscribeToken, notificationTokenSecret } from "./notificationTokens";
import { submitNotificationFeedback } from "./notificationFeedbackService";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function feedbackPageHtml(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body><p>${body}</p></body></html>`;
}

export function notificationPublicRoutes(env: Env): Router {
  const router = Router();

  router.post("/notification-subscriptions", async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    if (body.consent !== true) {
      res.status(400).json({ error: "consent must be true" });
      return;
    }

    const channel = typeof body.channel === "string" ? body.channel.trim() : "";
    if (channel !== "email" && channel !== "telegram" && channel !== "max") {
      res.status(400).json({ error: "channel must be email, telegram or max" });
      return;
    }

    const type = typeof body.type === "string" ? body.type.trim() : "";
    if (type !== "seasonal" && type !== "program_updates") {
      res.status(400).json({ error: "type must be seasonal or program_updates" });
      return;
    }

    const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim() : "";
    const telegramChatId = typeof body.telegramChatId === "string" ? body.telegramChatId.trim() : "";
    const maxRecipientId = typeof body.maxRecipientId === "string" ? body.maxRecipientId.trim() : "";

    if (channel === "email") {
      if (!contactEmail || !EMAIL_RE.test(contactEmail)) {
        res.status(400).json({ error: "valid contactEmail required for email channel" });
        return;
      }
    } else if (channel === "telegram") {
      if (!telegramChatId) {
        res.status(400).json({ error: "telegramChatId required for telegram channel" });
        return;
      }
    } else if (!maxRecipientId) {
      res.status(400).json({ error: "maxRecipientId required for max channel" });
      return;
    }

    const filters = body.filters != null && typeof body.filters === "object" && !Array.isArray(body.filters) ? body.filters : {};

    const result = await createOrUpdateSubscription(prisma, env, {
      channel,
      type,
      contactEmail: channel === "email" ? contactEmail : undefined,
      telegramChatId: channel === "telegram" ? telegramChatId : undefined,
      maxRecipientId: channel === "max" ? maxRecipientId : undefined,
      filters: filters as object,
      consent: true,
    });

    const state =
      result.kind === "already_active"
        ? "active"
        : result.kind === "created_active" || result.kind === "reactivated_active"
          ? "active"
          : result.kind === "resent_confirmation" || result.kind === "reactivated_pending" || result.kind === "created_pending"
            ? "pending_confirmation"
            : "pending_confirmation";

    const httpStatus = result.kind === "already_active" ? 200 : 201;
    res.status(httpStatus).json({
      ok: true,
      id: result.id,
      result: result.kind,
      subscriptionStatus: state,
      message:
        result.kind === "already_active"
          ? "Подписка уже активна."
          : result.kind === "created_active" || result.kind === "reactivated_active"
            ? "Подписка активна."
            : result.kind === "resent_confirmation"
              ? "Письмо с подтверждением отправлено повторно."
              : result.kind === "reactivated_pending"
                ? "Подписка возобновлена: проверьте почту и подтвердите по ссылке."
                : "Проверьте почту и перейдите по ссылке для подтверждения.",
    });
  });

  router.get("/notification-subscriptions/confirm", async (req: Request, res: Response) => {
    const t = typeof req.query.t === "string" ? req.query.t.trim() : "";
    if (!t) {
      res.status(400).send("Missing token");
      return;
    }
    const row = await prisma.notificationSubscription.findFirst({ where: { confirmationToken: t } });
    if (!row) {
      res.status(404).send("Invalid or expired link");
      return;
    }
    await prisma.notificationSubscription.update({
      where: { id: row.id },
      data: { status: "active", confirmationToken: null, confirmationSentAt: null },
    });
    res.status(200).type("html").send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Подписка</title></head><body>
<p>Подписка подтверждена. Можно закрыть вкладку.</p>
</body></html>`);
  });

  router.get("/notification-unsubscribe", async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!token) {
      res.status(400).send("Missing token");
      return;
    }
    const secret = notificationTokenSecret(env);
    const parsed = verifyNotificationUnsubscribeToken(secret, token);
    if (!parsed) {
      res.status(400).send("Invalid token");
      return;
    }
    const row = await prisma.notificationSubscription.findUnique({ where: { id: parsed.subscriptionId } });
    if (!row) {
      res.status(404).send("Subscription not found");
      return;
    }
    await prisma.notificationSubscription.update({
      where: { id: row.id },
      data: { status: "unsubscribed", confirmationToken: null },
    });
    res.status(200).type("html").send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Отписка</title></head><body>
<p>Вы отписаны от этой рассылки.</p>
</body></html>`);
  });

  router.get("/notification-feedback", async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!token) {
      res.status(400).type("html").send(feedbackPageHtml("Ошибка", "Отсутствует параметр token."));
      return;
    }
    const result = await submitNotificationFeedback(prisma, env, token, undefined);
    if (!result.ok) {
      const status = result.error === "delivery_not_found" ? 404 : 400;
      const msg =
        result.error === "delivery_not_found"
          ? "Доставка не найдена или письмо ещё не обработано. Попробуйте позже."
          : "Ссылка недействительна или устарела.";
      res.status(status).type("html").send(feedbackPageHtml("Ошибка", msg));
      return;
    }
    const msg = result.duplicate
      ? "Ответ уже был записан ранее."
      : result.autoUnsubscribed
        ? "Спасибо. Подписка отключена: два отрицательных ответа подряд."
        : "Спасибо, ответ записан.";
    res.status(200).type("html").send(feedbackPageHtml("Спасибо", msg));
  });

  router.post("/notification-feedback", async (req: Request, res: Response) => {
    const body = req.body as { token?: string; feedback?: string };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      res.status(400).json({ error: "token required" });
      return;
    }
    const fb = typeof body.feedback === "string" ? body.feedback.trim() : "";
    if (fb !== "positive" && fb !== "negative") {
      res.status(400).json({ error: "feedback must be positive or negative" });
      return;
    }
    const result = await submitNotificationFeedback(prisma, env, token, fb);
    if (!result.ok) {
      const status = result.error === "delivery_not_found" ? 404 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json({
      ok: true,
      duplicate: Boolean(result.duplicate),
      autoUnsubscribed: Boolean(result.autoUnsubscribed),
      message: result.duplicate
        ? "already_recorded"
        : result.autoUnsubscribed
          ? "auto_unsubscribed_after_two_negative"
          : "recorded",
    });
  });

  router.post("/notification-subscriptions/telegram-deactivate", async (req: Request, res: Response) => {
    const body = req.body as { token?: string };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      res.status(400).json({ error: "token required (JWT from same unsubscribe flow)" });
      return;
    }
    const secret = notificationTokenSecret(env);
    const parsed = verifyNotificationUnsubscribeToken(secret, token);
    if (!parsed) {
      res.status(400).json({ error: "invalid token" });
      return;
    }
    const row = await prisma.notificationSubscription.findUnique({ where: { id: parsed.subscriptionId } });
    if (!row || row.channel !== "telegram") {
      res.status(404).json({ error: "telegram subscription not found" });
      return;
    }
    await prisma.notificationSubscription.update({
      where: { id: row.id },
      data: { status: "unsubscribed", confirmationToken: null },
    });
    res.json({ ok: true, status: "unsubscribed" });
  });

  router.post("/notification-subscriptions/max-deactivate", async (req: Request, res: Response) => {
    const body = req.body as { token?: string };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      res.status(400).json({ error: "token required (JWT from same unsubscribe flow)" });
      return;
    }
    const secret = notificationTokenSecret(env);
    const parsed = verifyNotificationUnsubscribeToken(secret, token);
    if (!parsed) {
      res.status(400).json({ error: "invalid token" });
      return;
    }
    const row = await prisma.notificationSubscription.findUnique({ where: { id: parsed.subscriptionId } });
    if (!row || row.channel !== "max") {
      res.status(404).json({ error: "max subscription not found" });
      return;
    }
    await prisma.notificationSubscription.update({
      where: { id: row.id },
      data: { status: "unsubscribed", confirmationToken: null },
    });
    res.json({ ok: true, status: "unsubscribed" });
  });

  return router;
}
