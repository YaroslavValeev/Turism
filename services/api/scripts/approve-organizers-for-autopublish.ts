import { prisma } from "../src/lib/prisma";

const confirmation = "approve-organizers-for-autopublish-v1";
const ids = [...new Set((process.env.ORGANIZER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
const apply = process.argv.includes("--apply") && process.env.APPROVAL_CONFIRM === confirmation;

async function main() {
  if (!ids.length) throw new Error("ORGANIZER_IDS must contain one or more comma-separated organizer IDs");
  const organizers = await prisma.organizer.findMany({
    where: { id: { in: ids } },
    select: { id: true, displayName: true, autoPublishApprovedAt: true },
    orderBy: { displayName: "asc" },
  });
  if (organizers.length !== ids.length) {
    const found = new Set(organizers.map((organizer) => organizer.id));
    throw new Error(`Unknown organizer IDs: ${ids.filter((id) => !found.has(id)).join(", ")}`);
  }
  console.log(JSON.stringify({ apply, organizers }, null, 2));
  if (!apply) {
    console.log(`Dry run only. To apply, run with APPROVAL_CONFIRM=${confirmation} and --apply.`);
    return;
  }

  const now = new Date();
  let approved = 0;
  for (const organizer of organizers) {
    const result = await prisma.organizer.updateMany({
      where: { id: organizer.id, autoPublishApprovedAt: null },
      data: { autoPublishApprovedAt: now, autoPublishApprovedBy: "owner:explicit-approved-organizer-list" },
    });
    if (result.count !== 1) continue;
    approved += 1;
    await prisma.auditLog.create({
      data: {
        entityType: "organizer",
        entityId: organizer.id,
        changedField: "autopublish_permanent_approval",
        oldValue: null,
        newValue: now.toISOString(),
        changedBy: "owner:explicit-approved-organizer-list",
        reason: "Owner confirmed this organizer for permanent auto-publish",
      },
    });
  }
  console.log(JSON.stringify({ ok: true, approved }, null, 2));
}

main()
  .catch((error) => {
    console.error("organizer auto-publish approval failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
