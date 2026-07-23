import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({}));

vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));

import { extractDatesByPriority, extractEnduroRaceFields, extractPrice, matchesLocationKeyword } from "./service";

function midday(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

describe("ingestion semantic normalization signals", () => {
  describe("enduro race announcement fields", () => {
    it("keeps the Uzbekistan race out of the generic Russia fallback", () => {
      expect(
        extractEnduroRaceFields(
          "08-09 августа 2026 – UZBEKISTAN ENDURO CUP Республика Узбекистан, Ташкентская обл., г. Ахангаран Классы – один класс по системе Взнос – 20 000 р.",
        ),
      ).toEqual({
        title: "UZBEKISTAN ENDURO CUP",
        country: "Uzbekistan",
        region: "Ташкентская область",
        city: "Ахангаран",
      });
    });

    it("uses the exact Belokurikha location before the broad Altai signal", () => {
      expect(
        extractEnduroRaceFields(
          "26-27 сентября 2026 – Эволюция Алтайский край, г. Белокуриха Классы Золото Серебро Бронза Взнос – 15 000 р.",
        ),
      ).toEqual({
        title: "Эволюция",
        country: "Russia",
        region: "Алтайский край",
        city: "Белокуриха",
      });
    });

    it("parses the enduro entry fee written with the r. abbreviation", () => {
      expect(extractPrice("Взнос – 4 500 р. (до 23.08.2026)")).toEqual({ priceFrom: 4500, currency: "RUB" });
      expect(extractPrice("Взнос – 20 000 р.")).toEqual({ priceFrom: 20000, currency: "RUB" });
    });

    it("does not treat a date as a price without a currency token", () => {
      expect(extractPrice("26-27 сентября 2026 – Эволюция")).toEqual({ priceFrom: null, currency: null });
    });
  });

  describe("date source priority", () => {
    it.each([
      {
        title: "08 августа 2026 – Grand Enduro Sprint: 2-й этап",
        body: "Регистрация участников обязательна (до 03.08.2026).",
      },
      {
        title: "08 августа 2026 – Суперэндуро Республика Беларусь",
        body: "Регистрация с 24.07.2026.",
      },
      {
        title: "08 августа 2026 – Грязный бурундук: 2-й этап",
        body: "Льготный стартовый взнос действует до 25.07.2026.",
      },
    ])("prefers the event date in $title over an earlier body date", ({ title, body }) => {
      expect(extractDatesByPriority([title, body], null)).toEqual({
        startDate: midday(2026, 8, 8),
        endDate: midday(2026, 8, 8),
      });
    });

    it("preserves an explicit title date range", () => {
      expect(extractDatesByPriority(["22-23 августа 2026 – Бурелом", "Регистрация с 1 августа 2026"], null)).toEqual({
        startDate: midday(2026, 8, 22),
        endDate: midday(2026, 8, 23),
      });
    });

    it("uses body dates when the title has no explicit date", () => {
      expect(extractDatesByPriority(["Большая эндуро гонка", "Старт 15 августа 2026"], null)).toEqual({
        startDate: midday(2026, 8, 15),
        endDate: midday(2026, 8, 15),
      });
    });

    it("uses body dates before earlier OCR dates instead of mixing fields", () => {
      expect(
        extractDatesByPriority(
          ["Большая эндуро гонка", "Старт 15 августа 2026", "Регистрация 1 августа 2026"],
          null,
        ),
      ).toEqual({
        startDate: midday(2026, 8, 15),
        endDate: midday(2026, 8, 15),
      });
    });

    it("uses OCR dates when title and body have no explicit date", () => {
      expect(extractDatesByPriority(["Большая эндуро гонка", "Подробности на афише", "Старт 9 августа 2026"], null)).toEqual({
        startDate: midday(2026, 8, 9),
        endDate: midday(2026, 8, 9),
      });
    });

    it("preserves a cross-month body range ahead of daily itinerary dates", () => {
      expect(
        extractDatesByPriority(
          [
            "Эндуро тур с проживанием в отеле",
            "29 сен - 05 окт 2026. 29 сентября заезд. 30 сентября тренировка. 1 октября первый маршрут. 5 октября выезд.",
          ],
          null,
        ),
      ).toEqual({
        startDate: midday(2026, 9, 29),
        endDate: midday(2026, 10, 5),
      });
    });

    it("uses a future publishedAt only when no field contains an explicit date", () => {
      const publishedAt = new Date("2035-01-02T09:30:00.000Z");

      expect(extractDatesByPriority(["Большая эндуро гонка", "Дата скоро"], publishedAt)).toEqual({
        startDate: publishedAt,
        endDate: publishedAt,
      });
    });

    it("does not use a past publishedAt as an event date", () => {
      expect(extractDatesByPriority(["Большая эндуро гонка", "Дата скоро"], new Date("2020-01-02T09:30:00.000Z"))).toEqual({
        startDate: null,
        endDate: null,
      });
    });
  });

  describe("location token boundaries", () => {
    it.each(["команда", "команды", "команде", "ландшафт", "Андрей", "андроид"])(
      "does not match the Chile stem inside %s",
      (text) => {
        expect(matchesLocationKeyword(text, "анд")).toBe(false);
      },
    );

    it.each([
      ["Маршрут через Анд", "анд"],
      ["Экспедиция в Анды", "анд"],
      ["Маршрут проходит в Андах", "анд"],
      ["Переход между Андами", "анд"],
      ["Культура народов Андов", "анд"],
      ["Camp in Chile", "chile"],
      ["Путешествие по Чили", "чили"],
      ["Patagonia expedition", "patagonia"],
    ])("matches a real location signal in %s", (text, keyword) => {
      expect(matchesLocationKeyword(text, keyword)).toBe(true);
    });

    it("does not classify the hotel fixture as Chile through an embedded stem", () => {
      const hotelText =
        'Лучший отель "Роза Ветров". Все гости будут жить в комфорте одного большого отеля вместе с командами и командой организаторов.';
      const chileKeywords = ["патагон", "patagonia", "chile", "чили", "andes", "анд", "altiplanico", "andino"];

      expect(chileKeywords.some((keyword) => matchesLocationKeyword(hotelText.toLowerCase(), keyword))).toBe(false);
    });
  });
});
