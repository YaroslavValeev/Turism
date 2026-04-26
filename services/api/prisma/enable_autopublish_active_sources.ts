/**
 * Снимает opt-out автопаблиша: `metaJson.autoPublish: false` → true для активных источников.
 * По умолчанию dry-run. Применение: DRY_RUN=0 pnpm --filter api exec tsx prisma/enable_autopublish_active_sources.ts
 */
import "../src/env/loadProcessEnv";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

function metaObject(meta: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) return meta as Record<string, unknown>;
  return {};
}

async function main() {
  const dry = process.env.DRY_RUN !== "0" && process.env.DRY_RUN !== "false";
  const sources = await prisma.source.findMany({ where: { isActive: true } });
  const toUpdate: { id: string; name: string; next: Prisma.InputJsonValue }[] = [];
  for (const s of sources) {
    const m = metaObject(s.metaJson);
    if (m.autoPublish === false) {
      const { autoPublish: _omit, ...rest } = m;
      toUpdate.push({
        id: s.id,
        name: s.name,
        next: { ...rest, autoPublish: true } as Prisma.InputJsonValue,
      });
    }
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "enable_autopublish_dry", dry, wouldUpdate: toUpdate.length, sources: toUpdate.map((t) => ({ id: t.id, name: t.name })) }, null, 2));
  if (dry || toUpdate.length === 0) return;
  for (const row of toUpdate) {
    await prisma.source.update({ where: { id: row.id }, data: { metaJson: row.next } });
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "enable_autopublish_applied", updated: toUpdate.length }, null, 2));
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
