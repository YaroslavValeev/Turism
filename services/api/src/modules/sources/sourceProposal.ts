import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { detectSourceType, normalizeSourceUrlOrHandle } from "./sourceRegistry";

const PROPOSAL_TYPES = new Set(["instagram", "telegram", "rss", "site"]);
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

export function normalizeProposedSourceUrl(value: unknown): { normalizedUrl: string; detectedType: string } {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("source_url_required");
  }
  const candidate = value.trim();
  const detectedType = detectSourceType(candidate);
  if (!PROPOSAL_TYPES.has(detectedType)) {
    throw new Error("unsupported_source_url");
  }
  const normalizedUrl = normalizeSourceUrlOrHandle(detectedType, candidate);
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new Error("invalid_source_url");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error("invalid_source_url");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || /^127\.|^0\.0\.0\.0$|^::1$/.test(hostname)) {
    throw new Error("unsafe_source_url");
  }
  return { normalizedUrl, detectedType };
}

export async function submitSourceProposal(input: SourceProposalInput) {
  const { normalizedUrl, detectedType } = normalizeProposedSourceUrl(input.url);
  const existingSource = await prisma.source.findFirst({
    where: { type: detectedType, urlOrHandle: normalizedUrl },
    select: { id: true },
  });
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
