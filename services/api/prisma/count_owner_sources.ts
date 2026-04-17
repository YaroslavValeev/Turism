/**
 * Сводка по owner-batch: raw_items и event_candidates на источник.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../src/lib/prisma";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const jsonPath = path.join(__dirname, "source_imports_owner_2026-04-16.json");
  const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Array<{ type: string; urlOrHandle: string; name: string }>;
  const out: unknown[] = [];
  for (const row of payload) {
    const s = await prisma.source.findFirst({
      where: { type: row.type, urlOrHandle: row.urlOrHandle.trim() },
      select: { id: true, name: true, type: true, urlOrHandle: true },
    });
    if (!s) {
      out.push({ name: row.name, error: "not_found" });
      continue;
    }
    const [rawCount, candCount, lastRun] = await Promise.all([
      prisma.rawItem.count({ where: { sourceId: s.id } }),
      prisma.eventCandidate.count({
        where: { normalizedItem: { rawItem: { sourceId: s.id } } },
      }),
      prisma.sourceRun.findFirst({
        where: { sourceId: s.id },
        orderBy: { startedAt: "desc" },
        select: { status: true, itemsFound: true, itemsCreated: true, startedAt: true, finishedAt: true },
      }),
    ]);
    out.push({ ...s, rawItems: rawCount, eventCandidates: candCount, lastRun });
  }
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
