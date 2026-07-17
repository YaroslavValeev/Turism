import { describe, expect, it } from "vitest";
import { parseDeeplinkPayload } from "./deeplink";

describe("parseDeeplinkPayload", () => {
  it("parses program_<id>", () => {
    const p = parseDeeplinkPayload("program_clx1234567890abcd");
    expect(p?.kind).toBe("program");
    expect(p?.programId).toBe("clx1234567890abcd");
  });

  it("parses apply_<id>", () => {
    const p = parseDeeplinkPayload("apply_clx1234567890abcd");
    expect(p?.kind).toBe("apply");
    expect(p?.programId).toBe("clx1234567890abcd");
  });

  it("parses lead_<token>", () => {
    const p = parseDeeplinkPayload("lead_a1b2c3d4e5f6789012345678abcdef");
    expect(p?.kind).toBe("lead");
    expect(p?.leadToken).toBe("a1b2c3d4e5f6789012345678abcdef");
  });

  it("returns unknown for garbage", () => {
    const p = parseDeeplinkPayload("???");
    expect(p?.kind).toBe("unknown");
  });
});
