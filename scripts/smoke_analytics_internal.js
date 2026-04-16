/**
 * Smoke for internal analytics endpoints.
 * Requires API running + INTERNAL_ANALYTICS_TOKEN in env.
 *
 * Run:
 *   INTERNAL_ANALYTICS_TOKEN=... node scripts/smoke_analytics_internal.js
 */
const BASE_URL = process.env.BASE_URL || process.env.API_URL || "http://localhost:3001";
const TOKEN = process.env.INTERNAL_ANALYTICS_TOKEN;

async function run() {
  if (!TOKEN) {
    console.log("SKIP smoke_analytics_internal: INTERNAL_ANALYTICS_TOKEN is not set");
    process.exit(0);
  }

  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${TOKEN}`,
  };

  const batch = {
    events: [
      {
        event_name: "page_view",
        event_version: 1,
        event_source: "frontend",
        event_time: new Date().toISOString(),
        idempotency_key: `smoke:page_view:${Date.now()}`,
        session_id: "smoke_session",
        page_type: "smoke",
      },
    ],
  };

  const r1 = await fetch(`${BASE_URL}/internal/analytics/events`, { method: "POST", headers, body: JSON.stringify(batch) });
  if (!r1.ok) {
    console.error(`FAIL POST /internal/analytics/events: ${r1.status}`);
    process.exit(1);
  }
  console.log("OK POST /internal/analytics/events");

  const r2 = await fetch(`${BASE_URL}/internal/analytics/refresh`, { method: "POST", headers });
  if (!r2.ok) {
    console.error(`FAIL POST /internal/analytics/refresh: ${r2.status}`);
    process.exit(1);
  }
  console.log("OK POST /internal/analytics/refresh");

  const r3 = await fetch(`${BASE_URL}/internal/analytics/alerts/run`, { method: "POST", headers });
  if (!r3.ok) {
    console.error(`FAIL POST /internal/analytics/alerts/run: ${r3.status}`);
    process.exit(1);
  }
  console.log("OK POST /internal/analytics/alerts/run");

  console.log("Analytics internal smoke passed.");
  process.exit(0);
}

run();
