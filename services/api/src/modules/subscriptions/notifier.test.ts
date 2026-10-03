import type { Env } from "@mywave/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";
import { sendEmailIfConfigured } from "./mailer";
import { callTelegramJson } from "../telegram/telegramApi";
import { notifySubscribersOnProgramPublished } from "./notifier";

vi.mock("../../lib/prisma", () => ({ prisma: { program: { findUnique: vi.fn() }, programMedia: { findMany: vi.fn() },
  updateSubscription: { findMany: vi.fn(), updateMany: vi.fn() }, subscriptionDelivery: { createMany: vi.fn(), update: vi.fn() } } }));
vi.mock("./mailer", () => ({ isSmtpConfigured: () => true, sendEmailIfConfigured: vi.fn() }));
vi.mock("../telegram/telegramApi", () => ({ isTelegramBotApiConfigured: () => true, callTelegramJson: vi.fn() }));
vi.mock("../telegram/channelClicks", () => ({ attachChannelPostId: vi.fn(), buildChannelCtas: () => [], createTrackedChannelKeyboard: async () => ({ clickTokens: [], replyMarkup: undefined }) }));

const program = { id: "program", title: "Поездка на Камчатку", discipline: "trekking", region: "Камчатка", startDate: new Date("2026-10-10") };
const env = { PUBLIC_WEB_BASE_URL: "https://web.example.invalid", PUBLIC_API_BASE_URL: "https://api.example.invalid", TELEGRAM_PUBLIC_BOT_ENABLED: true } as Env;
const sub = () => ({ id: "sub", email: "qa@example.invalid", channelEmail: true, channelTelegram: true, consentAt: new Date(), telegramChatId: "12345", telegramBoundAt: new Date(),
  telegramUsername: "qa_user", discipline: null, region: null, levelRequired: null, dateFrom: null, dateTo: null });

describe("subscriber notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.program.findUnique).mockResolvedValue({ ...program, endDate: new Date("2026-10-15"), levelRequired: "beginner", scheduleType: "fixed", publishStatus: "published", organizer: { displayName: "QA" } } as any);
    vi.mocked(prisma.programMedia.findMany).mockResolvedValue([]);
    vi.mocked(prisma.updateSubscription.findMany).mockResolvedValue([sub()] as any);
    vi.mocked(prisma.updateSubscription.updateMany).mockResolvedValue({ count: 1 });
    const claimed = new Set<string>();
    vi.mocked(prisma.subscriptionDelivery.createMany).mockImplementation(async (args: any) => {
      const key = JSON.stringify([args.data.subscriptionId, args.data.programId, args.data.channel]);
      if (claimed.has(key)) return { count: 0 };
      claimed.add(key); return { count: 1 };
    });
    vi.mocked(prisma.subscriptionDelivery.update).mockResolvedValue({} as any);
    vi.mocked(sendEmailIfConfigured).mockResolvedValue(true);
    vi.mocked(callTelegramJson).mockResolvedValue({ ok: true });
  });
  it("uses a numeric private chat and sends each channel once across publication replays", async () => {
    await notifySubscribersOnProgramPublished(env, program);
    await notifySubscribersOnProgramPublished(env, program);
    expect(sendEmailIfConfigured).toHaveBeenCalledOnce(); expect(callTelegramJson).toHaveBeenCalledOnce();
    expect(callTelegramJson).toHaveBeenCalledWith(env, "sendMessage", expect.objectContaining({ chat_id: "12345" }));
  });
  it("does not send to unbound Telegram usernames, but email remains independent", async () => {
    vi.mocked(prisma.updateSubscription.findMany).mockResolvedValue([{ ...sub(), telegramChatId: null, telegramBoundAt: null }] as any);
    await notifySubscribersOnProgramPublished(env, program);
    expect(callTelegramJson).not.toHaveBeenCalled(); expect(sendEmailIfConfigured).toHaveBeenCalledOnce();
  });
  it("excludes legacy consentless rows and mismatching filters", async () => {
    vi.mocked(prisma.updateSubscription.findMany).mockResolvedValue([{ ...sub(), consentAt: null }, { ...sub(), id: "expert", levelRequired: "expert" },
      { ...sub(), id: "later", dateFrom: new Date("2026-10-11") }] as any);
    await notifySubscribersOnProgramPublished(env, program);
    expect(sendEmailIfConfigured).not.toHaveBeenCalled(); expect(callTelegramJson).not.toHaveBeenCalled();
  });
  it("keeps private Telegram disabled and ignores unpublished programs", async () => {
    await notifySubscribersOnProgramPublished({ ...env, TELEGRAM_PUBLIC_BOT_ENABLED: false }, program);
    expect(callTelegramJson).not.toHaveBeenCalled();
    vi.mocked(prisma.program.findUnique).mockResolvedValue({ ...program, publishStatus: "draft" } as any);
    vi.clearAllMocks(); await notifySubscribersOnProgramPublished(env, program);
    expect(sendEmailIfConfigured).not.toHaveBeenCalled();
  });
});
