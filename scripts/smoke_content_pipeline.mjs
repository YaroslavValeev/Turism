/**
 * Read-only smoke: health, login, content-pipeline list, content-performance.
 * API: BASE_URL or API_URL (default http://localhost:3001).
 * Does not run ingestion or pipeline jobs.
 */
const BASE_URL = process.env.BASE_URL || process.env.API_URL || "http://localhost:3001";

async function main() {
  const steps = [];
  const fail = (name, err) => {
    console.error(`FAIL: ${name}`, err);
    process.exit(1);
  };

  let token = null;

  steps.push(async () => {
    const r = await fetch(`${BASE_URL}/health`);
    if (!r.ok) fail("GET /health", r.status);
    const j = await r.json();
    console.log("ok GET /health", j);
  });

  steps.push(async () => {
    const r = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@mywave.local", password: "admin123" }),
    });
    if (!r.ok) fail("POST /auth/login", r.status);
    const j = await r.json();
    token = j.token;
    if (!token) fail("POST /auth/login", "no token");
    console.log("ok POST /auth/login");
  });

  steps.push(async () => {
    const r = await fetch(`${BASE_URL}/api/content-pipeline/items`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) fail("GET /api/content-pipeline/items", r.status);
    const j = await r.json();
    console.log("ok GET /api/content-pipeline/items count ~", Array.isArray(j) ? j.length : "?");
  });

  steps.push(async () => {
    const r = await fetch(`${BASE_URL}/metrics/content-performance?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) fail("GET /metrics/content-performance", r.status);
    const j = await r.json();
    console.log("ok GET /metrics/content-performance", j.note || "");
  });

  for (const s of steps) {
    try {
      await s();
    } catch (e) {
      fail("step", e);
    }
  }
  console.log("smoke_content_pipeline: all ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
