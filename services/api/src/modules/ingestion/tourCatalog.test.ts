import { describe, expect, it } from "vitest";
import {
  aiTourRawText,
  aiTourToNormalizedFields,
  extractPageImage,
  extractSameSiteLinks,
  htmlToPlainText,
  isLikelySameTour,
  parseExtractedTour,
  parsePickedLinks,
  titleSimilarity,
} from "./tourCatalog";

const baseTour = {
  isTour: true,
  title: "Восхождение на Авачинский вулкан",
  discipline: "trekking",
  region: "Камчатка",
  location: "Авачинский вулкан",
  durationDays: 3,
  priceFrom: "45 000",
  currency: "rub",
  scheduleType: "on_request",
  startDate: null,
  endDate: null,
  seasonFromMonth: 6,
  seasonToMonth: 9,
  yearRound: false,
  level: "intermediate",
  summary: "Трёхдневный поход с ночёвкой в базовом лагере.",
  audience: "Для тех, кто готов к перепаду высот.",
  inclusions: ["Гид", "Палатки", ""],
  exclusions: ["Перелёт"],
  itinerary: "День 1: заброска.",
};

describe("extractSameSiteLinks", () => {
  it("keeps same-site content links and drops utility pages, assets and foreign hosts", () => {
    const html = `
      <a href="/tours/avacha/">Авача <b>3 дня</b></a>
      <a href="https://www.example-tour.ru/tours/avacha">дубль</a>
      <a href="/contacts">Контакты</a>
      <a href="/files/price.pdf">Прайс</a>
      <a href="https://vk.com/club">VK</a>
      <a href="mailto:a@b.ru">почта</a>
      <a href="/tours/mutnovka?season=summer#top">Мутновка</a>`;
    const links = extractSameSiteLinks(html, "https://example-tour.ru/");
    expect(links.map((l) => l.url)).toEqual([
      "https://example-tour.ru/tours/avacha/",
      "https://example-tour.ru/tours/mutnovka?season=summer",
    ]);
    expect(links[0].text).toBe("Авача 3 дня");
  });
});

describe("page helpers", () => {
  it("strips scripts and menus, keeps visible text", () => {
    const text = htmlToPlainText("<nav>меню</nav><script>x()</script><h1>Тур</h1><p>Цена&nbsp;10&nbsp;000 ₽</p>");
    expect(text).toBe("Тур\nЦена 10 000 ₽");
  });

  it("resolves og:image against the page url", () => {
    expect(extractPageImage('<meta property="og:image" content="/img/a.jpg">', "https://t.ru/tours/x")).toBe("https://t.ru/img/a.jpg");
  });

  it("falls back to the first content image, skipping logos, icons and header images", () => {
    const html = `
      <header><img src="/upload/hero-header.jpg"></header>
      <img src="/images/logo.png"><img src="/icons/arrow.svg">
      <img data-src="/upload/tours/avacha-1.jpg?w=800" src="data:image/gif;base64,R0lG">`;
    expect(extractPageImage(html, "https://t.ru/tours/x")).toBe("https://t.ru/upload/tours/avacha-1.jpg?w=800");
    expect(extractPageImage("<p>без картинок</p>", "https://t.ru/tours/x")).toBeNull();
  });
});

describe("parsePickedLinks", () => {
  it("accepts only urls from the offered list", () => {
    const links = [{ url: "https://t.ru/tours/a", text: "A" }, { url: "https://t.ru/catalog", text: "Каталог" }];
    const picked = parsePickedLinks(
      { tours: ["https://t.ru/tours/a/", "https://evil.ru/x"], catalogPages: ["https://t.ru/catalog"] },
      links,
    );
    expect(picked).toEqual({ tours: ["https://t.ru/tours/a"], catalogPages: ["https://t.ru/catalog"] });
  });
});

describe("parseExtractedTour", () => {
  it("validates and coerces AI output", () => {
    const tour = parseExtractedTour(baseTour);
    expect(tour).toMatchObject({
      title: "Восхождение на Авачинский вулкан",
      priceFrom: 45000,
      currency: "RUB",
      scheduleType: "on_request",
      inclusions: ["Гид", "Палатки"],
    });
  });

  it("rejects non-tours and tours without title or region", () => {
    expect(parseExtractedTour({ ...baseTour, isTour: false })).toBeNull();
    expect(parseExtractedTour({ ...baseTour, region: "" })).toBeNull();
    expect(parseExtractedTour("nope")).toBeNull();
  });

  it("falls back to on_request when fixed dates are missing and maps unknown disciplines", () => {
    const tour = parseExtractedTour({ ...baseTour, scheduleType: "fixed", startDate: "июль", discipline: "rafting" });
    expect(tour?.scheduleType).toBe("on_request");
    expect(tour?.discipline).toBe("trekking");
  });
});

