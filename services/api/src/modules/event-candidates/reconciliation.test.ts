import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    eventCandidate: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    program: { findUnique: vi.fn(), updateMany: vi.fn() },
    publishedProgram: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { findFirst: vi.fn(), createMany: vi.fn() },
  };
  return { tx, transaction: vi.fn() };
});
vi.mock("../../lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
import { archiveProgramFromCancellationCandidate } from "./reconciliation";

const version = "2026-08-24T08:00:00.000Z";
const request = {
  candidateId: "cancel-1", targetProgramId: "program-1", actorId: "admin-1",
  reason: "Организатор подтвердил отмену", confirm: "archive",
  expectedCandidateUpdatedAt: version, expectedProgramUpdatedAt: version,
};
function cancellation(status = "needs_review") {
  return { id: "cancel-1", status, updatedAt: new Date(version), normalizedItem: { extractedJson: { explicitCancellationNotice: true },
    rawItem: { sourceId: "source-1" } } };
}
function program(publishStatus = "published") {
  return { id: "program-1", sourceId: "source-1", intakeSource: "ingestion_auto", autoPublished: true,
    publishStatus, updatedAt: new Date(version) };
}
function link(publishStatus = "published", candidateStatus = "published") {
  return { id: "link-1", candidateId: "original-1", programId: "program-1", publishStatus,
    candidate: { id: "original-1", status: candidateStatus } };
}

describe("archive confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx));
    mocks.tx.eventCandidate.findUnique.mockResolvedValue(cancellation());
    mocks.tx.program.findUnique.mockResolvedValue(program());
    mocks.tx.publishedProgram.findUnique.mockResolvedValue(link());
    mocks.tx.auditLog.findFirst.mockResolvedValue(null);
    mocks.tx.eventCandidate.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.program.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.publishedProgram.update.mockResolvedValue({});
    mocks.tx.eventCandidate.update.mockResolvedValue({});
    mocks.tx.auditLog.createMany.mockResolvedValue({ count: 5 });
  });

  it("archives the entire publication graph and writes one marker", async () => {
    const result = await archiveProgramFromCancellationCandidate(request);
    expect(result).toMatchObject({ ok: true, idempotent: false, targetCandidateId: "original-1", auditEntriesCreated: 5 });
    expect(mocks.tx.eventCandidate.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "cancel-1", updatedAt: new Date(version) }),
      data: expect.objectContaining({ status: "archived", reviewedBy: "admin-1" }),
    }));
    expect(mocks.tx.program.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { publishStatus: "archived" } }));
    expect(mocks.tx.eventCandidate.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "original-1" } }));
    expect(mocks.tx.auditLog.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ changedField: "archive_confirm_target_program", newValue: "program-1" }),
    ]) });
  });

  it("returns idempotent only when an existing marker graph remains archived", async () => {
    mocks.tx.eventCandidate.findUnique.mockResolvedValue(cancellation("archived"));
    mocks.tx.auditLog.findFirst.mockResolvedValue({ newValue: "program-1" });
    mocks.tx.program.findUnique.mockResolvedValue({ publishStatus: "archived" });
    mocks.tx.publishedProgram.findUnique.mockResolvedValue(link("archived", "archived"));
    const result = await archiveProgramFromCancellationCandidate(request);
    expect(result.idempotent).toBe(true);
    expect(mocks.tx.eventCandidate.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("detects state drift after a resolved program is republished", async () => {
    mocks.tx.eventCandidate.findUnique.mockResolvedValue(cancellation("archived"));
    mocks.tx.auditLog.findFirst.mockResolvedValue({ newValue: "program-1" });
    mocks.tx.program.findUnique.mockResolvedValue({ publishStatus: "published" });
    mocks.tx.publishedProgram.findUnique.mockResolvedValue(link("archived", "archived"));
    await expect(archiveProgramFromCancellationCandidate(request)).rejects.toMatchObject({ message: "archive_resolution_state_drift", statusCode: 409 });
  });

  it("rejects a different target after the resolution marker exists", async () => {
    mocks.tx.auditLog.findFirst.mockResolvedValue({ newValue: "program-other" });
    await expect(archiveProgramFromCancellationCandidate(request)).rejects.toMatchObject({ message: "already_resolved_to_other_program", statusCode: 409 });
  });

  it("rejects stale candidate and program versions", async () => {
    mocks.tx.eventCandidate.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(archiveProgramFromCancellationCandidate(request)).rejects.toMatchObject({ message: "stale_candidate" });
    mocks.tx.eventCandidate.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.tx.program.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(archiveProgramFromCancellationCandidate(request)).rejects.toMatchObject({ message: "stale_program" });
  });

  it("rejects non-explicit, unrelated, manual and unlinked targets", async () => {
    mocks.tx.eventCandidate.findUnique.mockResolvedValue({ ...cancellation(), normalizedItem: { extractedJson: {}, rawItem: { sourceId: "source-1" } } });
    await expect(archiveProgramFromCancellationCandidate(request)).rejects.toMatchObject({ message: "candidate_not_explicit_cancellation" });
    mocks.tx.eventCandidate.findUnique.mockResolvedValue(cancellation());
    mocks.tx.program.findUnique.mockResolvedValue({ ...program(), sourceId: "source-other" });
    await expect(archiveProgramFromCancellationCandidate(request)).rejects.toMatchObject({ message: "candidate_program_source_mismatch" });
    mocks.tx.program.findUnique.mockResolvedValue({ ...program(), intakeSource: "admin_manual", autoPublished: false });
    await expect(archiveProgramFromCancellationCandidate(request)).rejects.toMatchObject({ message: "target_not_ingestion_program" });
    mocks.tx.program.findUnique.mockResolvedValue(program());
    mocks.tx.publishedProgram.findUnique.mockResolvedValue(null);
    await expect(archiveProgramFromCancellationCandidate(request)).rejects.toMatchObject({ message: "target_publication_link_missing" });
  });
});
