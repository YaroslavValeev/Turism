import { isProgramPubliclyVisible } from "./publicVisibility";

type Program = Parameters<typeof isProgramPubliclyVisible>[0];
export type ArchiveAudit = {
  changedBy: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: Date;
};

/** Reading a completed trip never makes it bookable or adds it to the catalogue. */
export function isCompletedPublicCandidate(program: Program, now = new Date()): boolean {
  if (!["published", "archived"].includes(program.publishStatus) || program.scheduleType === "on_request") return false;
  if (program.startDate == null || program.endDate == null) return false;
  const start = new Date(program.startDate), end = new Date(program.endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (end.getTime() >= today) return false;
  // Reuse the existing review/organizer gates at the trip's final day.
  // Remaining places restrict new bookings, not reading a past trip.
  return isProgramPubliclyVisible({ ...program, publishStatus: "published", spotsAvailable: null }, end);
}

/** Only the latest, unambiguous automatic published -> archived transition qualifies. */
export function hasAutomaticCompletionAudit(audits: ArchiveAudit[], endDate: Date | string, now = new Date()): boolean {
  const [latest, previous] = audits;
  if (!latest || (previous && previous.createdAt.getTime() === latest.createdAt.getTime())) return false;
  const end = new Date(endDate);
  if (!Number.isFinite(end.getTime()) || !Number.isFinite(latest.createdAt.getTime())) return false;
  const archivedDay = Date.UTC(latest.createdAt.getUTCFullYear(), latest.createdAt.getUTCMonth(), latest.createdAt.getUTCDate());
  return latest.changedBy === "system:expired-program-archiver"
    && latest.oldValue === "published" && latest.newValue === "archived"
    && latest.reason === "AUTO_ARCHIVED: program endDate is in the past"
    && end.getTime() < archivedDay && latest.createdAt <= now;
}
