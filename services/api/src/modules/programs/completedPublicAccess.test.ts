import { describe, expect, it } from "vitest";
import { hasAutomaticCompletionAudit, isCompletedPublicCandidate, type ArchiveAudit } from "./completedPublicAccess";

const now = new Date("2026-10-25T10:00:00Z");
const program = { publishStatus: "archived", startDate: "2026-10-24T00:00:00Z", endDate: "2026-10-24T12:00:00Z", organizer: { verificationStatus: "verified" } };
const audit: ArchiveAudit = { oldValue: "published", newValue: "archived", changedBy: "system:expired-program-archiver", reason: "AUTO_ARCHIVED: program endDate is in the past", createdAt: new Date("2026-10-25T08:00:00Z") };

describe("completed public detail eligibility", () => {
  it("retains read access after publication and automatic completion, including sold-out trips", () => {
    expect(isCompletedPublicCandidate(program, now)).toBe(true);
    expect(isCompletedPublicCandidate({ ...program, publishStatus: "published", spotsAvailable: 0 }, now)).toBe(true);
  });
  it.each(["draft", "internal_review", "needs_fix", "approved", "paused"])("never treats %s as completed public content", status => {
    expect(isCompletedPublicCandidate({ ...program, publishStatus: status }, now)).toBe(false);
  });
  it("keeps on-request tours and the whole final UTC calendar day out of the archive contract", () => {
    expect(isCompletedPublicCandidate({ ...program, scheduleType: "on_request" }, now)).toBe(false);
    expect(isCompletedPublicCandidate(program, new Date("2026-10-24T23:59:59Z"))).toBe(false);
    expect(isCompletedPublicCandidate(program, new Date("2026-10-25T00:00:00Z"))).toBe(true);
  });
  it("rejects missing, invalid and reversed dates", () => {
    for (const patch of [{ endDate: null }, { startDate: null }, { startDate: "invalid" }, { endDate: "invalid" }, { startDate: "2026-10-25T00:00:00Z" }]) {
      expect(isCompletedPublicCandidate({ ...program, ...patch }, now)).toBe(false);
    }
  });
  it("retains organizer withdrawal and ingestion review gates", () => {
    for (const verificationStatus of ["paused", "rejected"]) expect(isCompletedPublicCandidate({ ...program, organizer: { verificationStatus } }, now)).toBe(false);
    for (const reviewStatus of ["auto_pending", "rejected", null]) expect(isCompletedPublicCandidate({ ...program, autoPublished: true, reviewStatus }, now)).toBe(false);
    expect(isCompletedPublicCandidate({ ...program, autoPublished: true, reviewStatus: "ok" }, now)).toBe(true);
  });
});

describe("automatic completion audit proof", () => {
  it("accepts the exact latest lifecycle transition", () => {
    expect(hasAutomaticCompletionAudit([audit], program.endDate, now)).toBe(true);
  });
  it("fails closed without evidence or for manual and merge archives", () => {
    expect(hasAutomaticCompletionAudit([], program.endDate, now)).toBe(false);
    for (const patch of [{ changedBy: "admin" }, { changedBy: null }, { oldValue: "draft" }, { newValue: "paused" }, { reason: "owner-confirmed merge" }]) {
      expect(hasAutomaticCompletionAudit([{ ...audit, ...patch }], program.endDate, now)).toBe(false);
    }
  });
  it("uses the latest transition and rejects ambiguous timestamps", () => {
    const manual = { ...audit, changedBy: "admin", createdAt: new Date("2026-10-25T09:00:00Z") };
    expect(hasAutomaticCompletionAudit([manual, audit], program.endDate, now)).toBe(false);
    expect(hasAutomaticCompletionAudit([audit, { ...audit, changedBy: "admin" }], program.endDate, now)).toBe(false);
  });
  it("rejects future, invalid or premature audit dates", () => {
    for (const createdAt of [new Date("2026-10-25T11:00:00Z"), new Date("2026-10-24T23:00:00Z"), new Date("invalid")]) {
      expect(hasAutomaticCompletionAudit([{ ...audit, createdAt }], program.endDate, now)).toBe(false);
    }
    expect(hasAutomaticCompletionAudit([audit], "invalid", now)).toBe(false);
  });
});
