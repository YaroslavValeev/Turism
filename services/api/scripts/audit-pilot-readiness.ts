import { prisma } from "../src/lib/prisma";
import {
  collectPilotReadinessAudit,
  pilotReadinessFailsStrict,
  strictPilotReadinessEnabled,
} from "../src/lib/pilotReadinessAudit";

async function main() {
  const audit = await collectPilotReadinessAudit();
  const strict = strictPilotReadinessEnabled();

  console.log(JSON.stringify({ ok: true, strict, audit }, null, 2));

  if (strict && pilotReadinessFailsStrict(audit)) {
    const failed = audit.checks
      .filter((check) => !check.pass)
      .map((check) => `${check.key}: actual ${check.actual}, expected ${check.expected}`)
      .join("; ");
    console.error(`pilot readiness audit failed: ${failed}`);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error("pilot readiness audit failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
