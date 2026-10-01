import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    telegramClick: { create: mocks.create, updateMany: mocks.updateMany },
    $transaction: mocks.transaction,
  },
}));

import {
  attachChannelPostId,
  buildChannelCtas,
  channelClickUrl,
  createTrackedChannelKeyboard,
  ctasToInlineKeyboard,
} from "./channelClicks";

const programUrl = "https://mywavetour.ru/program/p1?utm_source=telegram_channel";

describe("channelClicks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds canonical CTAs and hides «Задать вопрос» without a working address", () => {
    const ctas = buildChannelCtas({ programUrl });
    expect(ctas.map((c) => c.text)).toEqual(["Программа", "Оставить заявку"]);
    expect(ctas[0].url).toContain("utm_content=program");
    expect(ctas[1].url).toContain("utm_content=apply");
    expect(ctas[1].url.endsWith("#request")).toBe(true);

    const withAsk = buildChannelCtas({ programUrl, askUrl: "https://t.me/mywavetour_manager" });
    expect(withAsk.map((c) => c.key)).toEqual(["program", "ask", "apply"]);
    expect(buildChannelCtas({ programUrl, askUrl: "javascript:alert(1)" }).some((c) => c.key === "ask")).toBe(false);
  });

  it("returns no buttons for a non-public program URL", () => {
    expect(buildChannelCtas({ programUrl: "http://localhost:3000/program/p1" })).toEqual([]);
    expect(ctasToInlineKeyboard([])).toBeUndefined();
  });

  it("lays out program+ask in one row and apply as a wide button", () => {
    const kb = ctasToInlineKeyboard(buildChannelCtas({ programUrl, askUrl: "https://t.me/x" }));
    expect(kb?.inline_keyboard.map((row) => row.map((b) => b.text))).toEqual([
      ["Программа", "Задать вопрос"],
      ["Оставить заявку"],
    ]);
  });

  it("wraps CTAs into tracked redirect links", async () => {
    mocks.transaction.mockResolvedValue([{ token: "tokprogram1" }, { token: "tokapply01" }]);
    const res = await createTrackedChannelKeyboard({
      apiBase: "https://api.mywavetour.ru/",
      programId: "p1",
      campaign: "program_publish",
      ctas: buildChannelCtas({ programUrl }),
    });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[1][0].data).toMatchObject({
      programId: "p1",
      campaign: "program_publish:apply",
      channel: "telegram_channel",
    });
    expect(res.clickTokens).toEqual(["tokprogram1", "tokapply01"]);
    expect(res.replyMarkup?.inline_keyboard.flat().map((b) => b.url)).toEqual([
      channelClickUrl("https://api.mywavetour.ru", "tokprogram1"),
      "https://api.mywavetour.ru/public/tg/c/tokapply01",
    ]);
  });

  it("falls back to direct links when the API is local or the DB fails", async () => {
    const ctas = buildChannelCtas({ programUrl });
    const local = await createTrackedChannelKeyboard({ apiBase: "http://localhost:3001", programId: "p1", campaign: "c", ctas });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(local.replyMarkup?.inline_keyboard[0][0].url).toBe(ctas[0].url);

    mocks.transaction.mockRejectedValue(new Error("db down"));
    const failed = await createTrackedChannelKeyboard({ apiBase: "https://api.mywavetour.ru", programId: "p1", campaign: "c", ctas });
    expect(failed.clickTokens).toEqual([]);
    expect(failed.replyMarkup?.inline_keyboard[0][0].url).toBe(ctas[0].url);
  });

  it("attaches the channel message id only when known", async () => {
    await attachChannelPostId(["a"], undefined);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await attachChannelPostId(["a", "b"], 42);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { token: { in: ["a", "b"] } }, data: { sourcePostId: "42" } });
  });
});
