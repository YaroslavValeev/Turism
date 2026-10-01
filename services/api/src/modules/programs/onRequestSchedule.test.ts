import { describe, expect, it } from "vitest";
import {
  formatOnRequestLabel,
  formatSeasonMonthsRu,
  rollWindowForward,
  seasonWindow,
  yearRoundWindow,
} from "./onRequestSchedule";

const d = (iso: string) => new Date(iso);
const day = (value: Date) => value.toISOString().slice(0, 10);

describe("rollWindowForward", () => {
  it("не трогает окно, которое ещё не закончилось", () => {
    expect(rollWindowForward(d("2026-06-01T12:00:00Z"), d("2026-10-01T12:00:00Z"), d("2026-10-01T08:00:00Z"))).toBeNull();
  });

  it("переносит прошедшее окно на ближайший год", () => {
    const rolled = rollWindowForward(d("2024-06-01T12:00:00Z"), d("2024-09-30T12:00:00Z"), d("2026-10-01T08:00:00Z"));
    expect(rolled && day(rolled.startDate)).toBe("2027-06-01");
    expect(rolled && day(rolled.endDate)).toBe("2027-09-30");
  });
});

describe("seasonWindow", () => {
  it("берёт текущий сезон, пока он не закончился", () => {
    const w = seasonWindow(6, 10, d("2026-10-01T08:00:00Z"));
    expect([day(w.startDate), day(w.endDate)]).toEqual(["2026-06-01", "2026-10-31"]);
  });

  it("берёт следующий сезон после окончания текущего", () => {
    const w = seasonWindow(6, 9, d("2026-10-01T08:00:00Z"));
    expect([day(w.startDate), day(w.endDate)]).toEqual(["2027-06-01", "2027-09-30"]);
  });

  it("понимает сезон через Новый год", () => {
    const w = seasonWindow(12, 4, d("2026-10-01T08:00:00Z"));
    expect([day(w.startDate), day(w.endDate)]).toEqual(["2026-12-01", "2027-04-30"]);
    const inside = seasonWindow(12, 4, d("2027-02-10T08:00:00Z"));
    expect([day(inside.startDate), day(inside.endDate)]).toEqual(["2026-12-01", "2027-04-30"]);
  });
});

describe("подписи", () => {
  it("круглый год — окно на 12 месяцев", () => {
    const w = yearRoundWindow(d("2026-10-01T08:00:00Z"));
    expect([day(w.startDate), day(w.endDate)]).toEqual(["2026-10-01", "2027-09-30"]);
  });

  it("формирует подпись сезона", () => {
    expect(formatSeasonMonthsRu(6, 9)).toBe("июнь–сентябрь");
    expect(formatOnRequestLabel("июнь–сентябрь")).toBe("По запросу · сезон июнь–сентябрь");
    expect(formatOnRequestLabel("круглый год")).toBe("По запросу · круглый год");
    expect(formatOnRequestLabel(null)).toBe("По запросу");
  });
});
