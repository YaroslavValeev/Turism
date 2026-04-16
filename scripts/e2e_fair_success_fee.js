/**
 * Fair Success Fee 3% E2E.
 * Run: node scripts/e2e_fair_success_fee.js
 * Requires API + seeded admin credentials.
 */
const BASE_URL = process.env.BASE_URL || process.env.API_URL || "http://localhost:3001";

async function request(path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  await request("/health");
  const auth = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@mywave.local", password: "admin123" }),
  });
  const token = auth.token;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const bookings = await request("/bookings", { headers });
  const booking = Array.isArray(bookings)
    ? bookings.find((item) => item.bookingStatus !== "disputed") ?? bookings[0]
    : null;
  if (!booking) {
    throw new Error("No booking found for Fair Success Fee e2e");
  }

  // 1) Payment 100000 -> commission 3000
  const payment1 = await request("/payments", {
    method: "POST",
    headers,
    body: JSON.stringify({
      bookingId: booking.id,
      amountRub: 100000,
      paymentKind: "full",
      status: "confirmed",
      paymentMethod: "bank_transfer",
      notes: "e2e payment #1",
    }),
  });
  if (payment1.commission.commissionAmountRub !== 3000) {
    throw new Error(`Expected 3000 after first payment, got ${payment1.commission.commissionAmountRub}`);
  }

  // 2) Additional partial payment 50000 -> total commission 4500
  const payment2 = await request("/payments", {
    method: "POST",
    headers,
    body: JSON.stringify({
      bookingId: booking.id,
      amountRub: 50000,
      paymentKind: "partial",
      status: "confirmed",
      notes: "e2e payment #2",
    }),
  });
  if (payment2.commission.commissionAmountRub !== 4500) {
    throw new Error(`Expected 4500 after second payment, got ${payment2.commission.commissionAmountRub}`);
  }

  const statements = await request("/billing/statements/generate", {
    method: "POST",
    headers,
    body: JSON.stringify({
      periodStart: "2000-01-01T00:00:00.000Z",
      periodEnd: "2100-12-31T23:59:59.999Z",
    }),
  });
  const statementCount = Array.isArray(statements) ? statements.length : 0;
  if (statementCount === 0) {
    throw new Error("Expected at least one billing statement for eligible commissions");
  }

  // 3) Refund 20000 -> net 130000 -> 3900
  const refund1 = await request("/refunds", {
    method: "POST",
    headers,
    body: JSON.stringify({
      bookingId: booking.id,
      amountRub: 20000,
      status: "completed",
      reason: "e2e partial refund",
    }),
  });
  if (refund1.commission.commissionAmountRub !== 3900) {
    throw new Error(`Expected 3900 after partial refund, got ${refund1.commission.commissionAmountRub}`);
  }

  // 4) Full refund remainder -> commission reversed and zero
  const remainder = 130000;
  const refund2 = await request("/refunds", {
    method: "POST",
    headers,
    body: JSON.stringify({
      bookingId: booking.id,
      amountRub: remainder,
      status: "completed",
      reason: "e2e full refund",
    }),
  });
  if (refund2.commission.commissionAmountRub !== 0 || refund2.commission.reconciliationStatus !== "reversed") {
    throw new Error("Expected reversed commission with zero amount after full refund");
  }

  // 5) Recalculate endpoint should stay consistent
  const recalculated = await request(`/commissions/${refund2.commission.id}/recalculate`, {
    method: "POST",
    headers,
  });
  if (recalculated.commissionAmountRub !== 0) {
    throw new Error("Recalculation changed zeroed commission unexpectedly");
  }

  const audit = await request("/metrics/admin/funnel", { headers });

  console.log(
    JSON.stringify(
      {
        bookingId: booking.id,
        checks: {
          payment100k: "ok",
          payment50k: "ok",
          refund20k: "ok",
          fullRefund: "ok",
          recalculate: "ok",
          statementGenerated: true,
        },
        statementCount,
        metricsSnapshot: audit,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
