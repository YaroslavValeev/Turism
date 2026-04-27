/**
 * Смоук: API должен быть запущен (например pnpm --filter api dev).
 * Запуск: pnpm --filter api smoke:pilot-e2e
 *
 * Проверяет: GET /health; POST /bookings без legalConsent → 400;
 * legalConsent: false → 400; legalConsent: true → 201; дубликат → 409.
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

  const noConsentBody = {
    programId: program.id,
    guestContact: "smoke-no-consent@mywave.test",
    sourceChannel: "e2e_smoke",
  };
  const r400omit = await fetch(`${base}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(noConsentBody),
  });
  if (r400omit.status !== 400) {
    const t = await r400omit.text();
    await prisma.$disconnect();
    throw new Error(`expected 400 without legalConsent, got ${r400omit.status}: ${t.slice(0, 500)}`);
  }
  const j400omit = (await r400omit.json().catch(() => ({}))) as { error?: string };
  if (j400omit.error !== "legal_consent_required") {
    await prisma.$disconnect();
    throw new Error(`expected error legal_consent_required, got ${JSON.stringify(j400omit)}`);
  }
  console.log("OK POST /bookings 400 (omit legalConsent)");

  const r400false = await fetch(`${base}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...noConsentBody, legalConsent: false }),
  });
  if (r400false.status !== 400) {
    const t = await r400false.text();
    await prisma.$disconnect();
    throw new Error(`expected 400 legalConsent false, got ${r400false.status}: ${t.slice(0, 500)}`);
  }
  console.log("OK POST /bookings 400 (legalConsent false)");

  const guestContact = `smoke-e2e+${Date.now()}@mywave.test`;
  const body = {
    programId: program.id,
    guestContact,
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
  const created = (await b1.json()) as { legalConsentAt?: string | null; legalConsentPolicyVersion?: string | null };
  if (!created.legalConsentAt) {
    await prisma.$disconnect();
    throw new Error("expected legalConsentAt on created booking");
  }
  console.log("OK POST /bookings 201 (legalConsent true, legalConsentAt set)");

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
