/**
 * ADR-007: единственные модули runtime API, в которых допустима запись `Booking.bookingStatus`
 * (операционный engine, billing-derived, bootstrap create — см. `STAGE4_1_BOOKING_STATUS_WRITERS_AUDIT.md`).
 * Используется регрессионным тестом; не импортировать в бизнес-логику как источник истины.
 */
export const ADR007_BOOKING_STATUS_WRITE_MODULE_SUFFIXES = [
  "modules/bookings/routes.ts",
  "modules/status-engine/applyBookingStatusTransition.ts",
  "modules/billing/service.ts",
] as const;
