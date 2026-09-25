/**
 * Аудит очереди публикации Program (будущие, не published).
 * Запуск: pnpm --filter api exec tsx scripts/list-publish-queue.ts
 * На VPS: docker compose … exec -T api sh -c 'cd /app/services/api && pnpm exec tsx scripts/list-publish-queue.ts'
 */
import { PrismaClient } from "@prisma/client";
import { canPublish, programIncludeForPublishGate } from "../src/modules/programs/publishGate";

const QUEUE = ["draft", "internal_review", "needs_fix", "approved"] as const;

async function main() {
  const prisma = new PrismaClient();
  const now = new Date();
  try {
    const rows = await prisma.program.findMany({
      where: {
        publishStatus: { in: [...QUEUE] },
        endDate: { gte: now },
      },
      orderBy: [{ startDate: "asc" }, { updatedAt: "desc" }],
      take: 50,
      include: programIncludeForPublishGate,
    });

    const ready: string[] = [];
    const blocked: string[] = [];

    console.log(`now=${now.toISOString()} future_non_published=${rows.length}`);
    console.log("---");

    for (const p of rows) {
      const gate = canPublish(p);
      const images = p.media.filter((m) => m.mediaType === "image").length;
      const line = [
        p.id,
        p.publishStatus,
        `start=${p.startDate.toISOString().slice(0, 10)}`,
        `images=${images}`,
        `gate=${gate.ok ? "OK" : "FAIL"}`,
        gate.ok ? "" : `missing=${gate.missing.join("|")}`,
        JSON.stringify(p.title),
      ]
        .filter(Boolean)
        .join("\t");
      console.log(line);
      if (gate.ok && images > 0) ready.push(p.id);
      else blocked.push(p.id);
    }

    console.log("---");
    console.log(`ready_for_publish_with_image=${ready.length}`);
    console.log(`blocked_or_no_image=${blocked.length}`);
    if (ready.length) {
      console.log("ready_ids:");
      for (const id of ready) console.log(id);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
