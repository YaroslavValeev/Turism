import { describe, expect, it } from "vitest";
import { changedContentFields, lockedProgramFields, nextManualFields, withoutManualFields } from "./manualFields";

describe("changedContentFields", () => {
  it("ignores unchanged values, whitespace and non-content fields", () => {
    const existing = { title: "Кэмп", startDate: new Date("2026-10-01T00:00:00Z"), inclusions: null, isStarred: false };
    const data = { title: " Кэмп ", startDate: new Date("2026-10-01T00:00:00Z"), inclusions: "Яхта", isStarred: true };
    expect(changedContentFields(existing, data)).toEqual(["inclusions"]);
  });
});

describe("nextManualFields", () => {
  it("adds, dedupes and releases fields", () => {
    expect(nextManualFields(["title"], ["inclusions", "title"], ["title"])).toEqual(["inclusions"]);
  });
});

describe("lockedProgramFields / withoutManualFields", () => {
  it("locks admin-edited and AI-filled fields on re-ingestion", () => {
    const locked = lockedProgramFields({ manualFields: ["title"], aiEnrichment: { fields: ["inclusions", 1] } });
    expect(locked.sort()).toEqual(["inclusions", "title"]);
    expect(withoutManualFields({ title: "raw", inclusions: "raw", region: "Egypt" }, locked)).toEqual({ region: "Egypt" });
    expect(lockedProgramFields({ manualFields: [], aiEnrichment: null })).toEqual([]);
  });
});
