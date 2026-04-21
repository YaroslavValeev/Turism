import { describe, expect, it } from "vitest";
import { signNotificationFeedbackToken, verifyNotificationFeedbackToken } from "./notificationFeedbackTokens";

describe("notificationFeedbackTokens", () => {
  const secret = "test-secret-at-least-32-characters-long!!";

  it("roundtrip sign/verify", () => {
    const payload = {
      j: "job1",
      s: "sub1",
      p: "prog1",
      e: "program_dates_updated",
      d: "dedupe:key:here",
      f: "positive" as const,
    };
    const tok = signNotificationFeedbackToken(secret, payload);
    expect(verifyNotificationFeedbackToken(secret, tok)).toEqual(payload);
  });

  it("неверный секрет", () => {
    const tok = signNotificationFeedbackToken(secret, {
      j: "j",
      s: "s",
      p: "p",
      e: "e",
      d: "d",
      f: "negative",
    });
    expect(verifyNotificationFeedbackToken("other-secret-also-32-chars-minimum!!!", tok)).toBeNull();
  });
});
