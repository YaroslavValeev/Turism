import { randomBytes } from "crypto";
import type { Env } from "@mywave/config";
import type { PrismaClient, ProgramUgc } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import { combineRewardMultipliersBps, computeGlobalDiscountGuardrail } from "../economics/guardrailsService";
import { getEffectiveProgramEconomics } from "../economics/economicsOverride";
import { sendNotificationEmail } from "../notifications/sendChannels";
import { notificationTokenSecret } from "../notifications/notificationTokens";
import { signMyRewardsToken } from "./ugcTokens";

const REFERRAL_CODE_LEN = 8;
const REFERRAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // без 0/O/1/I для читаемости
const MAX_RETRY = 5;

/** Срок действия reward с момента выдачи; null если validity отключена (0 дней). */
export function userRewardExpiresAtFromGrant(env: Env, grantAt: Date): Date | null {
  const days = env.REFERRAL_REWARD_VALIDITY_DAYS;
  if (!Number.isFinite(days) || days <= 0) return null;
  const out = new Date(grantAt);
  out.setUTCDate(out.getUTCDate() + Math.floor(days));
  return out;
}

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

function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LEN);
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LEN; i++) {
    out += REFERRAL_ALPHABET[bytes[i]! % REFERRAL_ALPHABET.length];
  }
  return `MW-${out}`;
}

