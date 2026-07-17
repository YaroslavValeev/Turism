import { beforeEach, describe, expect, it, vi } from "vitest";
import { callTelegramJson } from "../telegram/telegramApi";
import { notifyLeadMissingContactToOps } from "./opsNotify";

vi.mock("../telegram/telegramApi", () => ({
  callTelegramJson: vi.fn(async () => ({ ok: true })),
  isTelegramBotApiConfigured: vi.fn(() => true),
}));

describe("notifyLeadMissingContactToOps", () => {
  beforeEach(() => {
    vi.mocked(callTelegramJson).mockClear();
  });

  it("sends an operator message without internal English status codes", async () => {
    await notifyLeadMissingContactToOps(
      {
        TELEGRAM_ALERT_CHAT_ID: "123",
        TELEGRAM_API_BASE_URL: "https://api.telegram.org",
        TELEGRAM_BOT_TOKEN: "test-token",
      } as never,
      {
        leadToken: "lead-123",
        programTitle: "Тестовая программа",
        organizerName: "Тестовый организатор",
        organizerId: "organizer-123",
        bookingId: "booking-123",
      },
    );

    const body = vi.mocked(callTelegramJson).mock.calls[0]?.[2] as { text?: string };
    expect(body.text).toContain("Статус: требуется контакт организатора");
    expect(body.text).not.toContain("organizer_telegram_channel_missing");
    expect(body.text).not.toContain("contacted manually");
  });
});