describe("aiTourToNormalizedFields", () => {
  const now = new Date("2026-10-01T09:00:00Z");

  it("season tour gets the next season window and keeps its own length", () => {
    const f = aiTourToNormalizedFields(parseExtractedTour(baseTour)!, now);
    expect(f.scheduleType).toBe("on_request");
    expect(f.seasonLabel).toBe("июнь–сентябрь");
    expect(f.startDate.toISOString().slice(0, 10)).toBe("2027-06-01");
    expect(f.endDate.toISOString().slice(0, 10)).toBe("2027-09-30");
    expect(f.durationDays).toBe(3);
    expect(f.suggestedInclusions).toBe("Гид\nПалатки");
  });

  it("tour without season is year-round", () => {
    const f = aiTourToNormalizedFields(parseExtractedTour({ ...baseTour, seasonFromMonth: null, seasonToMonth: null })!, now);
    expect(f.seasonLabel).toBe("круглый год");
    expect(f.startDate.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("fixed tour keeps its dates", () => {
    const f = aiTourToNormalizedFields(
      parseExtractedTour({ ...baseTour, scheduleType: "fixed", startDate: "2027-07-10", endDate: "2027-07-12", durationDays: null })!,
      now,
    );
    expect(f.scheduleType).toBe("fixed");
    expect(f.seasonLabel).toBeNull();
    expect(f.durationDays).toBe(3);
  });

  it("past fixed dates become the season of the same months", () => {
    const f = aiTourToNormalizedFields(
      parseExtractedTour({ ...baseTour, scheduleType: "fixed", startDate: "2026-05-28", endDate: "2026-06-06", durationDays: 10 })!,
      now,
    );
    expect(f.scheduleType).toBe("on_request");
    expect(f.seasonLabel).toBe("май–июнь");
    expect(f.startDate.toISOString().slice(0, 10)).toBe("2027-05-01");
    expect(f.durationDays).toBe(10);
  });

  it("a season-long fixed range is a season, not tour dates", () => {
    const f = aiTourToNormalizedFields(
      parseExtractedTour({ ...baseTour, scheduleType: "fixed", startDate: "2027-01-01", endDate: "2027-04-30", durationDays: 7 })!,
      now,
    );
    expect(f.scheduleType).toBe("on_request");
    expect(f.seasonLabel).toBe("январь–апрель");
    expect(f.durationDays).toBe(7);
  });

  it("a twelve-month season is year-round", () => {
    const f = aiTourToNormalizedFields(parseExtractedTour({ ...baseTour, seasonFromMonth: 1, seasonToMonth: 12 })!, now);
    expect(f.seasonLabel).toBe("круглый год");
  });

  it("raw text is built only from extracted facts", () => {
    const text = aiTourRawText(parseExtractedTour(baseTour)!);
    expect(text).toContain("Входит:\n- Гид\n- Палатки");
    expect(text).toContain("Не входит:\n- Перелёт");
  });
});

describe("titleSimilarity", () => {
  it("matches reordered titles and separates different tours", () => {
    expect(titleSimilarity("Восхождение на Авачинский вулкан", "Авачинский вулкан: восхождение за 1 день")).toBeGreaterThanOrEqual(0.75);
    expect(titleSimilarity("Восхождение на Авачинский вулкан", "Сплав по реке Быстрая")).toBe(0);
  });
});

describe("isLikelySameTour", () => {
  it("does not merge tours that differ by one key word", () => {
    const a = { title: "Заброски на Мутновский вулкан на снегоходах", durationDays: null };
    const b = { title: "Заброски на Горелый вулкан на снегоходах", durationDays: null };
    expect(isLikelySameTour(a, b)).toBe(false);
    expect(
      isLikelySameTour(
        { title: "Маячный на снегоходах", durationDays: 1 },
        { title: "Маячный на джипах", durationDays: 1 },
      ),
    ).toBe(false);
  });

  it("treats different durations as different tours", () => {
    expect(isLikelySameTour({ title: "Толбачик", durationDays: 4 }, { title: "Толбачик", durationDays: 6 })).toBe(false);
    expect(isLikelySameTour({ title: "Восхождение на Авачинский вулкан", durationDays: 1 }, { title: "Авачинский вулкан: восхождение", durationDays: null })).toBe(true);
  });
});
