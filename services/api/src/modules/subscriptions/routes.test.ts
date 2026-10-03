import express from "express";
import type { AddressInfo } from "node:net";
import type { Env } from "@mywave/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";
import { publicSubscriptionsRoutes } from "./routes";

vi.mock("../../lib/prisma", () => ({ prisma: { updateSubscription: { findUnique: vi.fn(), upsert: vi.fn() } } }));
vi.mock("../telegram/telegramApi", () => ({ isTelegramBotApiConfigured: () => true }));
const enabled = { TELEGRAM_PUBLIC_BOT_ENABLED: true, TELEGRAM_UPDATES_BOT_USERNAME: "test_qa_bot" } as Env;

async function post(body: unknown, env = enabled) {
  const app = express(); app.use(express.json()); app.use("/subscriptions", publicSubscriptionsRoutes(env));
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: "internal" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try { const { port } = server.address() as AddressInfo;
    const r = await fetch(`http://127.0.0.1:${port}/subscriptions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

describe("subscriptions HTTP", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.mocked(prisma.updateSubscription.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.updateSubscription.upsert).mockImplementation(async (args: any) => ({ id: "qa-sub", ...args.create }) as any);
  });
  it("requires literal true, including missing/null/string values", async () => {
    for (const consent of [undefined, false, null, "true", 1]) expect((await post({ email: "qa@example.invalid", consent })).status).toBe(400);
    expect(prisma.updateSubscription.upsert).not.toHaveBeenCalled();
  });
  it("keeps consent/source/UTM in a single atomic upsert", async () => {
    const r = await post({ email: "QA@example.invalid", consent: true, source: "mini-app", utm: { utm_source: "telegram" }, levelRequired: "beginner", dateFrom: "2026-10-03" });
    expect(r.status).toBe(201);
    const args = vi.mocked(prisma.updateSubscription.upsert).mock.calls[0]![0] as any;
    expect(args.create.consentAt).toBeInstanceOf(Date);
    expect(args.create.metaJson).toMatchObject({ consentGiven: true, source: "mini-app", utm: { utm_source: "telegram" }, consentPolicyVersion: expect.any(String) });
    expect(args.create.dateFrom.toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });
  it("refreshes consent without discarding metadata on a repeated request", async () => {
    vi.mocked(prisma.updateSubscription.findUnique).mockResolvedValue({ id: "qa-sub", metaJson: { source: "original", utm: { utm_source: "test" } } } as any);
    expect((await post({ email: "qa@example.invalid", consent: true })).status).toBe(200);
    const args = vi.mocked(prisma.updateSubscription.upsert).mock.calls[0]![0] as any;
    expect(args.update.metaJson.source).toBe("original"); expect(args.update.metaJson.utm).toEqual({ utm_source: "test" });
  });
  it("does not advertise Telegram while public mode is disabled", async () => {
    expect((await post({ telegramUsername: "qa_user", consent: true }, { ...enabled, TELEGRAM_PUBLIC_BOT_ENABLED: false })).status).toBe(503);
    expect(prisma.updateSubscription.upsert).not.toHaveBeenCalled();
  });
  it("issues an expiring random link, never a subscription ID payload", async () => {
    const r = await post({ telegramUsername: "@qa_user", consent: true });
    expect(r.status).toBe(201); expect(r.data.telegramConfirmed).toBe(false);
    expect(r.data.tgOptInUrl).toMatch(/start=mywave_sub_[a-f0-9]{48}$/);
    const args = vi.mocked(prisma.updateSubscription.upsert).mock.calls[0]![0] as any;
    expect(args.create.telegramTokenHash).not.toBe(r.data.tgOptInUrl.split("mywave_sub_")[1]);
    expect(args.create.tgOptInUrl).toBeNull();
  });
  it("requires fresh Telegram opt-in after unsubscribe, never revives an old binding", async () => {
    vi.mocked(prisma.updateSubscription.findUnique).mockResolvedValue({ id: "qa-sub", status: "unsubscribed", channelTelegram: true,
      telegramChatId: "12345", telegramBoundAt: new Date(), metaJson: {} } as any);
    await post({ telegramUsername: "qa_user", consent: true });
    const args = vi.mocked(prisma.updateSubscription.upsert).mock.calls[0]![0] as any;
    expect(args.update.telegramChatId).toBeNull(); expect(args.update.telegramBoundAt).toBeNull(); expect(args.update.telegramTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects invalid filters/usernames and propagates database failure", async () => {
    expect((await post({ email: "qa@example.invalid", consent: true, dateFrom: "2026-02-30" })).status).toBe(400);
    expect((await post({ telegramUsername: "https://t.me/qa_user", consent: true })).status).toBe(400);
    vi.mocked(prisma.updateSubscription.upsert).mockRejectedValue(new Error("db unavailable"));
    expect((await post({ email: "qa@example.invalid", consent: true })).status).toBe(500);
  });
});
