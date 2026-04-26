import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.program.count();
  const published = await prisma.program.count({ where: { publishStatus: "published" } });
  const e2ePub = await prisma.program.count({
    where: { publishStatus: "published", title: { contains: "E2E", mode: "insensitive" } },
  });
  console.log(JSON.stringify({ ok: true, programsTotal: total, published, publishedE2ETitles: e2ePub }, null, 2));
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
