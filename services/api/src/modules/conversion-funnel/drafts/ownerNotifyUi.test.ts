import { describe, expect, it } from "vitest";
import { buildOwnerNotifyUi } from "./ownerNotifyUi";

describe("buildOwnerNotifyUi", () => {
  const t0 = new Date("2026-01-15T12:00:00Z");

  it("sent when ownerNotifiedAt set", () => {
    const u = buildOwnerNotifyUi({
      ownerNotifiedAt: t0,
      ownerNotifyLastAttemptAt: t0,
      ownerNotifyLastError: null,
    });
    expect(u.ownerNotifyStatus).toBe("sent");
    expect(u.ownerNotifyErrorSnippet).toBeNull();
  });

  it("failed when error without success", () => {
    const u = buildOwnerNotifyUi({
      ownerNotifiedAt: null,
      ownerNotifyLastAttemptAt: t0,
      ownerNotifyLastError: "telegram_not_configured",
    });
    expect(u.ownerNotifyStatus).toBe("failed");
    expect(u.ownerNotifyErrorSnippet).toContain("telegram");
  });

  it("pending when no attempt data", () => {
    const u = buildOwnerNotifyUi({
      ownerNotifiedAt: null,
      ownerNotifyLastAttemptAt: null,
      ownerNotifyLastError: null,
    });
    expect(u.ownerNotifyStatus).toBe("pending");
  });
});
