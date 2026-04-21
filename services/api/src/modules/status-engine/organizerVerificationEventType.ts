export function organizerVerificationDomainEventType(to: string): string {
  if (to === "verified") return "organizer_verified";
  if (to === "trusted_by_platform") return "organizer_trusted";
  if (to === "paused") return "organizer_suspended";
  return "organizer_verification_transition";
}
