import { afterEach, describe, expect, it, vi } from "vitest";
import { extractDatesByPriority, extractManualPostLinks, extractPrice } from "./service";
import { formatManualPostReply } from "../telegram/telegramApprovalHandler";

const CAMP_POST = [
  "Вейк-кемп в Казахстане 27.09–03.10",
  "Капчагайское водохранилище, Алматы.",
  "Вейксёрф каждый день, проживание и трансфер включены. Стоимость от 1200$.",
  "https://www.instagram.com/vitaly_official/",
].join("\n");

describe("extractManualPostLinks", () => {
  it("находит Instagram-профиль организатора", () => {
    expect(extractManualPostLinks(CAMP_POST)).toEqual({
      instagramHandle: "vitaly_official",
      firstUrl: "https://www.instagram.com/vitaly_official/",
    });
  });

  it("ссылку на пост не считает профилем, но оставляет как источник", () => {
    const links = extractManualPostLinks("Кемп https://www.instagram.com/p/ABC123/ даты 01.10–05.10");
    expect(links.instagramHandle).toBeNull();
    expect(links.firstUrl).toBe("https://www.instagram.com/p/ABC123/");
  });

  it("текст без ссылок", () => {
    expect(extractManualPostLinks("Просто текст")).toEqual({ instagramHandle: null, firstUrl: null });
  });
});

describe("разбор текста кемпа", () => {
  it("достаёт цену в долларах", () => {
    expect(extractPrice(CAMP_POST)).toEqual({ priceFrom: 1200, currency: "USD" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const day = (date: Date | null) => date?.toISOString().slice(0, 10);

  it("достаёт диапазон дат без года (27.09–03.10)", () => {
    vi.useFakeTimers({ now: new Date("2026-09-27T09:00:00Z") });
    const dates = extractDatesByPriority([CAMP_POST], null);
    expect(day(dates.startDate)).toBe("2026-09-27");
    expect(day(dates.endDate)).toBe("2026-10-03");
  });

  it("текст реального поста: даты словами и цена сетов раньше цены билетов", () => {
    vi.useFakeTimers({ now: new Date("2026-09-20T09:00:00Z") });
    const post = [
      "Даты кемпа с 27 сентября по 3 октября:",
      "5 сетов по 25 мин с тренировкой - 1200$",
      "10 сетов по 25 мин с тренировкой - 1900$",
      "Доплата за одноместное размещение 250$.",
      "Билеты из Москвы сейчас от 39000 р. туда-обратно.",
    ].join("\n");
    const dates = extractDatesByPriority([post], null);
    expect(day(dates.startDate)).toBe("2026-09-27");
    expect(day(dates.endDate)).toBe("2026-10-03");
    expect(extractPrice(post)).toEqual({ priceFrom: 1200, currency: "USD" });
  });

  it("диапазон через Новый год переносит конец на следующий год", () => {
    vi.useFakeTimers({ now: new Date("2026-10-01T09:00:00Z") });
    const dates = extractDatesByPriority(["Зимний кемп 28.12 - 05.01, Шрилан"], null);
    expect(day(dates.startDate)).toBe("2026-12-28");
    expect(day(dates.endDate)).toBe("2027-01-05");
  });

  it("даты с явным годом разбираются как раньше", () => {
    const dates = extractDatesByPriority(["Кемп 27.09.2027–03.10.2027"], null);
    expect(day(dates.startDate)).toBe("2027-09-27");
    expect(day(dates.endDate)).toBe("2027-10-03");
  });
});

describe("formatManualPostReply", () => {
  it("короткий текст — подсказка", () => {
    expect(formatManualPostReply({ kind: "too_short" })).toContain("пришлите текст поста");
  });

  it("созданный черновик — даты и ссылка на очередь публикации", () => {
    const text = formatManualPostReply({
      kind: "created",
      programId: "p1",
      title: "Вейк-кемп в Казахстане",
      startDate: new Date("2026-09-27T12:00:00Z"),
      endDate: new Date("2026-10-03T12:00:00Z"),
      region: "Алматы",
      sourceName: "vitaly_official",
    });
    expect(text).toContain("Черновик программы создан: Вейк-кемп в Казахстане");
    expect(text).toContain("27.09.2026 – 03.10.2026");
    expect(text).toContain("/check_publish");
  });
});
