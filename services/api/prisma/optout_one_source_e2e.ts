/**
 * E2E: metaJson.autoPublish: false на одном активном источнике (кейс «не паблишим с opt-out»).
 * pnpm --filter api exec tsx prisma/optout_one_source_e2e.ts
 */
import { Prisma } from "@prisma/client";
import "../src/env/loadProcessEnv";
import { prisma } from "../src/lib/prisma";

function metaObject(meta: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) return meta as Record<string, unknown>;
  return {};
}

async function main() {
  const byName = process.env.E2E_OPTOUT_SOURCE_NAME?.trim();
  const pick = await prisma.source.findFirst({
    where: { isActive: true, name: byName || undefined },
    orderBy: [{ priority: "desc" }, { id: "asc" }],
  });
  if (!pick) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "optout_e2e_no_source", byName: byName ?? null }, null, 2));
    return;
  }
  const m = metaObject(pick.metaJson);
  const next: Prisma.InputJsonValue = { ...m, autoPublish: false } as Prisma.InputJsonValue;
  const updated = await prisma.source.update({
    where: { id: pick.id },
    data: { metaJson: next },
    select: { id: true, name: true, type: true, metaJson: true },
  });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "optout_e2e_applied", source: updated }, null, 2));
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
