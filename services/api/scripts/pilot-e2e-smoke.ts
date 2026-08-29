/**
 * Смоук: API должен быть запущен (например pnpm --filter api dev).
 * Запуск: pnpm --filter api smoke:pilot-e2e
 *
 * Проверяет: GET /health; POST /bookings без legalConsent → 400;
 * legalConsent: false → 400; legalConsent: true → 201; дубликат → 409.
 */
const base = process.env.SMOKE_API_BASE ?? "http://127.0.0.1:3001";

type PublicProgram = { id?: string; publishStatus?: string | null };

async function main() {
  const h = await fetch(`${base}/health`);
  if (!h.ok) throw new Error(`health ${h.status}`);
  const hj = (await h.json()) as { status?: string };
  if (hj.status !== "ok") throw new Error(`health body: ${JSON.stringify(hj)}`);
  console.log("OK /health");

  // Select through the public catalog, not directly from Prisma. A program may
  // still be marked published in the database while being unavailable for a
  // public booking (for example, an archived or stale PublishedProgram row).
  const catalogResponse = await fetch(`${base}/programs`);
  if (!catalogResponse.ok) {
    throw new Error(`public catalog ${catalogResponse.status}`);
  }
  const catalog = (await catalogResponse.json()) as PublicProgram[];
  const program = catalog.find((item) => typeof item.id === "string" && item.id.length > 0);
  if (!program?.id) {
    throw new Error("No publicly available program for booking smoke");
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
    throw new Error(`expected 400 without legalConsent, got ${r400omit.status}: ${t.slice(0, 500)}`);
  }
  const j400omit = (await r400omit.json().catch(() => ({}))) as { error?: string };
  if (j400omit.error !== "legal_consent_required") {
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
    throw new Error(`bookings first POST ${b1.status}: ${t.slice(0, 500)}`);
  }
  const created = (await b1.json()) as { legalConsentAt?: string | null; legalConsentPolicyVersion?: string | null };
  if (!created.legalConsentAt) {
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
    throw new Error(`expected 409 duplicate, got ${b2.status}: ${t.slice(0, 500)}`);
  }
  console.log("OK POST /bookings duplicate 409");
  console.log("pilot-e2e-smoke: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
