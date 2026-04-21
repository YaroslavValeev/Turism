import { describe, it, expect } from "vitest";
import { computeRewardDiscount } from "./rewardDiscount";

describe("computeRewardDiscount", () => {
  it("applies percent discount with floor rounding", () => {
    const r = computeRewardDiscount({ originalAmountRub: 10_000, reward: { valueType: "percent", value: 5 } });
    expect(r.applied).toBe(true);
    expect(r.discountAmountRub).toBe(500);
    expect(r.finalAmountRub).toBe(9_500);
  });

  it("applies fixed amount discount", () => {
    const r = computeRewardDiscount({ originalAmountRub: 10_000, reward: { valueType: "amount", value: 1500 } });
    expect(r.applied).toBe(true);
    expect(r.discountAmountRub).toBe(1500);
    expect(r.finalAmountRub).toBe(8500);
  });

  it("clamps discount not to exceed original", () => {
    const r = computeRewardDiscount({ originalAmountRub: 1000, reward: { valueType: "amount", value: 5000 } });
    expect(r.applied).toBe(true);
    expect(r.discountAmountRub).toBe(1000);
    expect(r.finalAmountRub).toBe(0);
  });

  it("clamps percent to 100", () => {
    const r = computeRewardDiscount({ originalAmountRub: 1000, reward: { valueType: "percent", value: 250 } });
    expect(r.discountAmountRub).toBe(1000);
    expect(r.finalAmountRub).toBe(0);
  });

  it("rejects zero original", () => {
    const r = computeRewardDiscount({ originalAmountRub: 0, reward: { valueType: "percent", value: 5 } });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("zero_original");
  });

  it("skips below min order", () => {
    const r = computeRewardDiscount({
      originalAmountRub: 500,
      reward: { valueType: "percent", value: 5 },
      minOrderRub: 1000,
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("below_min_order");
    expect(r.finalAmountRub).toBe(500);
  });

  it("rejects invalid type", () => {
    const r = computeRewardDiscount({
      originalAmountRub: 1000,
      reward: { valueType: "unknown", value: 5 },
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("invalid_type");
    expect(r.finalAmountRub).toBe(1000);
  });

  it("zero-discount case: percent=0", () => {
    const r = computeRewardDiscount({ originalAmountRub: 1000, reward: { valueType: "percent", value: 0 } });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("zero_discount");
    expect(r.finalAmountRub).toBe(1000);
  });

  it("never yields negative final", () => {
    const r = computeRewardDiscount({ originalAmountRub: 7, reward: { valueType: "amount", value: 99 } });
    expect(r.finalAmountRub).toBeGreaterThanOrEqual(0);
  });

  it("integer-only: rounds float inputs", () => {
    const r = computeRewardDiscount({
      originalAmountRub: 9999,
      reward: { valueType: "percent", value: 5.9 }, // округлится до 5
    });
    expect(r.applied).toBe(true);
    expect(r.discountAmountRub).toBe(Math.floor(9999 * 5 / 100));
  });
});
