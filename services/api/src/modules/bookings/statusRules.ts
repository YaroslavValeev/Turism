/**
 * Booking status transition rules. Source: canonical_status_models.md
 * - booking cannot jump from new directly to completed
 * - status must be canonical
 */
import { isBookingStatus, type BookingStatus } from "@mywave/shared-types";

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  created: ["contacted", "booked", "canceled", "disputed"],
  new: ["reviewed", "sent_to_organizer", "cancelled_user", "cancelled_organizer"],
  reviewed: ["sent_to_organizer", "new", "cancelled_user", "cancelled_organizer"],
  sent_to_organizer: ["contacted", "cancelled_user", "cancelled_organizer"],
  contacted: ["offer_sent", "booked", "cancelled_user", "cancelled_organizer"],
  offer_sent: ["booked", "contacted", "cancelled_user", "cancelled_organizer"],
  booked: ["paid_partial", "paid_full", "paid_off_platform", "completed", "canceled", "cancelled_user", "cancelled_organizer", "refund_pending", "disputed"],
  paid_partial: ["paid_full", "completed", "refunded_partial", "refunded_full", "canceled", "disputed"],
  paid_full: ["completed", "refunded_partial", "refunded_full", "canceled", "disputed"],
  paid_off_platform: ["completed", "cancelled_user", "cancelled_organizer", "refund_pending", "disputed"],
  completed: ["refund_pending", "refunded_partial", "refunded_full", "disputed"],
  canceled: ["refunded_partial", "refunded_full"],
  cancelled_user: ["refund_pending", "refund_done"],
  cancelled_organizer: ["refund_pending", "refund_done"],
  refunded_partial: ["refunded_full", "disputed"],
  refunded_full: [],
  refund_pending: ["refund_done"],
  refund_done: [],
  disputed: ["booked", "paid_partial", "paid_full", "completed", "canceled"],
};

export function isValidTransition(from: string, to: string): boolean {
  if (!isBookingStatus(from) || !isBookingStatus(to)) return false;
  return ALLOWED_TRANSITIONS[from as BookingStatus].includes(to as BookingStatus);
}

/** Allowed next statuses for admin UI (booking queue flow). */
export function getNextStatuses(current: string): BookingStatus[] {
  if (!isBookingStatus(current)) return [];
  return ALLOWED_TRANSITIONS[current as BookingStatus];
}

export { isBookingStatus, type BookingStatus };
