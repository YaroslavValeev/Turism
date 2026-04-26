import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { sendEmailIfConfigured } from "./mailer";
import { safeLog } from "../../lib/safeLogger";
import {
  buildEmailProgramNotifyHtml,
  buildEmailProgramNotifyText,
  buildTelegramProgramNotifyHtml,
  escapeTelegramHtml,
  programRowToNotifySource,
  type ProgramNotifySource,
} from "./programNotifyTemplates";

type PublishedProgramPayload = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  startDate: Date;
};

function addUtm(url: string, source: "email" | "telegram_channel" | "telegram_dm"): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("utm_source", source);
    parsed.searchParams.set("utm_medium", "subscription");
    parsed.searchParams.set("utm_campaign", "program_publish");
    return parsed.toString();
  } catch {
    return url;
  }
}

async function loadProgramNotifySource(program: PublishedProgramPayload): Promise<ProgramNotifySource> {
  const row = await prisma.program.findUnique({
    where: { id: program.id },
    include: { organizer: { select: { displayName: true } } },
  });
  if (row) return programRowToNotifySource(row);
  return {
    id: program.id,
    title: program.title,
    discipline: program.discipline,
    region: program.region,
    startDate: program.startDate,
    endDate: null,
    audienceFit: null,
    inclusions: null,
    organizerName: null,
    organizerDisplayName: null,
    levelRequired: null,
    formatType: null,
    cancellationRules: null,
    whatHappensAfterBooking: null,
    medicalLimitations: null,
  };
}

