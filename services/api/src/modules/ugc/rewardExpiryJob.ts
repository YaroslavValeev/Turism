/**
 * Ежедневный job:
 * 1) Мягкие напоминания: available, истекает в окне (now; now+window], без дубликата, возраст ≥ min age, есть email.
 * 2) Expiry: available + expiresAt < now → expired (audit).
 */
import type { Env } from "@mywave/config";
import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import { sendNotificationEmail } from "../notifications/sendChannels";
import { notificationTokenSecret } from "../notifications/notificationTokens";
import { signMyRewardsToken } from "./ugcTokens";

export type RewardExpiryJobResult = {
  /** Сколько reward реально переведено в expired за этот прогон */
  expired: number;
  /** Кандидатов на expiry (до атомарного update) */
  candidates: number;
  /** Успешно отправлено и зафиксировано напоминаний */
  reminders_sent: number;
  /** Кандидатов на напоминание (после фильтра по email) */
  reminder_candidates: number;
};

function siteBase(env: Env): string {
  return (env.NOTIFICATIONS_SITE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtRewardLine(r: { valueType: string; value: number; currency: string | null }): string {
  if (r.valueType === "amount") {
    return `${r.value.toLocaleString("ru-RU")} ${escapeHtml(r.currency ?? "₽")}`;
  }
  return `${r.value}%`;
}

function myRewardsLink(env: Env, params: { email: string | null; userId: string | null }): string | null {
  if (!params.email && !params.userId) return null;
  try {
    const secret = notificationTokenSecret(env);
    const token = signMyRewardsToken(secret, { email: params.email, userId: params.userId });
    return `${siteBase(env)}/my-rewards?token=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

function expiryReminderEmailHtml(env: Env, params: {
  valueLine: string;
  expiresAt: Date;
  programsUrl: string;
  myRewardsUrl: string | null;
}): { subject: string; html: string } {
  const subject = "Ваш бонус скоро истечёт";
  const dateStr = escapeHtml(
    params.expiresAt.toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" }),
  );
  const myBlock = params.myRewardsUrl
    ? `<p><a href="${escapeHtml(params.myRewardsUrl)}">Открыть «Мои бонусы»</a></p>`
    : "";
  const html = `
<p>Напоминаем: ваш бонус MyWave скоро перестанет действовать.</p>
<p><strong>Размер:</strong> ${params.valueLine}</p>
<p><strong>Действителен до:</strong> ${dateStr}</p>
<p><a href="${escapeHtml(params.programsUrl)}">Посмотреть доступные программы</a></p>
${myBlock}
<p><small>MyWave Travel</small></p>
`;
  return { subject, html };
}

/**
 * Окно напоминания: expiresAt ∈ (now; now + windowDays], один раз на reward (`expiryReminderSentAt`).
 * Не отправляем, если reward моложе minAgeDays (анти-шум).
 */
export async function sendRewardExpiryReminders(
  prisma: PrismaClient,
  env: Env,
): Promise<{ sent: number; candidates: number }> {
  const windowDays = Math.max(1, Math.floor(env.REFERRAL_REWARD_EXPIRY_REMINDER_WINDOW_DAYS || 7));
  const minAgeDays = Math.max(0, Math.floor(env.REFERRAL_REWARD_REMINDER_MIN_AGE_DAYS ?? 7));
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const maxCreatedAt = new Date(now.getTime() - minAgeDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.userReward.findMany({
    where: {
      status: "available",
      expiresAt: { gt: now, lte: windowEnd },
      expiryReminderSentAt: null,
      createdAt: { lte: maxCreatedAt },
      email: { not: null },
    },
    select: {
      id: true,
      email: true,
      userId: true,
      valueType: true,
      value: true,
      currency: true,
      expiresAt: true,
    },
  });

  const eligible = rows.filter((r) => r.email && r.email.includes("@") && r.expiresAt);
  let sent = 0;
  const programsUrl = `${siteBase(env)}/`;

  for (const row of eligible) {
    const email = row.email!.trim();
    const expiresAt = row.expiresAt!;
    const valueLine = fmtRewardLine({
      valueType: row.valueType,
      value: row.value,
      currency: row.currency,
    });
    const myRewardsUrl = myRewardsLink(env, { email, userId: row.userId ?? null });
    const { subject, html } = expiryReminderEmailHtml(env, {
      valueLine,
      expiresAt,
      programsUrl,
      myRewardsUrl,
    });

    const result = await sendNotificationEmail(env, email, subject, html);
    if (!result.ok) continue;

    const upd = await prisma.userReward.updateMany({
      where: {
        id: row.id,
        status: "available",
        expiryReminderSentAt: null,
        expiresAt: { gt: now },
      },
      data: { expiryReminderSentAt: new Date() },
    });
    if (upd.count === 1) sent += 1;
  }

  return { sent, candidates: eligible.length };
}

async function expireAvailablePastDue(prisma: PrismaClient): Promise<{ expired: number; candidates: number }> {
  const now = new Date();
  const candidates = await prisma.userReward.findMany({
    where: {
      status: "available",
      expiresAt: { not: null, lt: now },
    },
    select: { id: true },
  });

  let expired = 0;
  for (const row of candidates) {
    const didExpire = await prisma.$transaction(async (tx) => {
      const upd = await tx.userReward.updateMany({
        where: {
          id: row.id,
          status: "available",
          expiresAt: { lt: now },
        },
        data: { status: "expired" },
      });
      if (upd.count !== 1) return false;

      await writeAuditLog(
        {
          entityType: "user_reward",
          entityId: row.id,
          changedField: "status",
          oldValue: "available",
          newValue: "expired",
          changedBy: "system",
          reason: "expires_at_reached",
        },
        tx,
      );
      return true;
    });
    if (didExpire) expired += 1;
  }

  return { expired, candidates: candidates.length };
}

export async function runRewardExpiryJob(prisma: PrismaClient, env: Env): Promise<RewardExpiryJobResult> {
  const reminders = await sendRewardExpiryReminders(prisma, env);
  const expiry = await expireAvailablePastDue(prisma);
  return {
    expired: expiry.expired,
    candidates: expiry.candidates,
    reminders_sent: reminders.sent,
    reminder_candidates: reminders.candidates,
  };
}
