/**
 * Smoke test for API. Run with: node scripts/smoke.js
 * Requires API running (e.g. pnpm dev:api). BASE_URL defaults to http://localhost:3001.
 */
const BASE_URL = process.env.BASE_URL || process.env.API_URL || "http://localhost:3001";

async function run() {
  let token = null;

  const checks = [
    { name: "GET /health", run: async () => fetch(`${BASE_URL}/health`) },
    {
      name: "POST /auth/login",
      run: async () => {
        const r = await fetch(`${BASE_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "admin@mywave.local", password: "admin123" }),
        });
        if (r.ok) {
          const data = await r.json();
          token = data.token;
        }
        return r;
      },
    },
    {
      name: "GET /organizers",
      run: async () => fetch(`${BASE_URL}/organizers`, { headers: { Authorization: `Bearer ${token}` } }),
    },
    {
      name: "GET /programs?all=1",
      run: async () => fetch(`${BASE_URL}/programs?all=1`, { headers: { Authorization: `Bearer ${token}` } }),
    },
    {
      name: "GET /bookings",
      run: async () => fetch(`${BASE_URL}/bookings`, { headers: { Authorization: `Bearer ${token}` } }),
    },
    {
      name: "GET /incidents",
      run: async () => fetch(`${BASE_URL}/incidents`, { headers: { Authorization: `Bearer ${token}` } }),
    },
    {
      name: "GET /reviews",
      run: async () => fetch(`${BASE_URL}/reviews`, { headers: { Authorization: `Bearer ${token}` } }),
    },
    {
      name: "GET /commissions",
      run: async () => fetch(`${BASE_URL}/commissions`, { headers: { Authorization: `Bearer ${token}` } }),
    },
    {
      name: "GET /payments",
      run: async () => fetch(`${BASE_URL}/payments`, { headers: { Authorization: `Bearer ${token}` } }),
    },
    {
      name: "GET /refunds",
      run: async () => fetch(`${BASE_URL}/refunds`, { headers: { Authorization: `Bearer ${token}` } }),
    },
    {
      name: "GET /billing/statements",
      run: async () => fetch(`${BASE_URL}/billing/statements`, { headers: { Authorization: `Bearer ${token}` } }),
    },
    {
      name: "GET /metrics/admin/funnel",
      run: async () => fetch(`${BASE_URL}/metrics/admin/funnel`, { headers: { Authorization: `Bearer ${token}` } }),
    },
    {
      name: "GET /metrics/founder/daily",
      run: async () => fetch(`${BASE_URL}/metrics/founder/daily`, { headers: { Authorization: `Bearer ${token}` } }),
    },
    {
      name: "GET /metrics/billing/daily",
      run: async () => fetch(`${BASE_URL}/metrics/billing/daily`, { headers: { Authorization: `Bearer ${token}` } }),
    },
  ];

  for (const { name, run } of checks) {
    try {
      const res = await run();
      if (!res.ok) {
        console.error(`FAIL ${name}: ${res.status}`);
        process.exit(1);
      }
      console.log(`OK ${name}`);
    } catch (err) {
      console.error(`FAIL ${name}:`, err.message);
      process.exit(1);
    }
  }
  console.log("Smoke passed.");
  process.exit(0);
}

run();
