import { describe, expect, it, vi } from "vitest";
import { tryAcquireManualRunSlot } from "./manualRunRateLimit";

describe("tryAcquireManualRunSlot", () => {
  it("пропускает первый вызов", () => {
    const key = `a-${Math.random()}`;
    expect(tryAcquireManualRunSlot(key, 10_000).ok).toBe(true);
  });

  it("блокирует повтор в пределах интервала", () => {
    const key = `b-${Math.random()}`;
    expect(tryAcquireManualRunSlot(key, 60_000).ok).toBe(true);
    const second = tryAcquireManualRunSlot(key, 60_000);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.retryAfterMs).toBeGreaterThan(0);
      expect(second.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it("после интервала снова разрешает", () => {
    vi.useFakeTimers();
    const key = `c-${Math.random()}`;
    expect(tryAcquireManualRunSlot(key, 1000).ok).toBe(true);
    expect(tryAcquireManualRunSlot(key, 1000).ok).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(tryAcquireManualRunSlot(key, 1000).ok).toBe(true);
    vi.useRealTimers();
  });

  it("при minIntervalMs <= 0 не ограничивает", () => {
    const key = `d-${Math.random()}`;
    expect(tryAcquireManualRunSlot(key, 0).ok).toBe(true);
    expect(tryAcquireManualRunSlot(key, 0).ok).toBe(true);
  });
});
