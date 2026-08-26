import { prisma } from "../src/lib/prisma";
import { collectTraceAudit, strictEnabled, traceAuditFailsStrict } from "../src/modules/ingestion/traceAudit";

async function main() {
  const audit = await collectTraceAudit();
  console.log(JSON.stringify({ ok: true, strict: strictEnabled(), audit }, null, 2));

  if (strictEnabled() && traceAuditFailsStrict(audit)) {
    console.error(
      `ingestion trace audit failed: ${audit.publishedProgramsWithoutFullTrace} published programs lack SourceRun -> RawItem trace`,
    );
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error("ingestion trace audit failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
