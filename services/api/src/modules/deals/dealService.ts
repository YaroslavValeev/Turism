import { prisma } from "../../lib/prisma";

export const DEAL_STATUSES = ["new", "contacted", "confirmed", "completed", "canceled"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

function isVerifiedOrganizer(verificationStatus: string): boolean {
  return verificationStatus === "verified" || verificationStatus === "trusted_by_platform";
}

export function mapBookingStatusToDealStatus(bookingStatus: string): DealStatus {
  if (
    bookingStatus === "cancelled_user" ||
    bookingStatus === "cancelled_organizer" ||
    bookingStatus.startsWith("refund")
  ) {
    return "canceled";
  }
  if (bookingStatus === "completed") return "completed";
  if (
    bookingStatus === "booked" ||
    bookingStatus === "offer_sent" ||
    bookingStatus === "paid_partial" ||
    bookingStatus === "paid_full" ||
    bookingStatus === "paid_off_platform"
  ) {
    return "confirmed";
  }
  if (bookingStatus === "contacted" || bookingStatus === "sent_to_organizer" || bookingStatus === "reviewed") {
    return "contacted";
  }
  return "new";
}

export function resolveContentItemIdForAttribution(
  entryType: string | undefined,
  entryId: string | undefined
): string | null {
  if (!entryId?.trim()) return null;
  const t = (entryType || "").toLowerCase();
  if (t === "blog" || t === "content" || t === "content_item" || t === "collection") {
    return entryId.trim();
  }
  return null;
}

export async function createDealForBooking(
  bookingId: string,
  contentItemId: string | null
): Promise<void> {
  await prisma.deal.create({
    data: {
      bookingId,
      contentItemId,
      dealStatus: "new",
      dealAmountRub: 0,
      commissionRatePct: 3,
      commissionAmountRub: 0,
    },
  });
}

export async function syncDealFromBooking(
  booking: {
    id: string;
    bookingStatus: string;
    gmvRub: number | null;
    netAmountRub: number;
    contentItemId: string | null;
  },
  organizerVerificationStatus: string
): Promise<void> {
  const deal = await prisma.deal.findUnique({ where: { bookingId: booking.id } });
  if (!deal) return;
  const nextStatus = mapBookingStatusToDealStatus(booking.bookingStatus);
  const amount = Math.max(0, booking.gmvRub ?? booking.netAmountRub ?? 0);
  const ratePct = deal.commissionRatePct > 0 ? deal.commissionRatePct : 3;
  const eligible =
    isVerifiedOrganizer(organizerVerificationStatus) &&
    (nextStatus === "confirmed" || nextStatus === "completed");
  const commissionAmountRub = eligible ? Math.round((amount * ratePct) / 100) : 0;
  await prisma.deal.update({
    where: { bookingId: booking.id },
    data: {
      dealStatus: nextStatus,
      contentItemId: booking.contentItemId ?? deal.contentItemId,
      dealAmountRub: amount,
      commissionRatePct: ratePct,
      commissionAmountRub,
    },
  });
}

export function commissionEligible(
  organizerVerificationStatus: string,
  dealStatus: string
): boolean {
  return (
    isVerifiedOrganizer(organizerVerificationStatus) &&
    (dealStatus === "confirmed" || dealStatus === "completed")
  );
}
