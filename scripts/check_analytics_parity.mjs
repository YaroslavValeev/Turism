#!/usr/bin/env node
const localBase = process.env.LOCAL_BASE_URL || "http://localhost:3001";
const targetBase = process.env.TARGET_BASE_URL;
const localAdminToken = process.env.LOCAL_ADMIN_TOKEN || "";
const localInternalToken = process.env.LOCAL_INTERNAL_TOKEN || "";
const targetAdminToken = process.env.TARGET_ADMIN_TOKEN || "";
const targetInternalToken = process.env.TARGET_INTERNAL_TOKEN || "";

if (!targetBase || !targetAdminToken || !targetInternalToken) {
  console.error("Missing TARGET_BASE_URL/TARGET_ADMIN_TOKEN/TARGET_INTERNAL_TOKEN");
  process.exit(1);
}

async function fetchJson(url, headers = {}, method = "GET") {
  const res = await fetch(url, { headers, method });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function collect(base, adminToken, internalToken) {
  const a = { Authorization: `Bearer ${adminToken}` };
  const i = { Authorization: `Bearer ${internalToken}` };
  const [health, dq, founder, founderDaily, billing, refresh, scores, alerts] = await Promise.all([
    fetchJson(`${base}/health`),
    fetchJson(`${base}/metrics/analytics/dq?hours=24`, a),
    fetchJson(`${base}/metrics/founder/summary`, a),
    fetchJson(`${base}/metrics/founder/daily`, a),
    fetchJson(`${base}/metrics/billing/daily`, a),
    fetchJson(`${base}/internal/analytics/refresh`, i, "POST"),
    fetchJson(`${base}/internal/analytics/scores/recalculate`, i, "POST"),
    fetchJson(`${base}/internal/analytics/alerts/run`, i, "POST"),
  ]);
  return {
    health,
    dq: dq.body,
    dashboards: {
      founderSummary: founder.ok ? "live" : "down",
      dqDashboard: dq.ok ? "live" : "down",
      billingDashboard: billing.ok ? "live" : "down",
      founderDaily: founderDaily.ok ? "live" : "down",
    },
    cycle: {
      refresh: refresh.body,
      scores: scores.body,
      alerts: alerts.body,
    },
  };
}

const [local, target] = await Promise.all([
  localAdminToken && localInternalToken
    ? collect(localBase, localAdminToken, localInternalToken)
    : Promise.resolve({ skipped: true }),
  collect(targetBase, targetAdminToken, targetInternalToken),
]);

console.log(JSON.stringify({ local, target }, null, 2));