async function sendTelegramDirectIfPossible(
  env: Env,
  username: string,
  text: string,
  options?: { parseMode?: "HTML" },
): Promise<boolean> {
  const base = env.TELEGRAM_BOT_API_BASE_URL?.trim();
  if (!base) return false;
  try {
    const resp = await fetch(`${base.replace(/\/+$/, "")}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: `@${username.replace(/^@/, "")}`,
        text,
        disable_web_page_preview: true,
        ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function parseEmailAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw?.trim()) return null;
  return new Set(
    raw
      .split(/[,;]/g)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    const host = parsed.hostname.toLowerCase();
    if (!isHttp) return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    return true;
  } catch {
    return false;
  }
}

function buildTelegramInlineKeyboard(
  programUrl: string,
  webBase: string,
  inviteLink?: string,
): Record<string, unknown> | undefined {
  const inline_keyboard: Array<Array<{ text: string; url: string }>> = [];
  if (isPublicHttpUrl(programUrl)) {
    inline_keyboard.push([{ text: "Открыть программу", url: programUrl }]);
  }
  if (isPublicHttpUrl(webBase)) {
    inline_keyboard.push([{ text: "Перейти на сайт", url: webBase }]);
  }
  if (inviteLink && isPublicHttpUrl(inviteLink)) {
    inline_keyboard.push([{ text: "К организатору / в чат", url: inviteLink }]);
  }
  if (!inline_keyboard.length) return undefined;
  return { inline_keyboard };
}

async function sendTelegramChannelUpdate(
  env: Env,
  text: string,
  replyMarkup?: Record<string, unknown>,
  options?: { parseMode?: "HTML" },
): Promise<boolean> {
  const base = env.TELEGRAM_BOT_API_BASE_URL?.trim();
  const chatId = env.TELEGRAM_UPDATES_CHANNEL_CHAT_ID?.trim();
  if (!base || !chatId) return false;
  try {
    const resp = await fetch(`${base.replace(/\/+$/, "")}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: false,
        ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    if (!resp.ok) {
      console.error("[subscriptions] telegram publish failed", resp.status);
    }
    return resp.ok;
  } catch (error) {
    console.error("[subscriptions] telegram publish error", error instanceof Error ? error.message : String(error));
    return false;
  }
}

export async function notifySubscribersOnProgramPublished(env: Env, program: PublishedProgramPayload): Promise<void> {
  const notifySrc = await loadProgramNotifySource(program);

  const subs = await prisma.updateSubscription.findMany({
    where: {
      status: "active",
      OR: [{ discipline: null }, { discipline: { contains: program.discipline, mode: "insensitive" } }],
      AND: [{ OR: [{ region: null }, { region: { contains: program.region, mode: "insensitive" } }] }],
    },
    select: {
      id: true,
      email: true,
      telegramUsername: true,
      channelEmail: true,
      channelTelegram: true,
      tgGroupInviteUrl: true,
      tgOptInUrl: true,
    },
  });

  const webBase = env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "");
  const apiBase = env.PUBLIC_API_BASE_URL.replace(/\/+$/, "");
  const baseProgramUrl = `${webBase}/program/${program.id}`;
  const programUrlEmail = addUtm(baseProgramUrl, "email");
  const programUrlTelegramChannel = addUtm(baseProgramUrl, "telegram_channel");
  const programUrlTelegramDm = addUtm(baseProgramUrl, "telegram_dm");
  const sentIds: string[] = [];
  const emailAllow = parseEmailAllowlist(env.EMAIL_STAGING_ALLOWLIST);

  const tgChannelHtml = buildTelegramProgramNotifyHtml(
    notifySrc,
    isPublicHttpUrl(programUrlTelegramChannel) ? programUrlTelegramChannel : null,
  );

  for (const sub of subs) {
    if (emailAllow) {
      const e = sub.email?.trim().toLowerCase() ?? "";
      if (!e || !emailAllow.has(e)) {
        safeLog("[subscriptions] sub skipped (EMAIL_STAGING_ALLOWLIST)", { subscriptionId: sub.id });
        continue;
      }
    }
    let sent = false;

    if (sub.channelEmail && sub.email) {
      const unsubscribeUrl = `${apiBase}/public/subscriptions/unsubscribe?email=${encodeURIComponent(sub.email)}`;
      const emailHtmlFull = buildEmailProgramNotifyHtml(notifySrc, programUrlEmail, unsubscribeUrl);
      const emailTextFull = buildEmailProgramNotifyText(notifySrc, programUrlEmail, unsubscribeUrl);
      // eslint-disable-next-line no-await-in-loop
      const ok = await sendEmailIfConfigured(env, {
        to: sub.email,
        subject: `Подборка MyWaveTour: ${program.title}`,
        text: emailTextFull,
        html: emailHtmlFull,
      });
      safeLog("[subscriptions] email delivery", { status: ok ? "success" : "failed", subscriptionId: sub.id });
      sent = sent || ok;
    }

    if (sub.channelTelegram && sub.telegramUsername) {
      const tgBody = [
        buildTelegramProgramNotifyHtml(
          notifySrc,
          isPublicHttpUrl(programUrlTelegramDm) ? programUrlTelegramDm : null,
        ),
        sub.tgGroupInviteUrl ? `\n\nГруппа обновлений: ${escapeTelegramHtml(sub.tgGroupInviteUrl)}` : "",
        sub.tgOptInUrl ? `\nПодключить бота: ${escapeTelegramHtml(sub.tgOptInUrl)}` : "",
      ].join("");
      // eslint-disable-next-line no-await-in-loop
      const ok = await sendTelegramDirectIfPossible(env, sub.telegramUsername, tgBody, { parseMode: "HTML" });
      safeLog("[subscriptions] telegram DM", { status: ok ? "success" : "failed", subscriptionId: sub.id });
      sent = sent || ok;
    }

    if (sent) sentIds.push(sub.id);
  }

  if (sentIds.length > 0) {
    await prisma.updateSubscription.updateMany({
      where: { id: { in: sentIds } },
      data: { lastNotifiedAt: new Date() },
    });
  }

  if (emailAllow) {
    console.log("[subscriptions] telegram channel publish skipped (EMAIL_STAGING_ALLOWLIST is set)");
  } else {
    const channelBody = `${tgChannelHtml}\n\nЕсли нужен подбор под ваш уровень и даты — напишите в чат.`;
    const channelOk = await sendTelegramChannelUpdate(
      env,
      channelBody,
      buildTelegramInlineKeyboard(programUrlTelegramChannel, webBase, env.TELEGRAM_UPDATES_INVITE_LINK),
      { parseMode: "HTML" },
    );
    console.log("[subscriptions] telegram channel publish", channelOk ? "success" : "failed");
  }
}
