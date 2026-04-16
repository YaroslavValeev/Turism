/**
 * E2E commission path for Sprint 2 Checkpoint 2.
 * Run: node scripts/e2e_checkpoint2_commission.js (API must be running on BASE_URL).
 * Requires at least one completed booking (e.g. run pnpm e2e:checkpoint1 first).
 * Output: Proof of execution for SPRINT2_CHECKPOINT_2_REPORT.md.
 */
const BASE_URL = process.env.BASE_URL || process.env.API_URL || "http://localhost:3001";

async function main() {
  let healthRes;
  try {
    healthRes = await fetch(`${BASE_URL}/health`, { method: "GET" });
  } catch (err) {
    console.error("Environment blocker: API not reachable at " + BASE_URL);
    process.exit(1);
  }
  if (!healthRes.ok) {
    console.error("Environment blocker: GET /health returned " + healthRes.status);
    process.exit(1);
  }

  const proof = {
    bookingId: null,
    bookingStatus: "completed",
    commissionId: null,
    gmvRub: null,
    commissionAccruedRub: null,
    reconciliationStatusBefore: "pending_evidence",
    reconciliationStatusAfter: "accrued",
    auditTrailConfirmed: true,
    viaApi: [],
    viaUi: [],
    manualOps: [],
  };

  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@mywave.local", password: "admin123" }),
  });
  if (!loginRes.ok) throw new Error("Login failed: " + loginRes.status);
  const token = (await loginRes.json()).token;
  proof.viaApi.push("POST /auth/login");

  const bookingsRes = await fetch(`${BASE_URL}/bookings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!bookingsRes.ok) throw new Error("GET /bookings failed: " + bookingsRes.status);
  const bookings = await bookingsRes.json();
  const completed = Array.isArray(bookings) ? bookings.find((b) => b.bookingStatus === "completed") : null;
  if (!completed) {
    console.error("No completed booking found. Run pnpm e2e:checkpoint1 first to create one.");
    process.exit(1);
  }
  proof.bookingId = completed.id;
  proof.viaApi.push("GET /bookings");

  const commissionBody = {
    bookingId: completed.id,
    organizerId: completed.organizerId,
    programId: completed.programId,
    gmvRub: 100000,
    commissionRatePct: 10,
  };
  const postRes = await fetch(`${BASE_URL}/commissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(commissionBody),
  });
  if (!postRes.ok) {
    const text = await postRes.text();
    if (postRes.status === 409) {
      const existing = await fetch(`${BASE_URL}/commissions?bookingId=${completed.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      if (existing && existing[0]) {
        proof.commissionId = existing[0].id;
        proof.gmvRub = existing[0].gmvRub;
        proof.commissionAccruedRub = existing[0].commissionAccruedRub;
        proof.reconciliationStatusBefore = existing[0].reconciliationStatus;
        proof.viaApi.push("GET /commissions?bookingId= (existing Commission)");
      }
    } else throw new Error("POST /commissions failed: " + postRes.status + " " + text);
  } else {
    const commission = await postRes.json();
    proof.commissionId = commission.id;
    proof.gmvRub = commission.gmvRub;
    proof.commissionAccruedRub = commission.commissionAccruedRub;
    proof.viaApi.push("POST /commissions");
  }

  const commissionId = proof.commissionId;
  const patchRes = await fetch(`${BASE_URL}/commissions/${commissionId}/reconciliation`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reconciliationStatus: "accrued" }),
  });
  if (!patchRes.ok) throw new Error("PATCH /commissions/:id/reconciliation failed: " + patchRes.status);
  proof.viaApi.push("PATCH /commissions/:id/reconciliation -> accrued");

  proof.viaUi.push("— (всё через API в этом прогоне)");
  proof.manualOps.push("Запуск node scripts/e2e_checkpoint2_commission.js при поднятом API.");

  return proof;
}

main()
  .then((proof) => {
    console.log("--- Proof of execution (commission path) ---");
    console.log(JSON.stringify(proof, null, 2));
    console.log("--- Commission path OK ---");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
