import { describe, expect, it } from "vitest";
import { subscriptionMatchesProgramForEvent } from "./subscriptionMatch";

describe("subscriptionMatchesProgramForEvent", () => {
  const program = {
    discipline: "Wakesurf",
    region: "Krasnodar",
    startDate: new Date(Date.UTC(2026, 6, 10)),
  };

  it("seasonal + upcoming: пустые filters — матч", () => {
    expect(subscriptionMatchesProgramForEvent("seasonal", "program_upcoming_start", {}, program)).toBe(true);
  });

  it("seasonal: дисциплина по подстроке", () => {
    expect(subscriptionMatchesProgramForEvent("seasonal", "program_upcoming_start", { discipline: "wake" }, program)).toBe(
      true,
    );
  });

  it("seasonal: другая дисциплина — нет", () => {
    expect(subscriptionMatchesProgramForEvent("seasonal", "program_upcoming_start", { discipline: "MTB" }, program)).toBe(
      false,
    );
  });

  it("program_updates + dates_updated", () => {
    expect(subscriptionMatchesProgramForEvent("program_updates", "program_dates_updated", { region: "kras" }, program)).toBe(
      true,
    );
  });

  it("неверная пара type/event", () => {
    expect(subscriptionMatchesProgramForEvent("seasonal", "program_dates_updated", {}, program)).toBe(false);
  });
});
