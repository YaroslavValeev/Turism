import type { Env } from "@mywave/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";
import { callTelegramJson } from "../telegram/telegramApi";
import { handleSubscriptionOptIn } from "./telegramOptIn";

vi.mock("../../lib/prisma", () => ({ prisma: { updateSubscription: { findUnique: vi.fn(), updateMany: vi.fn() } } }));
vi.mock("../telegram/telegramApi", () => ({ callTelegramJson: vi.fn() }));
const env = { TELEGRAM_PUBLIC_BOT_ENABLED: true } as Env;
const token = "a".repeat(48);
const message = { text: `/start mywave_sub_${token}`, chat: { id: 12345, type: "private" }, from: { id: 12345, username: "qa_user" } };
const row = () => ({ id: "qa-sub", status: "active", channelTelegram: true, consentAt: new Date(), telegramUsername: "qa_user",
  telegramTokenHash: "hash", telegramTokenExpiresAt: new Date(Date.now() + 60000), telegramChatId: null });

describe("Telegram subscription opt-in", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(callTelegramJson).mockResolvedValue({ ok: true });
    vi.mocked(prisma.updateSubscription.findUnique).mockResolvedValue(row() as any);
    vi.mocked(prisma.updateSubscription.updateMany).mockResolvedValue({ count: 1 }); });
  it("atomically binds only the expected private user to numeric chat ID", async () => {
    expect(await handleSubscriptionOptIn(env, message)).toBe(true);
    expect(prisma.updateSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ telegramChatId: null, status: "active", consentAt: { not: null } }),
      data: expect.objectContaining({ telegramChatId: "12345", telegramBoundAt: expect.any(Date) }) }));
    expect(callTelegramJson).toHaveBeenCalledWith(env, "sendMessage", expect.objectContaining({ chat_id: "12345", text: expect.stringContaining("подтверждена") }));
  });
  it("never binds in groups, with spoofed sender or public mode disabled", async () => {
    await handleSubscriptionOptIn(env, { ...message, chat: { id: -123, type: "supergroup" } });
    await handleSubscriptionOptIn(env, { ...message, from: { id: 54321, username: "qa_user" } });
    await handleSubscriptionOptIn({ ...env, TELEGRAM_PUBLIC_BOT_ENABLED: false }, message);
    expect(prisma.updateSubscription.findUnique).not.toHaveBeenCalled(); expect(callTelegramJson).not.toHaveBeenCalled();
  });
  it("rejects wrong username, expired/consentless/unsubscribed records and a claimed token", async () => {
    for (const change of [{ telegramUsername: "someone_else" }, { telegramTokenExpiresAt: new Date(0) },
      { consentAt: null }, { status: "unsubscribed" }, { telegramChatId: "77777" }]) {
      vi.mocked(prisma.updateSubscription.findUnique).mockResolvedValue({ ...row(), ...change } as any);
      await handleSubscriptionOptIn(env, message);
    }
    expect(prisma.updateSubscription.updateMany).not.toHaveBeenCalled();
  });
  it("does not use legacy IDs as tokens; same bound chat can replay acknowledgement safely", async () => {
    await handleSubscriptionOptIn(env, { ...message, text: "/start mywave_sub_qa-sub" });
    expect(prisma.updateSubscription.findUnique).not.toHaveBeenCalled();
    vi.mocked(prisma.updateSubscription.findUnique).mockResolvedValue({ ...row(), telegramChatId: "12345", telegramTokenExpiresAt: new Date(0) } as any);
    await handleSubscriptionOptIn(env, message);
    expect(prisma.updateSubscription.updateMany).not.toHaveBeenCalled();
    expect(callTelegramJson).toHaveBeenLastCalledWith(env, "sendMessage", expect.objectContaining({ text: expect.stringContaining("подтверждена") }));
  });
  it("stops only Telegram and handles failed reply without losing the binding", async () => {
    await handleSubscriptionOptIn(env, { ...message, text: "/stop" });
    const args = vi.mocked(prisma.updateSubscription.updateMany).mock.calls[0]![0] as any;
    expect(args.where).toEqual({ telegramChatId: "12345" }); expect(args.data.channelTelegram).toBe(false);
    expect(args.data.channelEmail).toBeUndefined();
    vi.mocked(callTelegramJson).mockResolvedValue({ ok: false });
    await expect(handleSubscriptionOptIn(env, message)).rejects.toThrow("subscription_optin_reply_failed");
  });
  it("leaves normal /start and operator commands untouched", async () => {
    expect(await handleSubscriptionOptIn(env, { ...message, text: "/ops" })).toBe(false);
    expect(await handleSubscriptionOptIn(env, { ...message, text: "/start program_payload" })).toBe(false);
  });
});
