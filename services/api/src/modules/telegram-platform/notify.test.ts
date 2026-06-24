import { describe, expect, it } from "vitest";
import type { Env } from "@mywave/config";
import { buildOpsMissingContactKeyboard, resolveTelegramPlatformOpsChatId } from "./notify";

describe("telegram-platform notify", () => {
  it("uses the real OPS chat/channel env before user ids", () => {
    const env = {
      TELEGRAM_PLATFORM_OPS_IDS: "510686579",
      TELEGRAM_ALERT_CHAT_ID: "-1003491522243",
      TELEGRAM_CHANNEL_CHAT_ID: "-1003491522243",
    } as Env;

    expect(resolveTelegramPlatformOpsChatId(env)).toBe("-1003491522243");
  });

  it("builds required OPS inline buttons for missing real organizer contact", () => {
    expect(buildOpsMissingContactKeyboard("lead_real")).toEqual({
      inline_keyboard: [
        [
          { text: "Взял в работу", callback_data: "mtops:claim:lead_real" },
          { text: "Связался вручную", callback_data: "mtops:manual_contacted:lead_real" },
        ],
        [
          { text: "Запросить контакт", callback_data: "mtops:request_contact:lead_real" },
          { text: "Нет контакта", callback_data: "mtops:no_contact:lead_real" },
        ],
      ],
    });
  });
});
