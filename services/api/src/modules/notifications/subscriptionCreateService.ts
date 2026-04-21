import crypto from "node:crypto";
import type { Env } from "@mywave/config";
import type { PrismaClient } from "@prisma/client";
import { buildSubscriptionIdentityKey } from "./subscriptionIdentity";
import { sendNotificationEmail } from "./sendChannels";
import { signNotificationUnsubscribeToken, notificationTokenSecret } from "./notificationTokens";

function linkBase(env: Env): string {
  return (env.NOTIFICATIONS_LINK_BASE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function confirmationEmailHtml(env: Env, token: string): { subject: string; html: string } {
  const base = linkBase(env);
  const url = `${base}/public/notification-subscriptions/confirm?t=${encodeURIComponent(token)}`;
  return {
    subject: "Подтвердите подписку MyWave Travel",
    html: `
<p>Здравствуйте!</p>
<p>Чтобы включить уведомления, перейдите по ссылке (действует ограниченное время):</p>
<p><a href="${escapeHtml(url)}">Подтвердить подписку</a></p>
<p>Если вы не оставляли запрос — просто проигнорируйте письмо.</p>
<p><small>MyWave Travel</small></p>
`.trim(),
  };
}

export type CreateSubscriptionResult =
  | { kind: "created_pending"; id: string }
  | { kind: "created_active"; id: string }
  | { kind: "reactivated_active"; id: string }
  | { kind: "reactivated_pending"; id: string }
  | { kind: "already_active"; id: string }
  | { kind: "resent_confirmation"; id: string };

export async function createOrUpdateSubscription(
  db: PrismaClient,
  env: Env,
  input: {
    channel: "email" | "telegram" | "max";
    type: "seasonal" | "program_updates";
    contactEmail?: string;
    telegramChatId?: string;
    maxRecipientId?: string;
    filters: object;
    consent: true;
  },
): Promise<CreateSubscriptionResult> {
  const identityKey = buildSubscriptionIdentityKey({
    channel: input.channel,
    contactEmail: input.contactEmail,
    telegramChatId: input.telegramChatId,
    maxRecipientId: input.maxRecipientId,
    type: input.type,
    filters: input.filters,
  });

  const existing = await db.notificationSubscription.findUnique({ where: { identityKey } });

  const bypass = env.NOTIFICATIONS_EMAIL_CONFIRM_BYPASS === true;

  if (input.channel === "max") {
    if (existing) {
      if (existing.status === "active") return { kind: "already_active", id: existing.id };
      const row = await db.notificationSubscription.update({
        where: { id: existing.id },
        data: { status: "active", confirmationToken: null, confirmationSentAt: null },
      });
      return { kind: "reactivated_active", id: row.id };
    }
    const row = await db.notificationSubscription.create({
      data: {
        identityKey,
        channel: input.channel,
        type: input.type,
        contactEmail: null,
        telegramChatId: null,
        maxRecipientId: input.maxRecipientId!.trim(),
        filters: input.filters,
        status: "active",
      },
    });
    return { kind: "created_active", id: row.id };
  }

  if (input.channel === "telegram") {
    if (existing) {
      if (existing.status === "active") return { kind: "already_active", id: existing.id };
      const row = await db.notificationSubscription.update({
        where: { id: existing.id },
        data: { status: "active", confirmationToken: null, confirmationSentAt: null },
      });
      return { kind: "reactivated_active", id: row.id };
    }
    const row = await db.notificationSubscription.create({
      data: {
        identityKey,
        channel: input.channel,
        type: input.type,
        contactEmail: null,
        telegramChatId: input.telegramChatId!.trim(),
        maxRecipientId: null,
        filters: input.filters,
        status: "active",
      },
    });
    return { kind: "created_active", id: row.id };
  }

  // email
  const email = input.contactEmail!.trim().toLowerCase();

  if (existing) {
    if (existing.status === "active") {
      return { kind: "already_active", id: existing.id };
    }
    if (existing.status === "pending_confirmation") {
      const token = crypto.randomBytes(32).toString("hex");
      await db.notificationSubscription.update({
        where: { id: existing.id },
        data: {
          confirmationToken: token,
          confirmationSentAt: new Date(),
          filters: input.filters,
        },
      });
      const { subject, html } = confirmationEmailHtml(env, token);
      await sendNotificationEmail(env, email, subject, appendEmailFooter(env, html, existing.id, email));
      return { kind: "resent_confirmation", id: existing.id };
    }
    // unsubscribed → снова подтверждение
    const token = crypto.randomBytes(32).toString("hex");
    const row = await db.notificationSubscription.update({
      where: { id: existing.id },
      data: {
        status: "pending_confirmation",
        confirmationToken: token,
        confirmationSentAt: new Date(),
        filters: input.filters,
        contactEmail: email,
      },
    });
    const { subject, html } = confirmationEmailHtml(env, token);
    await sendNotificationEmail(env, email, subject, appendEmailFooter(env, html, row.id, email));
    return { kind: "reactivated_pending", id: row.id };
  }

  if (bypass) {
    const row = await db.notificationSubscription.create({
      data: {
        identityKey,
        channel: "email",
        type: input.type,
        contactEmail: email,
        filters: input.filters,
        status: "active",
      },
    });
    return { kind: "created_active", id: row.id };
  }


  const token = crypto.randomBytes(32).toString("hex");
  const row = await db.notificationSubscription.create({
    data: {
      identityKey,
      channel: "email",
      type: input.type,
      contactEmail: email,
      filters: input.filters,
      status: "pending_confirmation",
      confirmationToken: token,
      confirmationSentAt: new Date(),
    },
  });
  const { subject, html } = confirmationEmailHtml(env, token);
  await sendNotificationEmail(env, email, subject, appendEmailFooter(env, html, row.id, email));
  return { kind: "created_pending", id: row.id };
}

export function appendEmailFooter(env: Env, html: string, subscriptionId: string, _contactEmail: string): string {
  const secret = notificationTokenSecret(env);
  const tok = signNotificationUnsubscribeToken(secret, subscriptionId);
  const base = linkBase(env);
  const unsubUrl = `${base}/public/notification-unsubscribe?token=${encodeURIComponent(tok)}`;
  return `${html}\n<hr style="border:none;border-top:1px solid #ddd;margin:24px 0" />\n<p style="font-size:12px;color:#666">Отписаться от этой рассылки: <a href="${escapeHtml(unsubUrl)}">ссылка</a></p>`;
}
