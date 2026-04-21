import type { PrismaClient } from "@prisma/client";
import type { EconomicsOverviewParams } from "./overviewService";

function escCsv(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV: комиссии в окне booking.createdAt + сверка с overview (ручной экспорт). */
export async function buildReconciliationCsv(db: PrismaClient, p: EconomicsOverviewParams): Promise<string> {
  const rows = await db.commission.findMany({
    where: {
      booking: {
        createdAt: { gte: p.dateFrom, lte: p.dateTo },
        ...(p.programId ? { programId: p.programId } : {}),
        ...(p.organizerId ? { organizerId: p.organizerId } : {}),
      },
    },
    select: {
      id: true,
      bookingId: true,
      programId: true,
      organizerId: true,
      gmvRub: true,
      commissionAmountRub: true,
      commissionCollectedRub: true,
      reconciliationStatus: true,
      booking: { select: { createdAt: true, bookingStatus: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const header = [
    "commission_id",
    "booking_id",
    "program_id",
    "organizer_id",
    "booking_created_at",
    "booking_status",
    "gmv_rub",
    "commission_amount_rub",
    "commission_collected_rub",
    "reconciliation_status",
  ].join(",");

  const lines = rows.map((r) => {
    const rub = r.commissionCollectedRub ?? r.commissionAmountRub ?? 0;
    return [
      escCsv(r.id),
      escCsv(r.bookingId),
      escCsv(r.programId),
      escCsv(r.organizerId),
      escCsv(r.booking.createdAt.toISOString()),
      escCsv(r.booking.bookingStatus),
      String(r.gmvRub),
      String(r.commissionAmountRub),
      String(rub),
      escCsv(r.reconciliationStatus),
    ].join(",");
  });

  return [header, ...lines].join("\n") + "\n";
}
