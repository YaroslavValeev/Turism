import { describe, expect, it } from "vitest";
import { validateBookingIntake } from "./intakeValidation";

const valid = { programId: "program-id", guestContact: "qa@example.invalid", legalConsent: true };

describe("booking intake validation", () => {
  it("rejects missing, array and primitive request bodies", () => {
    for (const body of [undefined, null, [], "text", 1, true, {}]) {
      expect(validateBookingIntake(body).ok).toBe(false);
    }
  });
  it("rejects empty contacts and identifiers, including Unicode whitespace", () => {
    for (const value of ["", "   ", "\t\n", "\u00a0\u2003"]) {
      expect(validateBookingIntake({ ...valid, guestContact: value }).ok).toBe(false);
      expect(validateBookingIntake({ ...valid, programId: value }).ok).toBe(false);
    }
  });
  it("rejects non-string identifiers and contacts before Prisma", () => {
    for (const value of [null, 123, true, [], {}]) {
      expect(validateBookingIntake({ ...valid, guestContact: value }).ok).toBe(false);
      expect(validateBookingIntake({ ...valid, programId: value }).ok).toBe(false);
    }
  });
  it("trims required strings and retains existing free-form contacts", () => {
    expect(validateBookingIntake({ ...valid, programId: " program-id ", guestContact: " Иван +7 (999) 123-45-67 " }))
      .toEqual({ ok: true, data: { ...valid, guestContact: "Иван +7 (999) 123-45-67" } });
  });
  it("uses the public form contact limit after trimming", () => {
    expect(validateBookingIntake({ ...valid, guestContact: " " + "a".repeat(254) + " " }).ok).toBe(true);
    expect(validateBookingIntake({ ...valid, guestContact: "a".repeat(255) }).ok).toBe(false);
  });
  it("accepts omitted/null optional text but rejects incorrect types", () => {
    for (const field of ["sourceChannel", "sourceCampaign", "notes", "entryType", "entryId", "utmSource", "utmMedium", "exploreType", "exploreSlug"]) {
      expect(validateBookingIntake({ ...valid, [field]: null })).toEqual({ ok: true, data: valid });
      expect(validateBookingIntake({ ...valid, [field]: "value" }).ok).toBe(true);
      for (const value of [1, true, [], {}]) expect(validateBookingIntake({ ...valid, [field]: value }).ok).toBe(false);
    }
  });
  it("leaves literal consent enforcement to the existing route", () => {
    for (const legalConsent of [undefined, null, false, "true", 1, true]) {
      expect(validateBookingIntake({ ...valid, legalConsent })).toEqual({ ok: true, data: { ...valid, legalConsent } });
    }
  });
  it("does not echo personal data in validation errors", () => {
    const result = validateBookingIntake({ ...valid, notes: ["private data"] });
    expect(result).toEqual({ ok: false, error: "notes must be a string" });
  });
});
