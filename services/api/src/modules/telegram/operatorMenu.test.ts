import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callTelegramJson: vi.fn(),
  findManyPrograms: vi.fn(),
  findUniqueProgram: vi.fn(),
  updateProgram: vi.fn(),
  writeAuditLog: vi.fn(),
  runDedupJob: vi.fn(),
  runNormalizationJob: vi.fn(),
  runSourceCollection: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    program: {
      findMany: mocks.findManyPrograms,
      findUnique: mocks.findUniqueProgram,
      update: mocks.updateProgram,
    },
  },
}));
vi.mock("../../lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("../ingestion/service", () => ({
  runDedupJob: mocks.runDedupJob,
  runNormalizationJob: mocks.runNormalizationJob,
  runSourceCollection: mocks.runSourceCollection,
}));
vi.mock("../analytics/service", () => ({ emitBackendAnalyticsEventBestEffort: vi.fn() }));
vi.mock("./telegramApi", () => ({ callTelegramJson: mocks.callTelegramJson }));
import {
  handleTelegramOperatorCallback,
  isTelegramOperator,
  parseOperatorCallback,
} from "./operatorMenu";

const env = {
  TELEGRAM_CONTENT_OWNER_CHAT_ID: "-1003491522243",
  TELEGRAM_SOURCE_PROPOSAL_USER_IDS: "510686579",
} as unknown as import("@mywave/config").Env;

describe("telegram operator menu contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callTelegramJson.mockResolvedValue({ ok: true });
  });

  it("accepts only an allowlisted user in the configured owner chat", () => {
    expect(isTelegramOperator(env, -1003491522243, 510686579)).toBe(true);
    expect(isTelegramOperator(env, -1003491522243, 1)).toBe(false);
    expect(isTelegramOperator(env, 1, 510686579)).toBe(false);
  });

  it("parses source run and status controls without a publish callback", () => {
    expect(parseOperatorCallback("mw:run:cmabc123")).toEqual({ kind: "source_run", sourceId: "cmabc123" });
    expect(parseOperatorCallback("mw:os:cmabc123:v")).toEqual({
      kind: "organizer_status",
      organizerId: "cmabc123",
      status: "verified",
    });
    expect(parseOperatorCallback("mw:ps:cmabc123:a")).toEqual({
      kind: "program_status",
      programId: "cmabc123",
      status: "approved",
    });
    expect(parseOperatorCallback("mw:ps:cmabc123:z")).toBeNull();
    expect(parseOperatorCallback("mw:ps:cmabc123:published")).toBeNull();
  });

  it("sends only editable programs with Telegram-safe labels", async () => {
    mocks.findManyPrograms.mockResolvedValue([
      {
        id: "cmprogram123",
        title: `Очень длинное название\nпрограммы ${"🏄".repeat(40)}`,
        publishStatus: "archived",
      },
    ]);

    await expect(handleTelegramOperatorCallback(env, {
      id: "callback-programs",
      from: { id: 510686579 },
      message: { chat: { id: -1003491522243 } },
      data: "mw:programs",
    })).resolves.toBe(true);

    expect(mocks.findManyPrograms).toHaveBeenCalledWith({
      where: { publishStatus: { not: "published" } },
      select: { id: true, title: true, publishStatus: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });
    expect(mocks.callTelegramJson).toHaveBeenNthCalledWith(1, env, "answerCallbackQuery", {
      callback_query_id: "callback-programs",
    });

    const sendBody = mocks.callTelegramJson.mock.calls[1]?.[2] as {
      chat_id: string;
      text: string;
      reply_markup: {
        inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
      };
    };
    const programButton = sendBody.reply_markup.inline_keyboard[0][0];
    expect(sendBody.chat_id).toBe("-1003491522243");
    expect(sendBody.text).toContain("Выберите программу");
    expect(programButton.callback_data).toBe("mw:program:cmprogram123");
    expect(programButton.text).toContain("В архиве");
    expect(programButton.text).not.toMatch(/[\r\n\u0000-\u001f\u007f-\u009f]/);
    expect(Array.from(programButton.text).length).toBeLessThanOrEqual(56);
    expect(sendBody.reply_markup.inline_keyboard.at(-1)).toEqual([
      { text: "← Меню", callback_data: "mw:menu" },
    ]);
    expect(mocks.updateProgram).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    expect(mocks.runSourceCollection).not.toHaveBeenCalled();
    expect(mocks.runNormalizationJob).not.toHaveBeenCalled();
    expect(mocks.runDedupJob).not.toHaveBeenCalled();
  });

  it("shows the localized current program status without changing data", async () => {
    mocks.findUniqueProgram.mockResolvedValue({
      id: "cmprogram123",
      title: "Тестовая программа",
      publishStatus: "needs_fix",
    });

    await expect(handleTelegramOperatorCallback(env, {
      id: "callback-program",
      from: { id: 510686579 },
      message: { chat: { id: -1003491522243 } },
      data: "mw:program:cmprogram123",
    })).resolves.toBe(true);

    expect(mocks.findUniqueProgram).toHaveBeenCalledWith({
      where: { id: "cmprogram123" },
      select: { id: true, title: true, publishStatus: true },
    });
    const sendBody = mocks.callTelegramJson.mock.calls[1]?.[2] as {
      text: string;
      reply_markup: {
        inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
      };
    };
    expect(sendBody.text).toBe("Тестовая программа\nТекущий статус: Доработать");
    expect(sendBody.reply_markup.inline_keyboard.flat().map((button) => button.text)).not.toContain("Доработать");
    expect(mocks.updateProgram).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("surfaces Telegram sendMessage errors instead of hiding them", async () => {
    mocks.findManyPrograms.mockResolvedValue([]);
    mocks.callTelegramJson
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, description: "Bad Request: reply markup rejected" });

    await expect(handleTelegramOperatorCallback(env, {
      id: "callback-programs",
      from: { id: 510686579 },
      message: { chat: { id: -1003491522243 } },
      data: "mw:programs",
    })).rejects.toThrow("Telegram sendMessage failed: Bad Request: reply markup rejected");
  });
});
