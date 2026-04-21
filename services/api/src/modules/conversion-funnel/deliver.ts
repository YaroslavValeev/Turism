import type { Env } from "@mywave/config";
import jwt from "jsonwebtoken";
import { sendNotificationEmail, sendNotificationTelegram } from "../notifications/sendChannels";

function trimText(s: string | undefined | null): string {
  return (s ?? "").trim();
}

export function buildConversionUnsubscribeUrl(env: Env, programId: string): string | undefined {
  const base = trimText(env.NOTIFICATIONS_LINK_BASE_URL) || trimText(env.NOTIFICATIONS_SITE_BASE_URL);
  if (!base) return undefined;
  const secret = trimText(env.NOTIFICATIONS_TOKEN_SECRET) || trimText(env.JWT_SECRET);
  if (!secret) return undefined;
  const token = jwt.sign(
    { programId, purpose: "conversion_unsub" as const },
    secret,
    { expiresIn: "30d" },
  );
  return `${base.replace(/\/+$/, "")}/public/conversion-funnel/unsubscribe?token=${encodeURIComponent(token)}`;
}

export type DeliverChannel = "telegram" | "email" | "none";

/**
 * Сначала Telegram (если есть chat id), иначе email. Одно сообщение на этап.
 */
export async function deliverConversionMessage(
  env: Env,
  input: {
    toEmail: string;
    telegramChatId: string | null;
    subject: string;
    htmlBody: string;
    plainBody: string;
  },
): Promise<{ channel: DeliverChannel; ok: boolean; reason?: string }> {
  const tg = trimText(input.telegramChatId);
  if (tg) {
    const r = await sendNotificationTelegram(env, tg, input.plainBody);
    if (r.ok) return { channel: "telegram", ok: true };
  }
  const er = await sendNotificationEmail(env, input.toEmail, input.subject, input.htmlBody);
  if (er.ok) return { channel: "email", ok: true };
  return { channel: "none", ok: false, reason: er.reason ?? "email_failed" };
}

export function conversionPlainToHtmlEmail(plain: string): string {
  const body = plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5">${body}</body></html>`;
}

/** Доставка произвольного текста (после owner approval черновика). */
export async function deliverConversionCustomMessage(
  env: Env,
  input: {
    toEmail: string;
    telegramChatId: string | null;
    subject: string;
    plainBody: string;
  },
): Promise<{ channel: DeliverChannel; ok: boolean; reason?: string }> {
  return deliverConversionMessage(env, {
    ...input,
    htmlBody: conversionPlainToHtmlEmail(input.plainBody),
  });
}
