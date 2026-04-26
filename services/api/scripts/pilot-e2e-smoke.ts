/**
 * Смоук: API должен быть запущен (например pnpm --filter api dev).
 * Запуск: pnpm --filter api exec tsx scripts/pilot-e2e-smoke.ts
 *
 * Проверяет: GET /health, первая опубликованная программа, POST /bookings 201, дубликат 409.
 */
import { PrismaClient } from "@prisma/client";

const base = process.env.SMOKE_API_BASE ?? "http://127.0.0.1:3001";

async function main() {
  const prisma = new PrismaClient();
  const h = await fetch(`${base}/health`);
  if (!h.ok) throw new Error(`health ${h.status}`);
  const hj = (await h.json()) as { status?: string };
  if (hj.status !== "ok") throw new Error(`health body: ${JSON.stringify(hj)}`);
  console.log("OK /health");

  const program = await prisma.program.findFirst({
    where: { publishStatus: "published" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!program) {
    await prisma.$disconnect();
    throw new Error("No published program — run SEED_DEMO_CATALOG=1 pnpm --filter api db:seed");
  }
  const body = {
    programId: program.id,
    guestContact: "smoke-e2e+local@mywave.test",
    sourceChannel: "e2e_smoke",
    legalConsent: true,
  };
  const b1 = await fetch(`${base}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (b1.status !== 201) {
    const t = await b1.text();
    await prisma.$disconnect();
    throw new Error(`bookings first POST ${b1.status}: ${t.slice(0, 500)}`);
  }
  console.log("OK POST /bookings 201");

  const b2 = await fetch(`${base}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (b2.status !== 409) {
    const t = await b2.text();
    await prisma.$disconnect();
    throw new Error(`expected 409 duplicate, got ${b2.status}: ${t.slice(0, 500)}`);
  }
  console.log("OK POST /bookings duplicate 409");
  await prisma.$disconnect();
  console.log("pilot-e2e-smoke: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
