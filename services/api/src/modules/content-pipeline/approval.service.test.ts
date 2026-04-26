import { describe, expect, it } from "vitest";
import { encodeCallbackData, parseCallbackData } from "./approval.service";

describe("callback_data Telegram (≤64 bytes)", () => {
  it("roundtrip: publish", () => {
    const id = "cm3abcdefghijklmn1234567";
    const raw = encodeCallbackData("publish", id);
    expect(raw.length).toBeLessThanOrEqual(64);
    const p = parseCallbackData(raw);
    expect(p?.action).toBe("publish");
    expect(p?.draftId).toBe(id);
  });

  it("reject/skip/rewrite", () => {
    const id = "cm3x12345678901234567890";
    expect(parseCallbackData(encodeCallbackData("reject", id))?.action).toBe("reject");
    expect(parseCallbackData(encodeCallbackData("skip", id))?.action).toBe("skip");
    expect(parseCallbackData(encodeCallbackData("rewrite", id))?.action).toBe("rewrite");
  });
});
