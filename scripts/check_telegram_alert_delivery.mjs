#!/usr/bin/env node
const base = process.env.TARGET_BASE_URL;
const internalToken = process.env.TARGET_INTERNAL_TOKEN;

if (!base || !internalToken) {
  console.error("Missing TARGET_BASE_URL/TARGET_INTERNAL_TOKEN");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${internalToken}`, "Content-Type": "application/json" };

async function run() {
  const alerts = await fetch(`${base}/internal/analytics/alerts/run`, { method: "POST", headers });
  const body = await alerts.json().catch(() => ({}));
  console.log(JSON.stringify({ ok: alerts.ok, status: alerts.status, body }, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
