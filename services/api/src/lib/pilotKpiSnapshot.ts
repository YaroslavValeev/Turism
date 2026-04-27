/**
 * Агрегаты пилот-KPI (без PII). Используются GET /metrics/pilot-kpi и AI founder summary.
 */
import { prisma } from "./prisma";

export type PilotKpiSnapshot = {
  pilotMode: boolean;
  note: string;
  privacy: { publicEndpoint: false; containsBookingContactData: false };
  shadow: {
    bookingsTotal: number;
    dealsTotal: number;
    sumGmvRub: number;
    sumNetRub: number;
    sumPaidRub: number;
    dealAmountRub: number;
    shadowCommissionRub: number;
  };
};

export async function getPilotKpiSnapshot(pilotMode: boolean): Promise<PilotKpiSnapshot> {
  const [bookings, deals, agg] = await Promise.all([
    prisma.booking.count(),
    prisma.deal.count(),
    prisma.booking.aggregate({ _sum: { gmvRub: true, netAmountRub: true, paidAmountRub: true } }),
  ]);
  const dealAgg = await prisma.deal.aggregate({
    _sum: { dealAmountRub: true, commissionAmountRub: true },
  });
  return {
    pilotMode,
    note: pilotMode
      ? "PILOT_MODE: платежи/инвойсы выключены; суммы — shadow-учёт для аналитики."
      : "PILOT_MODE off",
    privacy: { publicEndpoint: false, containsBookingContactData: false },
    shadow: {
      bookingsTotal: bookings,
      dealsTotal: deals,
      sumGmvRub: agg._sum.gmvRub ?? 0,
      sumNetRub: agg._sum.netAmountRub ?? 0,
      sumPaidRub: agg._sum.paidAmountRub ?? 0,
      dealAmountRub: dealAgg._sum.dealAmountRub ?? 0,
      shadowCommissionRub: dealAgg._sum.commissionAmountRub ?? 0,
    },
  };
}
