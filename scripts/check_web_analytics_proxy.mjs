#!/usr/bin/env node
/**
 * Проверка: web POST /api/analytics/events → API internal ingestion.
 * Требует запущенный Next (`pnpm --filter web dev`) и корректный `apps/web/.env.local`.
 */
import { loadWebRuntimeEnv } from "./loadWebRuntimeEnv.mjs";

loadWebRuntimeEnv();

const webBase = (process.env.WEB_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const token =
  (process.env.INTERNAL_ANALYTICS_TOKEN || process.env.TARGET_INTERNAL_TOKEN || "").trim();

if (!token) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error:
          "No INTERNAL_ANALYTICS_TOKEN (or TARGET_INTERNAL_TOKEN) in apps/web/.env* — copy apps/web/.env.example to apps/web/.env.local and align with API",
      },
      null,
      2
    )
  );
  process.exit(1);
}

const body = {
  events: [
    {
      event_name: "page_view",
      event_version: 1,
      event_source: "frontend",
      event_time: new Date().toISOString(),
      idempotency_key: `web_proxy_check:${Date.now()}`,
      session_id: "web_proxy_check",
      page_type: "proxy_check",
    },
  ],
};

const url = `${webBase}/api/analytics/events`;
const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const text = await res.text();
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text.slice(0, 500) };
}

console.log(
  JSON.stringify(
    {
      ok: res.ok,
      status: res.status,
      body: parsed,
      note:
        res.status === 503
          ? "503 usually means web server env missing token; restart `pnpm --filter web dev` after editing .env.local"
          : undefined,
    },
    null,
    2
  )
);

if (!res.ok) process.exit(1);
