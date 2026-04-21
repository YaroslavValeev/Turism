import {
  isOrganizerVerificationStatus,
  ORGANIZER_VERIFICATION_STATUSES,
  type OrganizerVerificationStatus,
} from "@mywave/shared-types";

/**
 * Переходы verificationStatus организатора.
 * Сохраняем прежнюю семантику API: любой канонический статус → любой канонический (админ-инструмент).
 */
export function isValidOrganizerVerificationTransition(from: string, to: string): boolean {
  return isOrganizerVerificationStatus(from) && isOrganizerVerificationStatus(to);
}

export function getNextOrganizerVerificationStatuses(current: string): OrganizerVerificationStatus[] {
  if (!isOrganizerVerificationStatus(current)) {
    return [...ORGANIZER_VERIFICATION_STATUSES];
  }
  return ORGANIZER_VERIFICATION_STATUSES.filter((s) => s !== current);
}
