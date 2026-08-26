import { describe, expect, it } from "vitest";
import {
  DEFAULT_PILOT_READINESS_THRESHOLDS,
  evaluatePilotReadiness,
  pilotReadinessFailsStrict,
  strictPilotReadinessEnabled,
  type PilotReadinessMetrics,
} from "./pilotReadinessAudit";

const readyMetrics: PilotReadinessMetrics = {
  publishedPrograms: 12,
  activeOrganizers: 3,
  completedBookings: 5,
  approvedReviews: 1,
};

describe("evaluatePilotReadiness", () => {
  it("passes the controlled pilot v1 business gate when all thresholds are met", () => {
    const audit = evaluatePilotReadiness(readyMetrics);

    expect(audit.ready).toBe(true);
    expect(audit.checks.every((check) => check.pass)).toBe(true);
    expect(audit.thresholds).toEqual(DEFAULT_PILOT_READINESS_THRESHOLDS);
  });

  it("fails when the catalog has not reached the minimum curated size", () => {
    const audit = evaluatePilotReadiness({ ...readyMetrics, publishedPrograms: 9 });

    expect(audit.ready).toBe(false);
    expect(audit.checks.find((check) => check.key === "published_programs_min")).toMatchObject({
      pass: false,
      actual: 9,
      expected: ">= 10",
    });
  });

  it("fails when the catalog expands past controlled pilot size", () => {
    const audit = evaluatePilotReadiness({ ...readyMetrics, publishedPrograms: 21 });

    expect(audit.ready).toBe(false);
    expect(audit.checks.find((check) => check.key === "published_programs_max")).toMatchObject({
      pass: false,
      actual: 21,
      expected: "<= 20",
    });
  });

  it("fails when organizer, booking, or review proof is missing", () => {
    const audit = evaluatePilotReadiness({
      publishedPrograms: 10,
      activeOrganizers: 2,
      completedBookings: 4,
      approvedReviews: 0,
    });

    expect(audit.ready).toBe(false);
    expect(audit.checks.filter((check) => !check.pass).map((check) => check.key)).toEqual([
      "active_organizers_min",
      "completed_bookings_min",
      "approved_reviews_present",
    ]);
  });
});

describe("pilot readiness strict mode", () => {
  it("parses enabled values", () => {
    expect(strictPilotReadinessEnabled("1")).toBe(true);
    expect(strictPilotReadinessEnabled("true")).toBe(true);
    expect(strictPilotReadinessEnabled("yes")).toBe(true);
    expect(strictPilotReadinessEnabled("on")).toBe(true);
    expect(strictPilotReadinessEnabled("0")).toBe(false);
    expect(strictPilotReadinessEnabled(undefined)).toBe(false);
  });

  it("fails strict mode when the audit is not ready", () => {
    expect(pilotReadinessFailsStrict({ ready: false })).toBe(true);
    expect(pilotReadinessFailsStrict({ ready: true })).toBe(false);
  });
});
