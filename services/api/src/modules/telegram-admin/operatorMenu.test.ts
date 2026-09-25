import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    program: { count: vi.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(3) },
    eventCandidate: { count: vi.fn().mockResolvedValue(5) },
    source: { count: vi.fn().mockResolvedValue(40) },
    sourceRun: {
      count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(2),
      findFirst: vi.fn().mockResolvedValue({ startedAt: new Date("2026-09-25T06:00:00.000Z"), status: "success" }),
    },
    programMedia: { count: vi.fn().mockResolvedValue(0) },
  },
}));
vi.mock("../ingestion/service", () => ({ runDailySyncJob: vi.fn() }));
vi.mock("../ingestion/archivePast.service", () => ({ archivePastByDates: vi.fn() }));
vi.mock("../ingestion/telegramMedia", () => ({ refreshTelegramProgramMedia: vi.fn() }));
vi.mock("../telegram/telegramApi", () => ({ callTelegramJson: vi.fn() }));
vi.mock("./handler", () => ({ sendProgramPublishQueue: vi.fn() }));

import { buildMenuAdminCallback, parseMenuAdminCallback, parseTelegramAdminCallback } from "./contracts";
import { buildOperatorMenuKeyboard, buildOperatorStatusText, parseOperatorCommand } from "./operatorMenu";

describe("telegram operator menu", () => {
  it("parses operator commands incl. bot mention", () => {
    expect(parseOperatorCommand("/menu")).toBe("menu");
    expect(parseOperatorCommand("/start")).toBe("menu");
    expect(parseOperatorCommand("/status@MyWaveTour_bot")).toBe("status");
    expect(parseOperatorCommand("/help")).toBe("help");
    expect(parseOperatorCommand("/check_publish")).toBeNull();
    expect(parseOperatorCommand("привет")).toBeNull();
  });

  it("round-trips menu callbacks within 64 bytes and keeps them apart from program callbacks", () => {
    const data = buildMenuAdminCallback("sync_confirm");
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
    expect(parseMenuAdminCallback(data)).toEqual({ entity: "menu", action: "sync_confirm" });
    expect(parseTelegramAdminCallback(data)).toEqual({ entity: "menu", action: "sync_confirm" });
    expect(parseMenuAdminCallback("MTA1|P|PUB|prog_1")).toBeNull();
    expect(parseMenuAdminCallback("MTA1|M|???|0")).toBeNull();
  });

  it("menu keyboard exposes risky jobs only via a confirm step", () => {
    const buttons = buildOperatorMenuKeyboard().inline_keyboard.flat();
    const actions = buttons
      .filter((b): b is { text: string; callback_data: string } => "callback_data" in b)
      .map((b) => parseMenuAdminCallback(b.callback_data)?.action);
    expect(actions).toEqual(expect.arrayContaining(["queue", "status", "sync", "media", "close"]));
    expect(actions).not.toContain("sync_confirm");
    expect(actions).not.toContain("media_confirm");
    expect(buttons.some((b) => "url" in b && b.url.includes("admin.mywavetour.ru"))).toBe(true);
  });

  it("builds status summary with warnings", async () => {
    const text = await buildOperatorStatusText(new Date("2026-09-25T09:00:00.000Z"));
    expect(text).toContain("Опубликовано (актуальные): <b>12</b>");
    expect(text).toContain("Очередь публикации: <b>3</b>");
    expect(text).toContain("Кандидаты на проверку: <b>5</b>");
    expect(text).toContain("⚠️ 2");
    expect(text).toContain("Протухшие фото Telegram: 0");
  });
});
