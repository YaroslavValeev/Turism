/**
 * Sprint 3: smtp-probe + изолированная подписка/notify/unsubscribe (без спама глобальным подписчикам).
 *
 * Перед loadEnv: при SPRINT3_E2E_RECIPIENT_EMAIL выставляем EMAIL_STAGING_ALLOWLIST, чтобы ушло только туда.
 *
 * Запуск (из корня репо):
 *   pnpm --filter @mywave/config build
 *   SPRINT3_E2E_RECIPIENT_EMAIL=you@gmail.com pnpm --filter api run sprint3:email-e2e
 */
import "../src/env/loadProcessEnv";

import type { Env } from "@mywave/config";

function hasLocalhostInUrl(s: string): boolean {
  return /localhost|127\.0\.0\.1|::1/i.test(s);
}

function checkPublicUrlsForE2e(env: Env, strict: boolean): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  if (hasLocalhostInUrl(env.PUBLIC_WEB_BASE_URL)) {
    messages.push(`PUBLIC_WEB_BASE_URL looks local: ${env.PUBLIC_WEB_BASE_URL}`);
  }
  if (hasLocalhostInUrl(env.PUBLIC_API_BASE_URL)) {
    messages.push(`PUBLIC_API_BASE_URL looks local: ${env.PUBLIC_API_BASE_URL}`);
  }
  if (strict && messages.length) {
    return { ok: false, messages };
  }
  if (messages.length) {
    messages.push("Подсказка: для e2e без localhost задайте https PUBLIC_*; иначе только предупреждение (см. SPRINT3_FAIL_ON_LOCALHOST=1).");
  }
  return { ok: true, messages };
}

async function main() {
  const strictLocal = process.env.SPRINT3_FAIL_ON_LOCALHOST === "1";
  const recipient = process.env.SPRINT3_E2E_RECIPIENT_EMAIL?.trim();
  if (recipient && !process.env.EMAIL_STAGING_ALLOWLIST?.trim()) {
    process.env.EMAIL_STAGING_ALLOWLIST = recipient;
  }

  const { loadEnv } = await import("@mywave/config");
  const { prisma } = await import("../src/lib/prisma");
  const { sendEmailIfConfigured } = await import("../src/modules/subscriptions/mailer");
  const { notifySubscribersOnProgramPublished } = await import("../src/modules/subscriptions/notifier");

  const env = loadEnv();
  const urlCheck = checkPublicUrlsForE2e(env, strictLocal);
  for (const m of urlCheck.messages) {
    // eslint-disable-next-line no-console
    console.warn(`[sprint3:e2e] ${m}`);
  }
  if (!urlCheck.ok) {
    // eslint-disable-next-line no-console
    console.error("[sprint3:e2e] Abort: public URLs must not be localhost (SPRINT3_FAIL_ON_LOCALHOST=1).");
    process.exit(1);
  }

  // --- 1) SMTP probe (тело письма = проверяем отсутствие localhost в сгенерированных ссылках при реальных env)
  const webBase = env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "");
  const apiBase = env.PUBLIC_API_BASE_URL.replace(/\/+$/, "");
  const fakeProgramId = "sprint3-probe";
  const probeBody = [
    "Sprint 3 SMTP / URL probe",
    `Program link would be: ${webBase}/program/${fakeProgramId}`,
    `Unsubscribe would be: ${apiBase}/public/subscriptions/unsubscribe?email=test%40example.com`,
    "",
    hasLocalhostInUrl(`${webBase}/x`) || hasLocalhostInUrl(`${apiBase}/x`)
      ? "WARNING: links above still look like dev (localhost)."
      : "OK: no localhost in these public base URLs.",
  ].join("\n");

  if (recipient) {
    const okProbe = await sendEmailIfConfigured(env, {
      to: recipient,
      subject: "MyWaveTour Sprint 3 — SMTP / public URL probe",
      text: probeBody,
    });
    // eslint-disable-next-line no-console
    console.log(`[sprint3:e2e] smtp_probe: ${okProbe ? "sent" : "failed_or_smtp_not_configured"}`);
  } else {
    // eslint-disable-next-line no-console
    console.log("[sprint3:e2e] smtp_probe: skipped (set SPRINT3_E2E_RECIPIENT_EMAIL)");
  }

  if (!recipient) {
    // eslint-disable-next-line no-console
    console.log("[sprint3:e2e] Full subscription path skipped — no SPRINT3_E2E_RECIPIENT_EMAIL. Done (probe-only possible).");
    return;
  }

  const runId = `s3e2e-${Date.now()}`;
  const tag = `Sprint3E2E-${runId}`;

  const org = await prisma.organizer.create({
    data: {
      displayName: `Sprint3 E2E org ${runId}`,
      contactEmail: `sprint3+${runId}@mywave.local`,
      legalStatus: null,
      contactPhone: null,
      verificationStatus: "listed",
    },
  });

  const start = new Date("2031-03-01T00:00:00.000Z");
  const end = new Date("2031-03-07T00:00:00.000Z");

  const program = await prisma.program.create({
    data: {
      organizerId: org.id,
      title: `Sprint3 E2E program ${runId}`,
      discipline: tag,
      region: tag,
      startDate: start,
      endDate: end,
      durationDays: 6,
      publishStatus: "draft",
      reviewStatus: "ok",
    },
  });

  const sub = await prisma.updateSubscription.create({
    data: {
      email: recipient,
      channelEmail: true,
      channelTelegram: false,
      discipline: tag,
      region: tag,
      status: "active",
      metaJson: { source: "sprint3_e2e" },
    },
  });

  await notifySubscribersOnProgramPublished(env, {
    id: program.id,
    title: program.title,
    discipline: program.discipline,
    region: program.region,
    startDate: program.startDate,
  });
  // eslint-disable-next-line no-console
  console.log("[sprint3:e2e] notify: invoked (проверьте ящик — письмо с ссылкой на /program/ и отпиской).");

  const u = new URL("/public/subscriptions/unsubscribe", `${apiBase}/`);
  u.searchParams.set("email", recipient);
  const unsubRes = await fetch(u.toString());
  const unsubJson = (await unsubRes.json()) as { ok?: boolean; unsubscribed?: number };
  if (!unsubRes.ok) {
    // eslint-disable-next-line no-console
    console.error("[sprint3:e2e] unsubscribe HTTP failed", unsubRes.status, unsubJson);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[sprint3:e2e] unsubscribe:`, unsubJson);
  }

  const st = await prisma.updateSubscription.findUnique({ where: { id: sub.id } });
  // eslint-disable-next-line no-console
  console.log(`[sprint3:e2e] subscription status after GET unsubscribe:`, st?.status);

  if (process.env.SPRINT3_SKIP_CLEANUP === "1") {
    // eslint-disable-next-line no-console
    console.log("[sprint3:e2e] cleanup skipped (SPRINT3_SKIP_CLEANUP=1).");
    return;
  }

  await prisma.updateSubscription.delete({ where: { id: sub.id } });
  await prisma.program.delete({ where: { id: program.id } });
  await prisma.organizer.delete({ where: { id: org.id } });
  // eslint-disable-next-line no-console
  console.log("[sprint3:e2e] cleanup: ok");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
