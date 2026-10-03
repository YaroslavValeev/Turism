// Writes fictional QA data ONLY to an explicitly supplied loopback API.
const base = new URL(process.argv[2]);
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("Local sandbox only");
const checks = [];
async function call(path, method, body, expected) {
  const r = await fetch(new URL(path, base), { method, headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  const data = await r.json().catch(() => ({ error: "Non-JSON response" }));
  checks.push({ path, method, expected, actual: r.status, pass: r.status === expected });
  return data;
}
const programs = await call("/programs", "GET", null, 200);
if (!Array.isArray(programs) || !programs.length) throw new Error("Seed a disposable local catalog first");
const programId = programs[0].id;
const contact = `qa-${Date.now()}@example.invalid`;
await call("/bookings", "POST", {}, 400);
await call("/bookings", "POST", { programId, guestContact: contact }, 400);
await call("/bookings", "POST", { programId: "missing-qa-program", guestContact: contact, legalConsent: true }, 404);
const booking = await call("/bookings", "POST", { programId, guestContact: contact, legalConsent: true, sourceChannel: "qa-local-only" }, 201);
checks.push({ scenario: "booking consent stored", pass: Boolean(booking.legalConsentAt && booking.legalConsentPolicyVersion) });
await call("/bookings", "POST", { programId, guestContact: contact, legalConsent: true }, 409);
await call("/bookings", "GET", null, 401);
await call(`/bookings/${booking.id}/status`, "PATCH", { bookingStatus: "completed" }, 401);
await call("/public/organizer-intake", "POST", {}, 400);
await call("/public/organizer-intake", "POST", { intakeType: "program_submission", contactName: "Local QA", contactEmail: "invalid", programTitle: "Sandbox only" }, 400);
await call("/public/organizer-intake", "POST", { intakeType: "program_submission", contactName: "Local QA", contactEmail: contact, programTitle: "Sandbox only" }, 201);
await call("/public/organizer-intake", "POST", { intakeType: "verification_inquiry", contactName: "Local QA", contactEmail: contact }, 201);
await call("/public/subscriptions", "POST", {}, 400);
await call("/public/subscriptions", "POST", { email: "invalid", consent: true }, 400);
await call("/public/subscriptions", "POST", { email: contact, consent: false }, 400);
await call("/public/subscriptions", "POST", { email: contact, consent: true, discipline: "skiing", source: "qa-local-only" }, 201);
await call("/public/subscriptions", "POST", { email: contact, consent: true, discipline: "skiing" }, 200);
await call("/public/subscriptions/unsubscribe", "POST", { email: contact, discipline: "skiing" }, 200);
await call("/public/subscriptions/admin/export", "GET", null, 401);
// This expectation deliberately reports the existing consent bug rather than masking it.
await call("/public/subscriptions", "POST", { email: `no-consent-${contact}` }, 400);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), base: base.origin, checks }, null, 2));
if (checks.some((c) => !c.pass)) process.exitCode = 1;
