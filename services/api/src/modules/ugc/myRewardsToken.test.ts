import { describe, it, expect } from "vitest";
import { signMyRewardsToken, verifyMyRewardsToken } from "./ugcTokens";

const SECRET = "test-secret-my-rewards-1234567890";

describe("signMyRewardsToken / verifyMyRewardsToken", () => {
  it("round-trips email", () => {
    const t = signMyRewardsToken(SECRET, { email: "Alice@Example.com", userId: null });
    const v = verifyMyRewardsToken(SECRET, t);
    expect(v).toEqual({ email: "alice@example.com", userId: null });
  });

  it("round-trips userId", () => {
    const t = signMyRewardsToken(SECRET, { email: null, userId: "u_123" });
    expect(verifyMyRewardsToken(SECRET, t)).toEqual({ email: null, userId: "u_123" });
  });

  it("requires at least one of email/userId", () => {
    expect(() => signMyRewardsToken(SECRET, { email: null, userId: null })).toThrow();
  });

  it("rejects token signed by another secret", () => {
    const t = signMyRewardsToken(SECRET, { email: "a@b.com", userId: null });
    expect(verifyMyRewardsToken("other-secret", t)).toBeNull();
  });

  it("rejects token of wrong purpose", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const fake = jwt.sign({ e: "a@b.com", u: null, pr: "ugc_submit" }, SECRET, { expiresIn: "7d" });
    expect(verifyMyRewardsToken(SECRET, fake)).toBeNull();
  });

  it("rejects expired token", async () => {
    const t = signMyRewardsToken(SECRET, { email: "a@b.com", userId: null, expiresIn: -1 });
    // токен с отрицательным TTL невалиден сразу
    expect(verifyMyRewardsToken(SECRET, t)).toBeNull();
  });

  it("rejects token without email or userId in payload", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const fake = jwt.sign({ e: null, u: null, pr: "my_rewards" }, SECRET, { expiresIn: "7d" });
    expect(verifyMyRewardsToken(SECRET, fake)).toBeNull();
  });
});
