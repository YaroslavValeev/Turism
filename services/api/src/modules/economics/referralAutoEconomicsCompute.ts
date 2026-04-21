import type { Env } from "@mywave/config";
import { Prisma, type PrismaClient } from "@prisma/client";

export type ReferralAutoEconomicsComputed = {
  low: boolean;
  economicsLowQualityReason: string | null;
  ewRef: boolean;
  ewRefReason: string | null;
  ewRefSnapshot: Prisma.InputJsonValue | null;
};

/**
 * Авто-расчёт low_quality + EW для одного referral-кода (паритет с runEconomicsGuardrailsJob, без override).
 */
export async function computeReferralAutoEconomicsState(
  db: PrismaClient,
  env: Env,
  params: {
    code: string;
    visits: number;
    bookings: number;
    fromLong: Date;
    fromShort: Date;
    shortDays: number;
    longDays: number;
    triggers?: Array<{ kind: string; detail: string }>;
  },
): Promise<ReferralAutoEconomicsComputed> {
  const minConv = env.ECON_MIN_REFERRAL_CONVERSION ?? 2;
  const refEwEnabled = env.ECON_REFERRAL_EW_ENABLED && env.ECON_EARLY_WARNING_ENABLED;
  const refEwFactor = Math.max(1.01, env.ECON_REFERRAL_EW_VELOCITY_DROP_FACTOR ?? 1.5);
  const refEwMinBk = Math.max(1, Math.floor(env.ECON_REFERRAL_EW_MIN_BOOKINGS_LONG ?? 3));
  const expectedShortShare = params.shortDays / params.longDays;

  const convPct =
    params.visits > 0 ? Math.round((params.bookings / params.visits) * 10000) / 100 : 0;
  const low = convPct < minConv;

  let ewRef = false;
  let ewRefReason: string | null = null;
  let ewRefSnapshot: Prisma.InputJsonValue | null = null;

  if (refEwEnabled) {
    const [bookingsLong, bookingsShort] = await Promise.all([
      db.booking.count({
        where: { referralCode: params.code, createdAt: { gte: params.fromLong } },
      }),
      db.booking.count({
        where: { referralCode: params.code, createdAt: { gte: params.fromShort } },
      }),
    ]);

    const actualFrac = bookingsShort / Math.max(1, bookingsLong);
    const degraded =
      bookingsLong >= refEwMinBk && actualFrac < expectedShortShare / refEwFactor;

    if (degraded) {
      ewRef = true;
      ewRefReason = "early_warning_referral_velocity_drop";
      ewRefSnapshot = {
        kind: "referral_booking_share_short_vs_long",
        short_window_days: params.shortDays,
        long_window_days: params.longDays,
        bookings_long: bookingsLong,
        bookings_short: bookingsShort,
        actual_share: Math.round(actualFrac * 1000) / 1000,
        expected_share: Math.round(expectedShortShare * 1000) / 1000,
        factor: refEwFactor,
      };
      params.triggers?.push({
        kind: "early_warning_referral_velocity",
        detail: `${params.code}: share ${actualFrac.toFixed(3)} < ${(expectedShortShare / refEwFactor).toFixed(3)}`,
      });
    }
  }

  return {
    low,
    economicsLowQualityReason: low
      ? `conversion_${convPct}_pct_lt_${minConv}_visits_${params.visits}`
      : null,
    ewRef,
    ewRefReason,
    ewRefSnapshot,
  };
}
