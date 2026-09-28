import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({}));

vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));

import {
  detectRegion,
  extractDatesByPriority,
  extractEnduroRaceFields,
  extractExplicitRussianLocation,
  extractPrice,
  matchesLocationKeyword,
} from "./service";

function midday(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

describe("explicit location in post text", () => {
  const krasnodarSource = { country: "Russia", region: "Krasnodar" };

  it("extracts region and settlement in their common written forms", () => {
    expect(extractExplicitRussianLocation("VALEZHNIK – Пермский край, п. Павловский. Классы")).toMatchObject({
      region: "Пермский край",
      city: "Павловский",
    });
    expect(extractExplicitRussianLocation("старт: Тверская обл., г. Конаково")).toMatchObject({
      region: "Тверская область",
      city: "Конаково",
    });
    expect(extractExplicitRussianLocation("Краснодарский край, г. Горячий ключ")).toMatchObject({
      region: "Краснодарский край",
      city: "Горячий Ключ",
    });
    expect(extractExplicitRussianLocation("кемп в горах, Республика Алтай")).toMatchObject({
      region: "Республика Алтай",
      city: null,
    });
    expect(extractExplicitRussianLocation("катаемся всё лето")).toBeNull();
  });

  it("prefers the first place in a digest over a later Krasnodar mention and the source default", () => {
    const digest =
      "планируем выходные правильно 26-27 сентября valezhnik – пермский край, п. павловский 27 сентября прохват sharmax motors – краснодарский край, г. горячий ключ";
    expect(detectRegion(digest, krasnodarSource)).toEqual({
      country: "Russia",
      region: "Пермский край",
      city: "Павловский",
    });
  });

  it("keeps two-word settlements and rural settlement abbreviations from real enduro posts", () => {
    const cases: Array<[string, string, string]> = [
      ["10 октября 2026 – Зов предков. 5 лет Республика Татарстан, с. Набережные Моркваши Классы Железо", "Республика Татарстан", "Набережные Моркваши"],
      ["04 октября 2026 – Тропа ежа Свердловская обл., г. Новая Ляля Классы Золото", "Свердловская область", "Новая Ляля"],
      ["03 октября 2026 – Susanin Race Костромская обл., с.п. Бакшеевское Классы Хард Лайт", "Костромская область", "Бакшеевское"],
      ["26 сентября 2026 – VALEZHNIK Пермский край, п. Павловский Протяженность трека – 20-35 км.", "Пермский край", "Павловский"],
      ["17 октября 2026 – Супер-эндуро Краснодарский край, г. Абинск Олимпийская система парных заездов", "Краснодарский край", "Абинск"],
      ["03-04 октября Последний богатырь – Краснодарский край, г. Горячий ключ В поиске зацепа", "Краснодарский край", "Горячий Ключ"],
    ];
    for (const [text, region, city] of cases) {
      expect(extractExplicitRussianLocation(text)).toMatchObject({ region, city });
    }
  });

  it("strips the republic from an enduro race title", () => {
    expect(
      extractEnduroRaceFields(
        "17 октября 2026 – Чандарский хребет Республика Башкортостан, Нуримановский район Поистине самый хардовый трек",
      ),
    ).toMatchObject({ title: "Чандарский хребет", region: "Республика Башкортостан" });
  });

  it("does not find a location keyword inside another word", () => {
    expect(matchesLocationKeyword("участники получили призы", "чили")).toBe(false);
    expect(matchesLocationKeyword("поездка в чили", "чили")).toBe(true);
    expect(detectRegion("мы научили новичков, лучший отель рядом с трассой", krasnodarSource).region).toBe("Krasnodar");
    expect(detectRegion("республика башкортостан, нуримановский район. все получили медали", {})).toEqual({
      country: "Russia",
      region: "Республика Башкортостан",
      city: null,
    });
  });

  it("still falls back to the source region when the text names no place", () => {
    expect(detectRegion("регистрация открыта, взнос 2 500 р.", krasnodarSource)).toEqual({
      country: "Russia",
      region: "Krasnodar",
      city: null,
    });
  });
});

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

    it("reads an unlisted region straight from the post (Пермский край, п. Павловский)", () => {
      expect(
        extractEnduroRaceFields(
          "26 сентября 2026 – VALEZHNIK Пермский край, п. Павловский Протяженность трека – 20-35 км. Классы Хард Лайт Взнос – 2 500 р.",
        ),
      ).toEqual({
        title: "VALEZHNIK",
        country: "Russia",
        region: "Пермский край",
        city: "Павловский",
      });
    });

    it("parses the enduro entry fee written with the r. abbreviation", () => {
      expect(extractPrice("Взнос – 4 500 р. (до 23.08.2026)")).toEqual({ priceFrom: 4500, currency: "RUB" });
      expect(extractPrice("Взнос – 20 000 р.")).toEqual({ priceFrom: 20000, currency: "RUB" });
    });

    it("does not treat an insurance coverage limit as the participation price", () => {
      expect(extractPrice("Требования – мед. справка – страховка не менее 100 000 р.")).toEqual({
        priceFrom: null,
        currency: null,
      });
      expect(extractPrice("Взнос – 2 000 р. Страховка не менее 100 000 р.")).toEqual({
        priceFrom: 2000,
        currency: "RUB",
      });
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

    it("preserves a spoken shared-month range instead of treating its final day as a one-day event", () => {
      expect(
        extractDatesByPriority(["С 18 по 27 сентября 2026 года пройдёт фестиваль-соревнование «ПОТОК 2026»"], null),
      ).toEqual({
        startDate: midday(2026, 9, 18),
        endDate: midday(2026, 9, 27),
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
