import { describe, expect, it } from "vitest";
import { strictEnabled, traceAuditFailsStrict } from "./traceAudit";

describe("ingestion trace audit helpers", () => {
  it("parses strict mode flags", () => {
    expect(strictEnabled("1")).toBe(true);
    expect(strictEnabled("true")).toBe(true);
    expect(strictEnabled("yes")).toBe(true);
    expect(strictEnabled("on")).toBe(true);
    expect(strictEnabled("0")).toBe(false);
    expect(strictEnabled("")).toBe(false);
    expect(strictEnabled(undefined)).toBe(false);
  });

  it("fails strict mode when published programs have incomplete lineage", () => {
    expect(traceAuditFailsStrict({ publishedProgramsWithoutFullTrace: 0 })).toBe(false);
    expect(traceAuditFailsStrict({ publishedProgramsWithoutFullTrace: 1 })).toBe(true);
  });
});
