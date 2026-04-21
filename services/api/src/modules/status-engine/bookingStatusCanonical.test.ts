import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveBookingStatus } from "../billing/deriveBookingStatus";
import { ADR007_BOOKING_STATUS_WRITE_MODULE_SUFFIXES } from "./bookingStatusWriteCanonical";

/** __dirname доступен при компиляции в CommonJS (services/api/tsconfig). */
const apiSrcRoot = join(__dirname, "..", "..");

describe("ADR-007 canonical booking status writers (regression)", () => {
  it("allowlist module paths exist under services/api/src", () => {
    for (const suffix of ADR007_BOOKING_STATUS_WRITE_MODULE_SUFFIXES) {
      const p = join(apiSrcRoot, suffix);
      expect(() => readFileSync(p, "utf8")).not.toThrow();
    }
  });

  it("deriveBookingStatus stable for billing-derived edge pairs", () => {
    expect(deriveBookingStatus(0, 0)).toBe("created");
    expect(deriveBookingStatus(100, 0)).toBe("paid_full");
    expect(deriveBookingStatus(100, 100)).toBe("refunded_full");
    expect(deriveBookingStatus(100, 40)).toBe("refunded_partial");
  });
});
