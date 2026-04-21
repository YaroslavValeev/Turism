import { describe, expect, it } from "vitest";
import { inclusiveDurationDaysUTC } from "@mywave/shared-types";
import {
  DURATION_DAYS_READ_ONLY_MESSAGE,
  evaluateDurationDaysInPatchBody,
  mergeDatesAndComputeDurationDays,
} from "./patchProgramDates";

describe("evaluateDurationDaysInPatchBody", () => {
  it("отклоняет PATCH только с durationDays", () => {
    expect(evaluateDurationDaysInPatchBody({ durationDays: 5 })).toEqual({ kind: "reject_only_duration" });
  });

  it("игнорирует durationDays, если есть даты", () => {
    expect(evaluateDurationDaysInPatchBody({ durationDays: 99, startDate: "2026-06-01" })).toEqual({
      kind: "ignore_client_duration",
    });
    expect(evaluateDurationDaysInPatchBody({ durationDays: 99, endDate: "2026-06-03" })).toEqual({
      kind: "ignore_client_duration",
    });
  });

  it("разрешает PATCH без durationDays", () => {
    expect(evaluateDurationDaysInPatchBody({ title: "x" })).toEqual({ kind: "ok" });
    expect(evaluateDurationDaysInPatchBody({ startDate: "2026-06-01" })).toEqual({ kind: "ok" });
  });
});

describe("mergeDatesAndComputeDurationDays", () => {
  const existing = {
    startDate: new Date("2026-06-10T00:00:00.000Z"),
    endDate: new Date("2026-06-12T00:00:00.000Z"),
  };

  it("пересчитывает при только startDate", () => {
    const r = mergeDatesAndComputeDurationDays(existing, { startDate: new Date("2026-06-11T00:00:00.000Z") });
    expect("durationDays" in r && r.durationDays).toBe(2);
  });

  it("пересчитывает при только endDate", () => {
    const r = mergeDatesAndComputeDurationDays(existing, { endDate: new Date("2026-06-14T00:00:00.000Z") });
    expect("durationDays" in r && r.durationDays).toBe(5);
  });

  it("пересчитывает при обеих датах", () => {
    const r = mergeDatesAndComputeDurationDays(existing, {
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-01T00:00:00.000Z"),
    });
    expect("durationDays" in r && r.durationDays).toBe(1);
  });

  it("возвращает ошибку при end < start", () => {
    const r = mergeDatesAndComputeDurationDays(existing, { endDate: new Date("2026-06-09T00:00:00.000Z") });
    expect("error" in r).toBe(true);
  });
});

describe("inclusiveDurationDaysUTC (shared-types)", () => {
  it("совпадает с ожиданием включительных дней", () => {
    expect(
      inclusiveDurationDaysUTC(new Date("2026-01-01T12:00:00.000Z"), new Date("2026-01-03T12:00:00.000Z")),
    ).toBe(3);
  });

  it("бросает при end до start", () => {
    expect(() =>
      inclusiveDurationDaysUTC(new Date("2026-01-05T00:00:00.000Z"), new Date("2026-01-04T00:00:00.000Z")),
    ).toThrow();
  });
});

describe("DURATION_DAYS_READ_ONLY_MESSAGE", () => {
  it("стабильная строка для контракта API", () => {
    expect(DURATION_DAYS_READ_ONLY_MESSAGE).toContain("durationDays");
    expect(DURATION_DAYS_READ_ONLY_MESSAGE).toContain("startDate");
  });
});
