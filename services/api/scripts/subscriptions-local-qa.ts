/** Disposable database + loopback fake Telegram ONLY. Never loads repository env files. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Env } from "@mywave/config";
import { prisma } from "../src/lib/prisma";
import { publicSubscriptionsRoutes } from "../src/modules/subscriptions/routes";
import { handleSubscriptionOptIn } from "../src/modules/subscriptions/telegramOptIn";
import { notifySubscribersOnProgramPublished } from "../src/modules/subscriptions/notifier";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["127.0.0.1", "localhost"].includes(database.hostname) && database.pathname === "/tourism_qa", "Disposable local tourism_qa database only");
  const messages: Array<Record<string, any>> = [];
  const fakeTelegram = express(); fakeTelegram.use(express.json());
  fakeTelegram.post(/.*/, (req, res) => { messages.push(req.body); res.json({ ok: true, result: { message_id: messages.length } }); });
  const telegramServer = fakeTelegram.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => telegramServer.once("listening", resolve));
  const env = { TELEGRAM_PUBLIC_BOT_ENABLED: true, TELEGRAM_UPDATES_BOT_USERNAME: "qa_test_bot",
    TELEGRAM_API_BASE_URL: `http://127.0.0.1:${(telegramServer.address() as AddressInfo).port}`, TELEGRAM_BOT_TOKEN: randomBytes(24).toString("hex"),
    PUBLIC_WEB_BASE_URL: "http://127.0.0.1", PUBLIC_API_BASE_URL: "http://127.0.0.1" } as Env;
  const app = express(); app.use(express.json()); app.use("/subscriptions", publicSubscriptionsRoutes(env));
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: "qa_internal" }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  let subscriptionId: string | undefined;
  const checks: string[] = [];
  const pass = (name: string) => checks.push(name);
  try {
    const post = async (body: unknown) => {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/subscriptions`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      return { status: response.status, body: await response.json() as any };
    };
    const program = await prisma.program.findFirstOrThrow({ where: { publishStatus: "published", scheduleType: "fixed" } });
    const username = `qa_${randomBytes(5).toString("hex")}`;
    assert.equal((await post({ email: `${username}@example.invalid` })).status, 400); pass("missing consent rejected");
    assert.equal((await post({ email: `${username}@example.invalid`, consent: false })).status, 400); pass("false consent rejected");
    const day = program.startDate.toISOString().slice(0, 10);
    const payload = { telegramUsername: username, consent: true, discipline: program.discipline, region: program.region,
      levelRequired: program.levelRequired || undefined, dateFrom: day, dateTo: day, source: "local-qa-only", utm: { utm_source: "qa" } };
    const created = await post(payload); assert.equal(created.status, 201); subscriptionId = created.body.id;
    assert.match(created.body.tgOptInUrl, /mywave_sub_[a-f0-9]{48}$/); pass("random expiring opt-in link issued");
    const row = await prisma.updateSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    assert.ok(row.consentAt); assert.equal((row.metaJson as any).source, "local-qa-only"); assert.equal((row.metaJson as any).utm.utm_source, "qa");
    assert.equal(row.dateFrom?.toISOString().slice(0, 10), day); assert.equal(row.tgOptInUrl, null); pass("consent, source, UTM, filters retained; bearer URL not stored");
    const duplicates = await Promise.all([post(payload), post(payload)]);
    assert.ok(duplicates.every(r => r.body.id === subscriptionId && r.status === 200)); pass("concurrent repeated signup keeps one identity");
    const refreshed = await post(payload);
    const token = new URL(refreshed.body.tgOptInUrl).searchParams.get("start")!;
    const msg = { text: `/start ${token}`, chat: { id: 123456, type: "private" }, from: { id: 123456, username } };
    await notifySubscribersOnProgramPublished(env, program);
    const notifications = () => messages.filter(m => typeof m.text === "string" && m.text.includes(program.title));
    assert.equal(notifications().length, 0); pass("no DM before private-chat binding");
    await handleSubscriptionOptIn(env, { ...msg, from: { ...msg.from, username: "different_user" } });
    assert.equal((await prisma.updateSubscription.findUniqueOrThrow({ where: { id: subscriptionId } })).telegramChatId, null); pass("wrong username cannot claim token");
    // Race the same token from two private chats with the expected username: only one may win.
    await Promise.all([handleSubscriptionOptIn(env, msg), handleSubscriptionOptIn(env, { ...msg, chat: { id: 654321, type: "private" }, from: { id: 654321, username } })]);
    const bound = await prisma.updateSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    assert.ok(["123456", "654321"].includes(bound.telegramChatId ?? "")); assert.ok(bound.telegramBoundAt); pass("atomic token claim binds exactly one private chat");
    await Promise.all([notifySubscribersOnProgramPublished(env, program), notifySubscribersOnProgramPublished(env, program)]);
    assert.equal(notifications().length, 1); assert.equal(String(notifications()[0]!.chat_id), bound.telegramChatId); pass("concurrent publication sends one DM to numeric chat ID");
    await notifySubscribersOnProgramPublished(env, program); assert.equal(notifications().length, 1); pass("publication replay does not resend");
    assert.equal(await prisma.subscriptionDelivery.count({ where: { subscriptionId, programId: program.id, channel: "telegram", status: "sent" } }), 1); pass("delivery ledger persisted");
    const winner = Number(bound.telegramChatId);
    await handleSubscriptionOptIn(env, { text: "/stop", chat: { id: winner, type: "private" }, from: { id: winner, username } });
    const stopped = await prisma.updateSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    assert.equal(stopped.channelTelegram, false); assert.equal(stopped.telegramChatId, null); pass("stop clears Telegram binding and token");
    console.log(JSON.stringify({ passed: checks.length, checks, transport: "loopback fake Telegram; no external messages" }, null, 2));
  } finally {
    if (subscriptionId) await prisma.updateSubscription.update({ where: { id: subscriptionId }, data: { status: "unsubscribed" } });
    await new Promise<void>(resolve => server.close(() => resolve()));
    await new Promise<void>(resolve => telegramServer.close(() => resolve()));
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "local QA failed"); process.exitCode = 1; });
