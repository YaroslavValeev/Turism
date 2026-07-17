import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { buildTelegramBotApiUrl } from "@mywave/config";
import { proxyFetch } from "../src/lib/proxyFetch";

type CheckResult = { name: string; ok: boolean; details?: string };

const prisma = new PrismaClient();

function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function telegramMethodUrl(method: string): string {
  const url = buildTelegramBotApiUrl(process.env, method);
  if (!url) throw new Error("Missing Telegram Bot API configuration");
  return url;
}

async function runCheck(name: string, fn: () => Promise<string | void>): Promise<CheckResult> {
  try {
    const details = await fn();
    return { name, ok: true, details };
  } catch (e) {
    return { name, ok: false, details: e instanceof Error ? e.message : String(e) };
  }
}

async function loginAdmin(apiBase: string): Promise<string> {
  const email = process.env.SMOKE_ADMIN_EMAIL?.trim() || "admin@mywave.local";
  const password = process.env.SMOKE_ADMIN_PASSWORD?.trim() || "admin123";
  const res = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`admin login failed: ${res.status}`);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error("admin login no token");
  return json.token;
}

async function adminPost<T>(apiBase: string, token: string, path: string, body: unknown): Promise<T> {
  const r = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j as T;
}

async function main() {
  const apiBase = (process.env.SMOKE_API_BASE_URL?.trim() || process.env.PUBLIC_API_BASE_URL?.trim() || "http://localhost:3001").replace(/\/+$/, "");
  const checks: CheckResult[] = [];

  checks.push(
    await runCheck("env: required", async () => {
      telegramMethodUrl("getMe");
      requiredEnv("TELEGRAM_CONTENT_OWNER_CHAT_ID");
      requiredEnv("CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN");
      requiredEnv("TELEGRAM_UPDATES_CHANNEL_CHAT_ID");
      return "telegram env present";
    }),
  );

  checks.push(
    await runCheck("api: health", async () => {
      const r = await fetch(`${apiBase}/health`);
      if (!r.ok) throw new Error(`health ${r.status}`);
      return "ok";
    }),
  );

  checks.push(
    await runCheck("telegram: webhook info", async () => {
      const webBase = process.env.PUBLIC_WEB_BASE_URL?.trim() || "";
      if (/localhost|127\.0\.0\.1/i.test(webBase)) {
        return "skipped for local PUBLIC_WEB_BASE_URL";
      }
      const r = await proxyFetch(
        telegramMethodUrl("getWebhookInfo"),
        {},
        process.env.TELEGRAM_BOT_HTTP_PROXY,
      );
      const j = (await r.json()) as { ok?: boolean; result?: { url?: string; pending_update_count?: number; last_error_message?: string } };
      if (!j.ok || !j.result) throw new Error("getWebhookInfo failed");
      if (!j.result.url) throw new Error("webhook url is empty");
      if (j.result.last_error_message) throw new Error(`webhook last error: ${j.result.last_error_message}`);
      return `url=${j.result.url}, pending=${j.result.pending_update_count ?? 0}`;
    }),
  );

  let token = "";
  checks.push(
    await runCheck("api: admin login", async () => {
      token = await loginAdmin(apiBase);
      return "ok";
    }),
  );

  let approvedDraftId = "";
  let approvedDraftItemId = "";
  let fallbackReadyDraftId = "";
  let fallbackReadyItemId = "";
  checks.push(
    await runCheck("db: approved draft exists", async () => {
      const d = await prisma.contentDraft.findFirst({
        where: {
          status: "ready",
          contentItem: { workflowStatus: "approved" },
        },
        orderBy: { updatedAt: "desc" },
        include: { contentItem: true },
      });
      if (!d) return "not found (fallback draft will be created)";
      approvedDraftId = d.id;
      approvedDraftItemId = d.contentItemId;
      return `${d.id} (item ${d.contentItemId})`;
    }),
  );

  checks.push(
    await runCheck("db: fallback ready draft", async () => {
      let d = await prisma.contentDraft.findFirst({
        where: { status: "ready" },
        orderBy: { updatedAt: "desc" },
      });
      if (!d) {
        const now = Date.now();
        const src = await prisma.source.create({
          data: {
            type: "site",
            name: "smoke-source",
            urlOrHandle: `https://smoke.local/${now}`,
            isActive: false,
            fetchIntervalMinutes: 1440,
          },
        });
        const raw = await prisma.rawItem.create({
          data: {
            sourceId: src.id,
            externalItemId: `smoke-${now}`,
            sourceType: "site",
            sourceUrl: `https://smoke.local/post/${now}`,
            rawTitle: "Smoke Draft",
            rawText: "Smoke raw text",
            contentHash: `smoke-hash-${now}`,
          },
        });
        const norm = await prisma.normalizedItem.create({
          data: {
            rawItemId: raw.id,
            title: "Smoke Draft Title",
            eventType: "news",
            discipline: "wakesurf",
            parseVersion: "smoke-v1",
            descriptionShort: "Smoke short",
            descriptionFull: "Smoke full text",
          },
        });
        const item = await prisma.contentItem.create({
          data: {
            rawItemId: raw.id,
            normalizedItemId: norm.id,
            workflowStatus: "approved",
            idempotencyKey: `smoke-item-${now}`,
          },
        });
        d = await prisma.contentDraft.create({
          data: {
            contentItemId: item.id,
            draftType: "telegram_post",
            version: 1,
            status: "ready",
            generatedHeadline: "Smoke headline",
            shortCopy: "Smoke short copy",
            longCopy: "Smoke long copy",
            finalDraftText: "Smoke publish text",
            aiModel: "smoke",
            aiPromptVersion: "smoke",
          },
        });
      }
      fallbackReadyDraftId = d.id;
      fallbackReadyItemId = d.contentItemId;
      return `${d.id} (item ${d.contentItemId})`;
    }),
  );

  const draftForPublish = approvedDraftId || fallbackReadyDraftId;
  const itemForPublish = approvedDraftItemId || fallbackReadyItemId;

  checks.push(
    await runCheck("db: ensure item approved for publish test", async () => {
      if (!draftForPublish || !itemForPublish) throw new Error("no draft selected");
      await prisma.contentItem.update({
        where: { id: itemForPublish },
        data: { workflowStatus: "approved" },
      });
      return `item ${itemForPublish} -> approved`;
    }),
  );

  let beforePubCount = 0;
  checks.push(
    await runCheck("db: capture before counts", async () => {
      beforePubCount = await prisma.contentPublication.count({
        where: { contentDraftId: draftForPublish, channel: { in: ["telegram_channel", "site_blog"] } },
      });
      return `publications before=${beforePubCount}`;
    }),
  );

  checks.push(
    await runCheck("publish: telegram+site_blog", async () => {
      if (!token) throw new Error("admin token missing due previous failures");
      const out = await adminPost<{ published: string[]; failed: Array<{ channel: string; error: string }> }>(
        apiBase,
        token,
        "/api/content-pipeline/publish",
        { draftId: draftForPublish, channels: ["telegram_channel", "site_blog"] },
      );
      if (out.failed.length) throw new Error(`failed: ${JSON.stringify(out.failed)}`);
      return `published: ${out.published.join(",")}`;
    }),
  );

  checks.push(
    await runCheck("db: content_publications written", async () => {
      const rows = await prisma.contentPublication.findMany({
        where: { contentDraftId: draftForPublish, channel: { in: ["telegram_channel", "site_blog"] } },
      });
      if (rows.length < 2) throw new Error(`expected >=2 publications, got ${rows.length}`);
      const bad = rows.find((r) => r.state !== "published");
      if (bad) throw new Error(`channel ${bad.channel} state=${bad.state}`);
      return rows.map((r) => `${r.channel}:${r.state}`).join(", ");
    }),
  );

  checks.push(
    await runCheck("db: blog_posts exists", async () => {
      const blog = await prisma.blogPost.findFirst({
        where: { contentDraftId: draftForPublish, placement: "blog" },
      });
      if (!blog) throw new Error("blog_post for draft not found");
      return `${blog.id} slug=${blog.slug}`;
    }),
  );

  checks.push(
    await runCheck("db: content_metrics exists", async () => {
      const m = await prisma.contentMetric.findMany({
        where: { contentItemId: itemForPublish, channel: { in: ["telegram_channel", "site_blog"] } },
        orderBy: { publishedAt: "desc" },
        take: 5,
      });
      if (!m.length) throw new Error("no content_metrics rows");
      return `${m.length} rows`;
    }),
  );

  checks.push(
    await runCheck("idempotency: rerun no duplicate", async () => {
      if (!token) throw new Error("admin token missing due previous failures");
      await adminPost(apiBase, token, "/api/content-pipeline/publish", {
        draftId: draftForPublish,
        channels: ["telegram_channel", "site_blog"],
      });
      const afterCount = await prisma.contentPublication.count({
        where: { contentDraftId: draftForPublish, channel: { in: ["telegram_channel", "site_blog"] } },
      });
      if (afterCount !== beforePubCount && beforePubCount !== 0 && afterCount !== 2) {
        throw new Error(`unexpected count after rerun: before=${beforePubCount}, after=${afterCount}`);
      }
      if (afterCount > 2) throw new Error(`duplicate publications detected: ${afterCount}`);
      return `count after rerun=${afterCount}`;
    }),
  );

  checks.push(
    await runCheck("api: publications list reachable", async () => {
      if (!token) throw new Error("admin token missing due previous failures");
      const r = await fetch(`${apiBase}/api/content-pipeline/publications`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`publications endpoint ${r.status}`);
      return "ok";
    }),
  );

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.length - passed;
  const summary = {
    ok: failed === 0,
    passed,
    failed,
    checks,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          fatal: e instanceof Error ? e.message : String(e),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

