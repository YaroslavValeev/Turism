import { prisma } from "../src/lib/prisma";
import { runSourceLocationRemediation } from "../src/modules/ingestion/service";

const confirmation = "remediate-locations-v1";
const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const sourceName = sourceArg ? sourceArg.slice("--source=".length) : "";
const apply = process.argv.includes("--apply") && process.env.LOCATION_CONFIRM === confirmation;

async function main() {
  if (!sourceName) {
    throw new Error('Usage: tsx scripts/remediate-source-locations.ts --source="Анонсы эндуро" [--apply]');
  }
  const result = await runSourceLocationRemediation({ sourceName, apply, actorId: "script:remediate-source-locations" });
  for (const change of result.changes) {
    const fmt = (l: { region: string | null; city: string | null }) => `${l.region ?? "—"} / ${l.city ?? "—"}`;
    console.log(`• ${(change.title ?? "").slice(0, 70)}\n    ${fmt(change.from)}  →  ${fmt(change.to)}\n    текст: ${change.textStart ?? ""}`);
  }
  console.log(`\nscanned=${result.scanned} changes=${result.changes.length} apply=${result.apply}`);
  if (!apply) {
    console.log(`Dry run. To apply: LOCATION_CONFIRM=${confirmation} npx tsx scripts/remediate-source-locations.ts --source="${sourceName}" --apply`);
  }
}

main()
  .catch((error) => {
    console.error("location remediation failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
