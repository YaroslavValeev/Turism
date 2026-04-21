/** Имя доменного события для таймлайна / интеграций (не analytics store). */
export function programPublishDomainEventType(from: string, to: string): string {
  if (to === "internal_review") return "program_submitted";
  if (to === "approved") return "program_approved";
  if (to === "published") return "program_published";
  void from;
  return "program_publish_transition";
}
