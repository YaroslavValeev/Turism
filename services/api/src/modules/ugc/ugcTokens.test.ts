import { describe, it, expect } from "vitest";
import { signUgcSubmitToken, verifyUgcSubmitToken } from "./ugcTokens";

const SECRET = "test-ugc-secret-value-0123456789";

describe("ugcTokens", () => {
  it("подписывает и верифицирует корректный payload", () => {
    const token = signUgcSubmitToken(SECRET, {
      requestId: "req_1",
      bookingId: "bk_1",
      programId: "pg_1",
    });
    expect(typeof token).toBe("string");
    const decoded = verifyUgcSubmitToken(SECRET, token);
    expect(decoded).toEqual({ requestId: "req_1", bookingId: "bk_1", programId: "pg_1" });
  });

  it("отклоняет токен, подписанный другим секретом", () => {
    const token = signUgcSubmitToken(SECRET, {
      requestId: "req_1",
      bookingId: "bk_1",
      programId: "pg_1",
    });
    expect(verifyUgcSubmitToken("other-secret", token)).toBeNull();
  });

  it("отклоняет мусорный токен", () => {
    expect(verifyUgcSubmitToken(SECRET, "not-a-jwt")).toBeNull();
  });
});
