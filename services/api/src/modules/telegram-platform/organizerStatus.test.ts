import { describe, expect, it } from "vitest";
import { parseOrganizerLeadCallback } from "./organizerStatus";
import { parseReconciliationCallback } from "./reconciliation";
import { parseOpsLeadCallback } from "./opsLeadStatus";

describe("organizer callbacks", () => {
  it("parses L|work|token", () => {
    const p = parseOrganizerLeadCallback("L|work|a1b2c3d4e5f6789012345678abcdef");
    expect(p).toEqual({ action: "work", leadToken: "a1b2c3d4e5f6789012345678abcdef" });
  });

  it("parses R|booked|token", () => {
    const p = parseReconciliationCallback("R|booked|a1b2c3d4e5f6789012345678abcdef");
    expect(p).toEqual({ action: "booked", leadToken: "a1b2c3d4e5f6789012345678abcdef" });
  });

  it("parses O|ops_work|token", () => {
    const p = parseOpsLeadCallback("O|ops_work|a1b2c3d4e5f6789012345678abcdef");
    expect(p).toEqual({ action: "ops_work", leadToken: "a1b2c3d4e5f6789012345678abcdef" });
  });
});
