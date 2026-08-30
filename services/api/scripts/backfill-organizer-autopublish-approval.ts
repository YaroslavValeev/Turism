import { prisma } from "../src/lib/prisma";

const confirmation = "organizer-autopublish-approval-v1";
const apply = process.argv.includes("--apply") && process.env.BACKFILL_CONFIRM === confirmation;
const approvedStatuses = ["verified", "trusted_by_platform"];

type Approval = { organizerId: string; approvedAt: Date; approvedBy: string };

async function collectApprovals(): Promise<Approval[]> {
  const [auditEntries, organizers] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entityType: "organizer", changedField: "verification_status", newValue: { in: approvedStatuses } },
      select: { entityId: true, createdAt: true, changedBy: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organizer.findMany({
      where: { verificationStatus: { in: approvedStatuses }, autoPublishApprovedAt: null },
      select: { id: true, createdAt: true },
    }),
  ]);
  const approvals = new Map<string, Approval>();
  for (const entry of auditEntries) {
    if (!approvals.has(entry.entityId)) {
      approvals.set(entry.entityId, {
        organizerId: entry.entityId,
        approvedAt: entry.createdAt,
        approvedBy: entry.changedBy ?? "system:historical-verification-audit",
      });
    }
  }
  for (const organizer of organizers) {
    if (!approvals.has(organizer.id)) {
      approvals.set(organizer.id, {
        organizerId: organizer.id,
        approvedAt: organizer.createdAt,
        approvedBy: "system:current-verification-backfill",
      });
    }
  }
  return [...approvals.values()].sort((left, right) => left.approvedAt.getTime() - right.approvedAt.getTime());
}

async function main() {
  const approvals = await collectApprovals();
  console.log(JSON.stringify({ apply, approvals }, null, 2));
  if (!apply) {
    console.log(`Dry run only. To apply, run: BACKFILL_CONFIRM=${confirmation} pnpm --filter api backfill:organizer-autopublish-approval -- --apply`);
    return;
  }

  let applied = 0;
  for (const approval of approvals) {
    const result = await prisma.organizer.updateMany({
      where: { id: approval.organizerId, autoPublishApprovedAt: null },
      data: { autoPublishApprovedAt: approval.approvedAt, autoPublishApprovedBy: approval.approvedBy },
    });
    if (result.count !== 1) continue;
    applied += 1;
    await prisma.auditLog.create({
      data: {
        entityType: "organizer",
        entityId: approval.organizerId,
        changedField: "autopublish_permanent_approval",
        oldValue: null,
        newValue: approval.approvedAt.toISOString(),
        changedBy: approval.approvedBy,
        reason: "Backfilled permanent auto-publish approval from organizer verification history",
      },
    });
  }
  console.log(JSON.stringify({ ok: true, applied }, null, 2));
}

main()
  .catch((error) => {
    console.error("organizer autopublish approval backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
