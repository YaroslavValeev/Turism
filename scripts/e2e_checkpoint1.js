/**
 * E2E + verification flow for Sprint 2 Checkpoint 1.
 * Run: node scripts/e2e_checkpoint1.js (API must be running on BASE_URL).
 * Output: Proof of execution for SPRINT2_CHECKPOINT_1_REPORT.md §7.
 */
const BASE_URL = process.env.BASE_URL || process.env.API_URL || "http://localhost:3001";

async function main() {
  // Preflight: /health — environment blocker if API unreachable
  let healthRes;
  try {
    healthRes = await fetch(`${BASE_URL}/health`, { method: "GET" });
  } catch (err) {
    console.error("Environment blocker: API not reachable at " + BASE_URL);
    console.error("Cause: " + (err.cause?.code || err.message));
    console.error("Start API with: pnpm dev:api  (and ensure: pnpm db:migrate, pnpm db:seed)");
    process.exit(1);
  }
  if (!healthRes.ok) {
    console.error("Environment blocker: GET /health returned " + healthRes.status + " (expected 200)");
    console.error("Ensure API is running and healthy at " + BASE_URL);
    process.exit(1);
  }

  const proof = {
    organizerId: null,
    organizerName: null,
    programId: null,
    programTitle: null,
    publishStatusBefore: "draft",
    publishStatusAfter: "published",
    bookingId: null,
    bookingStatusProgression: [],
    evidenceUsed: [],
    viaApi: [],
    viaUi: [],
    manualOps: [],
  };

  let token;

  // 1. Login
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@mywave.local", password: "admin123" }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
  const loginData = await loginRes.json();
  token = loginData.token;
  proof.viaApi.push("POST /auth/login");

  // 2. Create organizer
  const orgRes = await fetch(`${BASE_URL}/organizers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayName: "E2E Pilot Org", contactEmail: "e2e@pilottest.local", verificationStatus: "listed" }),
  });
  if (!orgRes.ok) throw new Error(`Create organizer failed: ${orgRes.status} ${await orgRes.text()}`);
  const org = await orgRes.json();
  proof.organizerId = org.id;
  proof.organizerName = org.displayName;
  proof.viaApi.push("POST /organizers");

  // 3. Create program (draft) with all publish-gate fields
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() + 2);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);
  const programBody = {
    organizerId: org.id,
    title: "E2E Pilot Program",
    discipline: "Wakesurf",
    region: "Krasnodar",
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    durationDays: 7,
    publishStatus: "draft",
    levelRequired: "средний",
    riskLevel: "низкий",
    gearRequirements: "лыжи, палки",
    medicalLimitations: "",
    cancellationRules: "за 14 дней",
    itineraryDayByDay: "День 1-7: катание и теория",
  };
  const progRes = await fetch(`${BASE_URL}/programs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(programBody),
  });
  if (!progRes.ok) throw new Error(`Create program failed: ${progRes.status} ${await progRes.text()}`);
  const prog = await progRes.json();
  proof.programId = prog.id;
  proof.programTitle = prog.title;
  proof.viaApi.push("POST /programs");

  // 4. Add media
  const mediaRes = await fetch(`${BASE_URL}/programs/${prog.id}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mediaType: "image", url: "https://example.com/pilot.jpg", caption: "E2E" }),
  });
  if (!mediaRes.ok) throw new Error(`Add media failed: ${mediaRes.status} ${await mediaRes.text()}`);
  proof.viaApi.push("POST /programs/:id/media");

  // 5. Publish
  const pubRes = await fetch(`${BASE_URL}/programs/${prog.id}/publish-status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ publishStatus: "published" }),
  });
  if (!pubRes.ok) throw new Error(`Publish failed: ${pubRes.status} ${await pubRes.text()}`);
  proof.viaApi.push("PATCH /programs/:id/publish-status");

  // 6. Create booking (public)
  const bookRes = await fetch(`${BASE_URL}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      programId: prog.id,
      guestContact: "E2E Guest +79991234567",
      legalConsent: true,
    }),
  });
  if (!bookRes.ok) throw new Error(`Create booking failed: ${bookRes.status} ${await bookRes.text()}`);
  const book = await bookRes.json();
  proof.bookingId = book.id;
  proof.bookingStatusProgression.push(book.bookingStatus || "new");
  proof.viaApi.push("POST /bookings (no auth)");

  // 7. Booking status: new -> reviewed -> sent_to_organizer -> contacted -> offer_sent -> booked -> paid_off_platform -> completed
  const statusChain = ["reviewed", "sent_to_organizer", "contacted", "offer_sent", "booked", "paid_off_platform", "completed"];
  for (const status of statusChain) {
    const patchRes = await fetch(`${BASE_URL}/bookings/${book.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bookingStatus: status }),
    });
    if (!patchRes.ok) throw new Error(`PATCH booking status ${status} failed: ${patchRes.status} ${await patchRes.text()}`);
    proof.bookingStatusProgression.push(status);
  }
  proof.viaApi.push("PATCH /bookings/:id/status x7");

  // 8. Verification: add evidence, then listed -> checked
  const evRes = await fetch(`${BASE_URL}/organizers/${org.id}/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ evidenceType: "document", evidenceUrl: "https://example.com/inn.pdf", notes: "E2E proof" }),
  });
  if (!evRes.ok) throw new Error(`Add evidence failed: ${evRes.status} ${await evRes.text()}`);
  const evData = await evRes.json();
  proof.evidenceUsed.push({ type: "document", id: evData.id });
  proof.viaApi.push("POST /organizers/:id/evidence");

  const verRes = await fetch(`${BASE_URL}/organizers/${org.id}/verification-status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ verificationStatus: "checked" }),
  });
  if (!verRes.ok) throw new Error(`PATCH verification-status failed: ${verRes.status} ${await verRes.text()}`);
  proof.viaApi.push("PATCH /organizers/:id/verification-status -> checked");

  proof.viaUi.push("— (всё через API в этом прогоне)");
  proof.manualOps.push("Запуск скрипта node scripts/e2e_checkpoint1.js при поднятом API.");

  return proof;
}

main()
  .then((proof) => {
    console.log("--- Proof of execution (вставить в SPRINT2_CHECKPOINT_1_REPORT.md §7) ---");
    console.log(JSON.stringify(proof, null, 2));
    console.log("--- E2E + verification flow OK ---");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
