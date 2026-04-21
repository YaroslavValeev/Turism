export function bookingStatusDomainEventType(from: string, to: string): string {
  if (from === "new" && to === "sent_to_organizer") return "lead_delivered";
  if (to === "booked") return "deal_booked";
  if (to === "contacted" || to === "sent_to_organizer" || to === "offer_sent") return "lead_contacted";
  void from;
  return "booking_status_transition";
}
