import { describe, expect, it } from "vitest";
import { validTelegramPollingUpdates } from "./telegramLongPolling";

describe("Telegram long polling update validation", () => {
  it("accepts message and callback updates without changing their payload", () => {
    const updates = [
      { update_id: 10, message: { message_id: 1, chat: { id: 9 }, text: "/ops" } },
      { update_id: 11, callback_query: { id: "cb", from: { id: 9 }, data: "next" } },
    ];
    expect(validTelegramPollingUpdates(updates)).toEqual(updates);
  });

  it("rejects malformed batches before they can advance the offset", () => {
    expect(() => validTelegramPollingUpdates({ update_id: 1 })).toThrow("non-array");
    expect(() => validTelegramPollingUpdates([{ update_id: -1 }])).toThrow("invalid update_id");
    expect(() => validTelegramPollingUpdates([{ update_id: Number.MAX_SAFE_INTEGER + 1 }])).toThrow("invalid update_id");
  });
});
