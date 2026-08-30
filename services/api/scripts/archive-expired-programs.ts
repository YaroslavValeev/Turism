import { prisma } from "../src/lib/prisma";
import { archiveExpiredPublishedPrograms, findExpiredPublishedPrograms } from "../src/modules/programs/expiration";

const confirmation = "archive-expired-programs-v1";
const apply = process.argv.includes("--apply") && process.env.ARCHIVE_CONFIRM === confirmation;

async function main() {
  const now = new Date();
  const programs = await findExpiredPublishedPrograms(now);
  console.log(JSON.stringify({
    apply,
    cutoff: now.toISOString(),
    matched: programs.map((program) => ({ id: program.id, title: program.title, endDate: program.endDate.toISOString() })),
  }, null, 2));
  if (!apply) {
    console.log(`Dry run only. To apply, run: ARCHIVE_CONFIRM=${confirmation} pnpm --filter api archive:expired-programs -- --apply`);
    return;
  }
  console.log(JSON.stringify({ ok: true, ...(await archiveExpiredPublishedPrograms(now)) }, null, 2));
}

main()
  .catch((error) => {
    console.error("expired program archive failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
