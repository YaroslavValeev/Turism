import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const LEGACY_NOTE = "AUTO_ARCHIVED: explicit_cancellation_notice";

async function main() {
  const candidates = await prisma.eventCandidate.findMany({
    where: {
      status: "archived",
      decisionNotes: LEGACY_NOTE,
      reviewedAt: null,
      publishedProgram: null,
      normalizedItem: { extractedJson: { path: ["explicitCancellationNotice"], equals: true } },
    },
    select: { id: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", matched: candidates.length }));
  if (!apply || candidates.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const candidate of candidates) {
      const result = await tx.eventCandidate.updateMany({
        where: { id: candidate.id, status: "archived", updatedAt: candidate.updatedAt, reviewedAt: null },
        data: { status: "needs_review", reviewPriority: 100, decisionNotes: "CRITICAL_REVIEW: explicit_cancellation_notice" },
      });
      if (result.count !== 1) throw new Error(`Concurrent change detected for candidate ${candidate.id}`);
    }
    await tx.auditLog.createMany({
      data: candidates.map((candidate) => ({
        entityType: "event_candidate",
        entityId: candidate.id,
        changedField: "legacy_cancellation_requeued",
        oldValue: "archived",
        newValue: "needs_review",
        changedBy: "system:migration-script",
        reason: "Requeue legacy explicit cancellation for operator confirmation",
      })),
    });
  });
  console.log(JSON.stringify({ mode: "apply", requeued: candidates.length }));
}

main().finally(async () => prisma.$disconnect());
