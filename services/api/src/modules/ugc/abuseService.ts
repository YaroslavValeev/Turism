import type { Env } from "@mywave/config";
import type { PrismaClient, ReferralCode } from "@prisma/client";

export type ReferralAbuseReason = "self_use_blocked" | "duplicate_use_blocked" | "rate_limited";

export type ReferralGuardInput = {
  code: string;
  email: string | null;
  userId: string | null;
  programId: string;
};

export type ReferralGuardDecision =
  | { ok: true; code: string; refRow: ReferralCode }
  | { ok: false; reason: ReferralAbuseReason; detail?: string };

export async function recordReferralAbuse(
  prisma: PrismaClient,
  params: {
    code: string | null;
    reason: ReferralAbuseReason;
    email?: string | null;
    userId?: string | null;
    programId?: string | null;
    bookingId?: string | null;
    detail?: string | null;
  },
): Promise<void> {
  try {
    await prisma.referralAbuseEvent.create({
      data: {
        code: params.code ?? null,
        reason: params.reason,
        email: params.email ?? null,
        userId: params.userId ?? null,
        programId: params.programId ?? null,
        bookingId: params.bookingId ?? null,
        detail: params.detail?.slice(0, 500) ?? null,
      },
    });
  } catch {
    // best-effort: журнал не должен валить booking flow
  }
}

function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Решает, можно ли применить referral-код к этому booking.
 *
 *  - self-use: booking.email == ref.ownerEmail ИЛИ booking.userId == ref.ownerUserId
 *  - duplicate: уже есть booking с таким же кодом и тем же email (для того же hash travelerKey)
 *  - rate-limit: > REFERRAL_MAX_BOOKINGS_PER_DAY бронирований по коду за последние 24 часа
 *
 * Неизвестный / некорректный код возвращает `{ ok: false, reason: 'duplicate_use_blocked', detail: 'unknown' }`
 * только если код валидного формата, но не найден — мы уже отфильтровали в bookings/routes.ts,
 * сюда такого не передаём.
 */
export async function canUseReferralCode(
  prisma: PrismaClient,
  env: Env,
  input: ReferralGuardInput,
): Promise<ReferralGuardDecision> {
  const refRow = await prisma.referralCode.findUnique({ where: { code: input.code } });
  if (!refRow) {
    return { ok: false, reason: "duplicate_use_blocked", detail: "unknown_code" };
  }

  // 1. Self-use guard
  if (sameEmail(input.email, refRow.ownerEmail)) {
    return { ok: false, reason: "self_use_blocked", detail: "owner_email_match" };
  }
  if (input.userId && refRow.ownerUserId && input.userId === refRow.ownerUserId) {
    return { ok: false, reason: "self_use_blocked", detail: "owner_user_match" };
  }

  // 2. Duplicate use: этот email/этот userId уже использовал данный код.
  if (input.email) {
    const dup = await prisma.booking.findFirst({
      where: {
        referralCode: input.code,
        OR: [
          { guestContact: { contains: input.email, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    if (dup) {
      return { ok: false, reason: "duplicate_use_blocked", detail: "email_already_used_code" };
    }
  }

  // 3. Rate-limit: бронирования по коду за последние 24 часа.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.booking.count({
    where: { referralCode: input.code, createdAt: { gte: since } },
  });
  const maxPerDay = Math.max(1, env.REFERRAL_MAX_BOOKINGS_PER_DAY);
  if (recent >= maxPerDay) {
    return {
      ok: false,
      reason: "rate_limited",
      detail: `${recent}/${maxPerDay} last 24h`,
    };
  }

  return { ok: true, code: refRow.code, refRow };
}
