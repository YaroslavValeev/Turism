import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { normalizeSourceUrlOrHandle } from "./sourceRegistry";
import { normalizeProposedSourceUrl } from "./proposalUrl";

export { normalizeProposedSourceUrl };

const MAX_NAME_LENGTH = 200;
const MAX_NOTES_LENGTH = 2_000;

export type SourceProposalInput = {
  url: unknown;
  displayName?: unknown;
  organizerName?: unknown;
  notes?: unknown;
  submittedVia: "admin" | "telegram";
  submittedBy?: string | null;
};

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

export function sourceUrlMatchesProposal(
  type: string,
  sourceUrlOrHandle: string,
  normalizedProposalUrl: string,
): boolean {
  return normalizeSourceUrlOrHandle(type, sourceUrlOrHandle) === normalizedProposalUrl;
}

export async function submitSourceProposal(input: SourceProposalInput) {
  const { normalizedUrl, detectedType } = normalizeProposedSourceUrl(input.url);
  const existingSources = await prisma.source.findMany({
    where: { type: detectedType },
    select: { id: true, urlOrHandle: true },
  });
  const existingSource = existingSources.find((source) =>
    sourceUrlMatchesProposal(detectedType, source.urlOrHandle, normalizedUrl),
  );
  if (existingSource) return { kind: "existing_source" as const, sourceId: existingSource.id, normalizedUrl };

  const pending = await prisma.sourceProposal.findFirst({
    where: { normalizedUrl, status: "pending" },
  });
  if (pending) return { kind: "duplicate" as const, proposal: pending };

  const proposal = await prisma.sourceProposal.create({
    data: {
      normalizedUrl,
      detectedType,
      displayName: optionalText(input.displayName, MAX_NAME_LENGTH),
      organizerName: optionalText(input.organizerName, MAX_NAME_LENGTH),
      notes: optionalText(input.notes, MAX_NOTES_LENGTH),
      submittedVia: input.submittedVia,
      submittedBy: input.submittedBy ?? null,
    },
  });
  await writeAuditLog({
    entityType: "source_proposal",
    entityId: proposal.id,
    changedField: "created",
    oldValue: null,
    newValue: proposal.normalizedUrl,
    changedBy: input.submittedBy ?? null,
    reason: `source proposal via ${input.submittedVia}`,
  });
  return { kind: "created" as const, proposal };
}

export async function rejectSourceProposal(id: string, changedBy: string | null, reason?: unknown) {
  const existing = await prisma.sourceProposal.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.status !== "pending") throw new Error("proposal_not_pending");
  const proposal = await prisma.sourceProposal.update({
    where: { id },
    data: { status: "rejected", rejectionReason: optionalText(reason, MAX_NOTES_LENGTH) },
  });
  await writeAuditLog({
    entityType: "source_proposal",
    entityId: proposal.id,
    changedField: "rejected",
    oldValue: "pending",
    newValue: proposal.rejectionReason,
    changedBy,
    reason: "source proposal rejected",
  });
  return proposal;
}

/**
 * Converts one reviewed proposal into a deliberately inactive source.
 * Collection, organizer linkage, and any publication remain separate operator actions.
 */
export async function approveSourceProposal(id: string, changedBy: string | null) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.sourceProposal.findUnique({ where: { id } });
    if (!proposal) return null;
    if (proposal.status !== "pending") throw new Error("proposal_not_pending");

    const sameTypeSources = await tx.source.findMany({
      where: { type: proposal.detectedType },
      select: { id: true, urlOrHandle: true },
    });
    const existingSource = sameTypeSources.find((source) =>
      sourceUrlMatchesProposal(proposal.detectedType, source.urlOrHandle, proposal.normalizedUrl),
    );
    if (existingSource) return { kind: "existing_source" as const, sourceId: existingSource.id };

    // Claim the pending proposal in this transaction before creating the source,
    // so a second operator cannot approve the same proposal concurrently.
    const claim = await tx.sourceProposal.updateMany({
      where: { id: proposal.id, status: "pending" },
      data: { status: "approved", rejectionReason: null },
    });
    if (claim.count !== 1) throw new Error("proposal_not_pending");

    const source = await tx.source.create({
      data: {
        type: proposal.detectedType,
        name: proposal.displayName || proposal.normalizedUrl,
        urlOrHandle: proposal.normalizedUrl,
        priority: 100,
        trustScore: 0.5,
        fetchIntervalMinutes: 1440,
        isActive: false,
        metaJson: {
          autoPublish: false,
          sourceOrigin: "source_proposal",
          lifecycleState: "inactive",
          sourceProposalId: proposal.id,
          proposedOrganizerName: proposal.organizerName,
          submittedVia: proposal.submittedVia,
        },
      },
    });
    const approved = await tx.sourceProposal.findUniqueOrThrow({
      where: { id: proposal.id },
    });
    await tx.auditLog.createMany({
      data: [
        {
          entityType: "source_proposal",
          entityId: proposal.id,
          changedField: "approved_as_inactive_source",
          oldValue: "pending",
          newValue: source.id,
          changedBy,
          reason: "source proposal approved; source remains inactive",
        },
        {
          entityType: "source",
          entityId: source.id,
          changedField: "created_from_source_proposal",
          oldValue: null,
          newValue: proposal.id,
          changedBy,
          reason: "created inactive from approved source proposal",
        },
      ],
    });
    return { kind: "approved" as const, proposal: approved, source };
  });
}