async function createReferralCodeUnique(
  prisma: PrismaClient,
  ownerEmail: string | null,
  ownerUserId: string | null,
  ownerUgcId: string,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const code = generateReferralCode();
    try {
      await prisma.referralCode.create({
        data: { code, ownerEmail, ownerUserId, ownerUgcId },
      });
      return code;
    } catch (e) {
      const err = e as { code?: string };
      if (err?.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("failed_to_generate_unique_referral_code");
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

function rewardEmailHtml(env: Env, params: {
  authorName: string;
  programTitle: string;
  referralCode: string;
  myRewardsUrl: string | null;
}): { subject: string; html: string } {
  const site = siteBase(env);
  const shareUrl = `${site}/public/referral/${encodeURIComponent(params.referralCode)}`;
  const subject = "Спасибо за отзыв — ваш бонус на следующую программу";
  const myBonusBlock = params.myRewardsUrl
    ? `<p>Открыть страницу с вашими бонусами: <a href="${escapeHtml(params.myRewardsUrl)}">${escapeHtml(params.myRewardsUrl)}</a></p>`
    : "";
  const html = `
<p>${escapeHtml(params.authorName)}, спасибо за отзыв о программе «${escapeHtml(params.programTitle)}».</p>
<p>Ваш отзыв прошёл модерацию и уже помогает другим участникам выбрать программу.</p>
<p>В благодарность — бонус на следующую программу MyWave. Бонус применится автоматически при следующем бронировании.</p>
${myBonusBlock}
<p><strong>Ваш реферальный код:</strong></p>
<p style="font-size:20px;font-family:monospace;letter-spacing:1px;background:#f3f4f6;padding:10px 14px;border-radius:6px;display:inline-block">${escapeHtml(params.referralCode)}</p>
<p>Поделитесь ссылкой с друзьями — если они забронируют программу по ней, мы это увидим и предложим бонус обеим сторонам:</p>
<p><a href="${escapeHtml(shareUrl)}">${escapeHtml(shareUrl)}</a></p>
<p><small>MyWave Travel</small></p>
`;
  return { subject, html };
}

export function rewardRecoveredEmailHtml(env: Env, params: {
  authorName: string | null;
  cancellationKind: string | null;
  myRewardsUrl: string | null;
}): { subject: string; html: string } {
  const subject = "Ваш бонус восстановлен";
  const greeting = params.authorName ? `${escapeHtml(params.authorName)}, ` : "";
  const reasonLine = params.cancellationKind
    ? `<p>Бронирование было отменено (${escapeHtml(params.cancellationKind)}), и мы вернули ваш бонус — он снова доступен.</p>`
    : `<p>Бронирование было отменено, и мы вернули ваш бонус — он снова доступен.</p>`;
  const linkBlock = params.myRewardsUrl
    ? `<p>Открыть страницу с бонусами: <a href="${escapeHtml(params.myRewardsUrl)}">${escapeHtml(params.myRewardsUrl)}</a></p>`
    : "";
  const html = `
<p>${greeting}здравствуйте.</p>
${reasonLine}
<p>Бонус применится автоматически при следующем бронировании MyWave.</p>
${linkBlock}
<p><small>MyWave Travel</small></p>
`;
  return { subject, html };
}

export async function sendRewardRecoveredEmail(
  env: Env,
  to: string | null,
  params: { authorName: string | null; cancellationKind: string | null; userId: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  if (!to || !to.includes("@")) return { ok: false, reason: "no_email" };
  const url = myRewardsLink(env, { email: to, userId: params.userId });
  const { subject, html } = rewardRecoveredEmailHtml(env, {
    authorName: params.authorName,
    cancellationKind: params.cancellationKind,
    myRewardsUrl: url,
  });
  const r = await sendNotificationEmail(env, to, subject, html);
  return { ok: r.ok };
}

/**
 * Правило: UGC approved + есть textReview или media → rewardStatus = granted,
 * генерируется referralCode, отправляется placeholder email (best-effort).
 *
 * Идемпотентно: если rewardStatus уже != 'none', ничего не делает.
 */
export async function maybeGrantRewardForApprovedUgc(
  prisma: PrismaClient,
  env: Env,
  ugc: ProgramUgc,
): Promise<{
  granted: boolean;
  referralCode?: string;
  emailSent?: boolean;
  reason?: string;
  guardrail?: { user_reward_bps?: number; global_avg_discount_share_pct?: number; skipped_user_reward?: boolean };
}> {
  if (ugc.moderationStatus !== "approved") {
    return { granted: false, reason: "not_approved" };
  }
  if (ugc.rewardStatus !== "none") {
    return { granted: false, reason: "already_processed", referralCode: ugc.referralCode ?? undefined };
  }

  const hasText = !!ugc.textReview && ugc.textReview.trim().length > 0;
  const media = Array.isArray(ugc.mediaUrls) ? ugc.mediaUrls : [];
  const hasMedia = media.length > 0;
  if (!hasText && !hasMedia) {
    await prisma.programUgc.update({
      where: { id: ugc.id },
      data: { rewardStatus: "none" },
    });
    return { granted: false, reason: "empty_content" };
  }

  const programRow = await prisma.program.findUnique({
    where: { id: ugc.programId },
    select: {
      title: true,
      economicsRewardSuspended: true,
      economicsRewardMultiplierBps: true,
      economicsOverrideMode: true,
      economicsOverrideUntil: true,
    },
  });
  if (!programRow) {
    return { granted: false, reason: "program_not_found" };
  }
  const eff = getEffectiveProgramEconomics(programRow, env);
  if (eff.suspended || eff.multiplierBps === 0) {
    await writeAuditLog({
      entityType: "program_ugc",
      entityId: ugc.id,
      changedField: "reward_grant",
      oldValue: "attempt",
      newValue: "blocked",
      changedBy: null,
      reason: "economics_program_reward_suspended",
    });
    return { granted: false, reason: "economics_program_reward_suspended" };
  }

  const code = await createReferralCodeUnique(
    prisma,
    ugc.contactEmail ?? null,
    ugc.userId ?? null,
    ugc.id,
  );

  await prisma.programUgc.update({
    where: { id: ugc.id },
    data: {
      rewardStatus: "granted",
      rewardGrantedAt: new Date(),
      referralCode: code,
    },
  });

  // Создаём UserReward для автора UGC. Идемпотентно: ищем по source+sourceRefId.
  const existingReward = await prisma.userReward.findFirst({
    where: { source: "ugc", sourceRefId: ugc.id },
    select: { id: true },
  });

  let guardrail:
    | { user_reward_bps?: number; global_avg_discount_share_pct?: number; skipped_user_reward?: boolean }
    | undefined;

  if (!existingReward) {
    const valueType = (env.REFERRAL_REWARD_VALUE_TYPE === "amount" ? "amount" : "percent") as "percent" | "amount";
    const baseValue = Math.max(1, Math.floor(env.REFERRAL_REWARD_VALUE || 5));
    const grantAt = new Date();
    const globalG = await computeGlobalDiscountGuardrail(prisma, env);
    const programBps = eff.multiplierBps;
    const globalBps =
      globalG.mode === "ok" ? 10000 : globalG.mode === "suspend" ? 0 : globalG.valueMultiplierBps;
    const combinedBps = combineRewardMultipliersBps(globalBps, programBps);
    guardrail = {
      user_reward_bps: combinedBps,
      global_avg_discount_share_pct: globalG.avgDiscountSharePct,
      skipped_user_reward: combinedBps === 0,
    };

    if (combinedBps === 0) {
      await writeAuditLog({
        entityType: "program_ugc",
        entityId: ugc.id,
        changedField: "user_reward",
        oldValue: "pending",
        newValue: "skipped_global_suspend",
        changedBy: null,
        reason: `economics_global_reward_suspended avg_discount_share_pct=${globalG.avgDiscountSharePct}`,
      });
    } else {
      const value = Math.max(1, Math.floor((baseValue * combinedBps) / 10000));
      if (combinedBps < 10000) {
        await writeAuditLog({
          entityType: "program_ugc",
          entityId: ugc.id,
          changedField: "user_reward_value_bps",
          oldValue: String(baseValue),
          newValue: String(value),
          changedBy: null,
          reason: `economics_reward_adjusted combined_bps=${combinedBps} global_avg_discount_share_pct=${globalG.avgDiscountSharePct}`,
        });
      }
      await prisma.userReward.create({
        data: {
          userId: ugc.userId ?? null,
          email: ugc.contactEmail ?? null,
          source: "ugc",
          sourceRefId: ugc.id,
          valueType,
          value,
          currency: valueType === "amount" ? env.REFERRAL_REWARD_CURRENCY ?? null : null,
          status: "available",
          expiresAt: userRewardExpiresAtFromGrant(env, grantAt),
        },
      });
    }
  }

  let emailSent = false;
  if (ugc.contactEmail && ugc.contactEmail.includes("@")) {
    const myRewardsUrl = myRewardsLink(env, {
      email: ugc.contactEmail ?? null,
      userId: ugc.userId ?? null,
    });
    const { subject, html } = rewardEmailHtml(env, {
      authorName: ugc.authorName,
      programTitle: programRow.title ?? "вашей программе",
      referralCode: code,
      myRewardsUrl,
    });
    const result = await sendNotificationEmail(env, ugc.contactEmail, subject, html);
    emailSent = result.ok;
  }

  return { granted: true, referralCode: code, emailSent, guardrail };
}

/**
 * Ищет активный reward для (userId OR email) и атомарно "помечает" его
 * как использованный этим booking-ом. Возвращает id применённого reward или null.
 *
 * Идемпотентно: если у booking уже есть appliedRewardId — пропускает.
 * Защита от гонки: updateMany с фильтром status='available'.
 */
export async function applyAvailableReward(
  prisma: PrismaClient,
  env: Env,
  params: { bookingId: string; userId: string | null; email: string | null },
): Promise<{ appliedRewardId: string | null; valueType?: string; value?: number; reason?: string }> {
  if (!params.userId && !params.email) return { appliedRewardId: null };

  const existing = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    select: {
      appliedRewardId: true,
      program: {
        select: {
          economicsRewardSuspended: true,
          economicsRewardMultiplierBps: true,
          economicsOverrideMode: true,
          economicsOverrideUntil: true,
        },
      },
    },
  });
  if (existing?.appliedRewardId) {
    return { appliedRewardId: existing.appliedRewardId };
  }
  const p = existing?.program;
  const effApply = p
    ? getEffectiveProgramEconomics(
        {
          economicsRewardSuspended: p.economicsRewardSuspended,
          economicsRewardMultiplierBps: p.economicsRewardMultiplierBps,
          economicsOverrideMode: p.economicsOverrideMode,
          economicsOverrideUntil: p.economicsOverrideUntil,
        },
        env,
      )
    : null;
  if (effApply?.suspended || effApply?.multiplierBps === 0) {
    await writeAuditLog({
      entityType: "booking",
      entityId: params.bookingId,
      changedField: "apply_reward",
      oldValue: null,
      newValue: "skipped",
      changedBy: null,
      reason: "economics_program_reward_suspended",
    });
    return { appliedRewardId: null, reason: "economics_program_reward_suspended" };
  }

  const now = new Date();
  const ownerOr: Array<{ userId?: string } | { email?: { equals: string; mode: "insensitive" } }> = [];
  if (params.userId) ownerOr.push({ userId: params.userId });
  if (params.email) ownerOr.push({ email: { equals: params.email, mode: "insensitive" } });

  const reward = await prisma.userReward.findFirst({
    where: {
      status: "available",
      AND: [
        { OR: ownerOr },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, valueType: true, value: true },
  });
  if (!reward) return { appliedRewardId: null };

  // Атомарная "consume" реварда: только если ещё available.
  const res = await prisma.userReward.updateMany({
    where: { id: reward.id, status: "available" },
    data: { status: "used", usedAt: now, usedBookingId: params.bookingId },
  });
  if (res.count === 0) return { appliedRewardId: null };

  await prisma.booking.update({
    where: { id: params.bookingId },
    data: { appliedRewardId: reward.id },
  });

  return { appliedRewardId: reward.id, valueType: reward.valueType, value: reward.value };
}

/**
 * Минимальные счётчики для growth-loop analytics.
 */
export async function getGrowthLoopCounters(prisma: PrismaClient): Promise<{
  ugc: { approved: number; granted: number; pending: number; rejected: number };
  referrals: { total: number; visits: number; bookings: number };
  rewards: { issued: number; used: number; available: number; expired: number };
  abuse: { self_use_blocked: number; duplicate_use_blocked: number; rate_limited: number };
  funnel: { approved_to_granted_pct: number; granted_to_visit_pct: number; visit_to_booking_pct: number };
}> {
  const [
    approved,
    granted,
    pending,
    rejected,
    totalCodes,
    visitedCodes,
    bookingsFromReferral,
    visitsSum,
    bookingsSum,
    rewardsIssued,
    rewardsUsed,
    rewardsAvailable,
    rewardsExpired,
    selfUseBlocked,
    duplicateBlocked,
    rateLimited,
  ] = await Promise.all([
    prisma.programUgc.count({ where: { moderationStatus: "approved" } }),
    prisma.programUgc.count({ where: { rewardStatus: "granted" } }),
    prisma.programUgc.count({ where: { moderationStatus: "pending" } }),
    prisma.programUgc.count({ where: { moderationStatus: "rejected" } }),
    prisma.referralCode.count(),
    prisma.referralCode.count({ where: { visits: { gt: 0 } } }),
    prisma.booking.count({ where: { referralCode: { not: null } } }),
    prisma.referralCode.aggregate({ _sum: { visits: true } }),
    prisma.referralCode.aggregate({ _sum: { bookings: true } }),
    prisma.userReward.count(),
    prisma.userReward.count({ where: { status: "used" } }),
    prisma.userReward.count({ where: { status: "available" } }),
    prisma.userReward.count({ where: { status: "expired" } }),
    prisma.referralAbuseEvent.count({ where: { reason: "self_use_blocked" } }),
    prisma.referralAbuseEvent.count({ where: { reason: "duplicate_use_blocked" } }),
    prisma.referralAbuseEvent.count({ where: { reason: "rate_limited" } }),
  ]);

  const visits = visitsSum._sum.visits ?? 0;
  const bookings = bookingsSum._sum.bookings ?? bookingsFromReferral;

  const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

  return {
    ugc: { approved, granted, pending, rejected },
    referrals: { total: totalCodes, visits, bookings },
    rewards: { issued: rewardsIssued, used: rewardsUsed, available: rewardsAvailable, expired: rewardsExpired },
    abuse: {
      self_use_blocked: selfUseBlocked,
      duplicate_use_blocked: duplicateBlocked,
      rate_limited: rateLimited,
    },
    funnel: {
      approved_to_granted_pct: pct(granted, approved),
      granted_to_visit_pct: pct(visitedCodes, granted),
      visit_to_booking_pct: pct(bookings, visits),
    },
  };
}
