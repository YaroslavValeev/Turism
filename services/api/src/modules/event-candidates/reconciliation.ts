import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export class ReconciliationError extends Error {
  constructor(message: string, readonly statusCode: 400 | 404 | 409 = 400) { super(message); }
}

const MARKER_FIELD = "archive_confirm_target_program";
const ALLOWED_STATES = ["new", "needs_review", "approved"] as const;

function expectedDate(value: string, field: string): Date {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new ReconciliationError(`${field} must be an ISO-8601 timestamp`);
  return date;
}

function explicitCancellation(value: Prisma.JsonValue): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (value as Record<string, unknown>).explicitCancellationNotice === true;
}

export async function archiveProgramFromCancellationCandidate(input: {
  candidateId: string;
  targetProgramId: string;
  actorId: string | null;
  reason: string;
  confirm: string;
  expectedCandidateUpdatedAt: string;
  expectedProgramUpdatedAt: string;
}) {
  const reason = input.reason.trim();
  if (input.confirm !== "archive") throw new ReconciliationError("confirm must equal archive");
  if (!input.targetProgramId.trim()) throw new ReconciliationError("targetProgramId is required");
  if (reason.length < 10 || reason.length > 1000) throw new ReconciliationError("reason must contain 10 to 1000 characters");
  const candidateVersion = expectedDate(input.expectedCandidateUpdatedAt, "expectedCandidateUpdatedAt");
  const programVersion = expectedDate(input.expectedProgramUpdatedAt, "expectedProgramUpdatedAt");

  return prisma.$transaction(async (tx) => {
    const candidate = await tx.eventCandidate.findUnique({
      where: { id: input.candidateId },
      include: { normalizedItem: { include: { rawItem: { select: { sourceId: true } } } } },
    });
    if (!candidate) throw new ReconciliationError("candidate_not_found", 404);
    if (!explicitCancellation(candidate.normalizedItem.extractedJson)) {
      throw new ReconciliationError("candidate_not_explicit_cancellation", 409);
    }

    const marker = await tx.auditLog.findFirst({
      where: { entityType: "event_candidate", entityId: candidate.id, changedField: MARKER_FIELD },
      orderBy: { createdAt: "asc" },
    });
    if (marker) {
      if (marker.newValue !== input.targetProgramId) throw new ReconciliationError("already_resolved_to_other_program", 409);
      const [program, link] = await Promise.all([
        tx.program.findUnique({ where: { id: input.targetProgramId }, select: { publishStatus: true } }),
        tx.publishedProgram.findUnique({ where: { programId: input.targetProgramId }, include: { candidate: { select: { status: true } } } }),
      ]);
      if (!program || !link || program.publishStatus !== "archived" || link.publishStatus !== "archived" ||
          link.candidate.status !== "archived" || candidate.status !== "archived") {
        throw new ReconciliationError("archive_resolution_state_drift", 409);
      }
      return { ok: true, idempotent: true, cancellationCandidateId: candidate.id, targetProgramId: input.targetProgramId,
        targetPublishedProgramId: link.id, targetCandidateId: link.candidateId };
    }

    if (!(ALLOWED_STATES as readonly string[]).includes(candidate.status)) throw new ReconciliationError("candidate_state_conflict", 409);
    const program = await tx.program.findUnique({
      where: { id: input.targetProgramId },
      select: { id: true, sourceId: true, intakeSource: true, autoPublished: true, publishStatus: true, updatedAt: true },
    });
    if (!program) throw new ReconciliationError("target_program_not_found", 404);
    if (program.intakeSource !== "ingestion_auto" && !program.autoPublished) throw new ReconciliationError("target_not_ingestion_program", 409);
    if (!program.sourceId || program.sourceId !== candidate.normalizedItem.rawItem.sourceId) throw new ReconciliationError("candidate_program_source_mismatch", 409);
    if (program.publishStatus === "archived") throw new ReconciliationError("target_already_archived_without_resolution", 409);
    const link = await tx.publishedProgram.findUnique({
      where: { programId: program.id }, include: { candidate: { select: { id: true, status: true } } },
    });
    if (!link) throw new ReconciliationError("target_publication_link_missing", 409);

    const claimed = await tx.eventCandidate.updateMany({
      where: { id: candidate.id, updatedAt: candidateVersion, status: { in: [...ALLOWED_STATES] } },
      data: { status: "archived", reviewedBy: input.actorId, reviewedAt: new Date(), decisionNotes: reason },
    });
    if (claimed.count !== 1) throw new ReconciliationError("stale_candidate", 409);
    const archived = await tx.program.updateMany({
      where: { id: program.id, updatedAt: programVersion, publishStatus: program.publishStatus }, data: { publishStatus: "archived" },
    });
    if (archived.count !== 1) throw new ReconciliationError("stale_program", 409);
    await tx.publishedProgram.update({ where: { programId: program.id }, data: { publishStatus: "archived", editorNotes: reason } });
    if (link.candidate.status !== "archived") {
      await tx.eventCandidate.update({ where: { id: link.candidate.id }, data: { status: "archived", reviewedBy: input.actorId, reviewedAt: new Date(), decisionNotes: reason } });
    }

    const data: Prisma.AuditLogCreateManyInput[] = [
      { entityType: "event_candidate", entityId: candidate.id, changedField: MARKER_FIELD, oldValue: null, newValue: program.id, changedBy: input.actorId, reason },
      { entityType: "event_candidate", entityId: candidate.id, changedField: "cancellation_reconciled", oldValue: candidate.status, newValue: "archived", changedBy: input.actorId, reason },
      { entityType: "program", entityId: program.id, changedField: "publish_status_change", oldValue: program.publishStatus, newValue: "archived", changedBy: input.actorId, reason },
      { entityType: "published_program", entityId: link.id, changedField: "publish_status_change", oldValue: link.publishStatus, newValue: "archived", changedBy: input.actorId, reason },
    ];
    if (link.candidate.status !== "archived") data.push({ entityType: "event_candidate", entityId: link.candidate.id,
      changedField: "publish_status_change", oldValue: link.candidate.status, newValue: "archived", changedBy: input.actorId, reason });
    await tx.auditLog.createMany({ data });
    return { ok: true, idempotent: false, cancellationCandidateId: candidate.id, targetProgramId: program.id,
      targetPublishedProgramId: link.id, targetCandidateId: link.candidate.id,
      statuses: { cancellationCandidate: "archived", program: "archived", publishedProgram: "archived", targetCandidate: "archived" },
      auditEntriesCreated: data.length };
  });
}
