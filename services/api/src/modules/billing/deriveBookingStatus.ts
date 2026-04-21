/**
 * Платёжно-учётное вычисление `Booking.bookingStatus` из сумм (контур billing).
 *
 * ADR-007 (Accepted, вариант C): один из **двух** разрешённых источников смены `bookingStatus`:
 * 1) операционный — `applyBookingStatusTransition` + `bookingTransitions`;
 * 2) billing-derived — здесь + доменное событие `booking_payment_derived_status`.
 *
 * Любой третий способ записи `bookingStatus` запрещён без нового ADR.
 */

// ADR-007: billing-derived status path.
// This is a second controlled source of bookingStatus updates.
// DO NOT introduce additional writers without ADR.

export function deriveBookingStatus(paidAmountRub: number, refundedAmountRub: number): string {
  if (paidAmountRub <= 0) return "created";
  if (refundedAmountRub >= paidAmountRub) return "refunded_full";
  if (refundedAmountRub > 0) return "refunded_partial";
  return "paid_full";
}
