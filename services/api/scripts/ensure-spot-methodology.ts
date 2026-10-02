import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  buildSpotMethodologyId,
  computeDefinitionSha256,
  parseSpotMethodologyDefinition,
  planSpotMethodologyAction,
} from "../src/modules/spots/methodologyRegistry";

export const DEFAULT_METHODOLOGY_FILE = path.resolve(
  __dirname,
  "../prisma/data/spot-methodology/wakesurf-v1.1.json",
);

function resolveFileArg(argv: string[]): string {
  const arg = argv.find((item) => item.startsWith("--file="));
  return arg ? path.resolve(arg.slice("--file=".length)) : DEFAULT_METHODOLOGY_FILE;
}

async function ensureSpotMethodology(
  client: PrismaClient,
  file: string,
  dryRun: boolean,
): Promise<Record<string, unknown>> {
  const definition = parseSpotMethodologyDefinition(JSON.parse(readFileSync(file, "utf8")));
  const id = buildSpotMethodologyId(definition.discipline, definition.methodologyVersion);
  const definitionSha256 = computeDefinitionSha256(definition);

  return client.$transaction(async (tx) => {
    const row = await tx.spotMethodology.findUnique({
      where: { id },
      select: { status: true, definitionSha256: true, _count: { select: { assessments: true } } },
    });
    const existing = row
      ? { status: row.status, definitionSha256: row.definitionSha256, pinnedAudits: row._count.assessments }
      : null;
    const plan = planSpotMethodologyAction(existing, definitionSha256);
    const summary = { id, file: path.basename(file), definitionSha256, dryRun, plan };

    if (plan.action === "error") throw new Error(`${id}: ${plan.message}`);
    if (plan.action === "blocked_pinned_audits") return { ok: false, ...summary, error: `${id}: ${plan.message}` };
    if (dryRun || plan.action === "noop") return { ok: true, ...summary };

    const versions = {
      discipline: definition.discipline,
      methodologyVersion: definition.methodologyVersion,
      protocolVersion: definition.protocolVersion,
      criteriaVersion: definition.criteriaVersion,
      ratingVersion: definition.ratingVersion,
    };
    const json = definition as unknown as Prisma.InputJsonValue;

    if (plan.action === "create") {
      await tx.spotMethodology.create({
        data: { id, ...versions, status: "draft", definition: json, definitionSha256 },
      });
    } else {
      // status: "draft" в where защищает от гонки с одновременным approve.
      const updated = await tx.spotMethodology.updateMany({
        where: { id, status: "draft", definitionSha256: plan.previousSha256 },
        data: { ...versions, definition: json, definitionSha256 },
      });
      if (updated.count !== 1) throw new Error(`${id}: draft row changed concurrently, re-run the script`);
    }
    return { ok: true, ...summary };
  });
}

async function main(): Promise<void> {
  const result = await ensureSpotMethodology(
    prisma,
    resolveFileArg(process.argv),
    process.argv.includes("--dry-run"),
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.ok !== true) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "unknown error" }));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
