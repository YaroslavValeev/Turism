import { describe, expect, it } from "vitest";
import {
  buildEmailProgramNotifyHtml,
  buildEmailProgramNotifyText,
  buildTelegramChannelPostHtml,
  buildTelegramProgramNotifyHtml,
  bulletsFromFreeText,
  durationLabel,
  formatDateRangeRu,
  programRowToNotifySource,
} from "./programNotifyTemplates";

const baseSrc = () =>
  programRowToNotifySource({
    id: "p1",
    title: "Лагерь на Волге",
    discipline: "Wakesurf",
    region: "Самара",
    startDate: new Date("2031-07-01"),
    endDate: new Date("2031-07-10"),
    audienceFit: "Для тех, кто хочет прокачать старт\nДля компаний друзей",
    inclusions: "Проживание; инструктор; снаряжение",
    organizerName: "ООО Волна",
    organizer: { displayName: "Волна Кэмп" },
    levelRequired: "intermediate",
    cancellationRules: "Отмена за 14 дней — полный возврат.",
    medicalLimitations: null,
    whatHappensAfterBooking: null,
    formatType: "camp",
  });

describe("programNotifyTemplates", () => {
  it("bulletsFromFreeText splits lines and semicolons", () => {
    expect(bulletsFromFreeText("a\nb;c", 5, 100)).toEqual(["a", "b", "c"]);
  });

  it("telegram HTML contains structure and escaped title", () => {
    const html = buildTelegramProgramNotifyHtml(baseSrc(), "https://mywavetour.ru/program/p1");
    expect(html).toContain("<i>Новый вызов от Волна Кэмп</i>\n\n<b>Лагерь на Волге</b>\n\n");
    expect(html).toContain("📅 <b>1–10 июля 2031</b> · 10 дней");
    expect(html).toContain("📍 Самара · Вейксерф");
    expect(html).toContain("• Инструктор");
    expect(html).not.toContain("<b>Организатор</b>");
    expect(html).toContain("Для кого");
    expect(html).toContain("Открыть карточку");
    expect(html).not.toContain("<script");
  });

  it("telegram HTML hides placeholder organizer and unknown discipline", () => {
    const src = {
      ...baseSrc(),
      discipline: "Unknown",
      region: "Russia",
      location: "Алматы",
      organizerName: null,
      organizerDisplayName: "Ручной ввод (бот владельца)",
      startDate: new Date("2026-09-27T12:00:00Z"),
      endDate: new Date("2026-10-03T12:00:00Z"),
    };
    const html = buildTelegramProgramNotifyHtml(src, null, { hideLinkFallbackHint: true });
    expect(html.startsWith("<i>Новый вызов в MyWaveTour</i>")).toBe(true);
    expect(html).not.toContain("Ручной ввод");
    expect(html).not.toContain("Unknown");
    expect(html).toContain("📅 <b>27 сентября — 3 октября 2026</b> · 7 дней");
    expect(html).toContain("📍 Алматы, Россия");
  });

  it("channel post switches to compact variant to fit a photo caption", () => {
    const long = {
      ...baseSrc(),
      audienceFit: [
        "Новичкам — база и первые трюки. ".repeat(8),
        "Продвинутым — соревновательная программа. ".repeat(8),
        "Компаниям друзей — отдельный катер и гибкое расписание. ".repeat(4),
      ].join("\n"),
      inclusions: [
        "Проживание в гостинице в центре города на 6 ночей с завтраками. ".repeat(3),
        "Тренировки на катерах с инструктором каждый день по два сета. ".repeat(3),
        "Трансфер из аэропорта и обратно, а также до станции каждый день. ".repeat(3),
      ].join("\n"),
      organizerDisplayName: "Волна Кэмп — школа вейксёрфинга и вейкборда на Волге с инструкторами международной сертификации",
      cancellationRules: null,
    };
    const measure = (html: string) => html.replace(/<[^>]+>/g, "").length;
    const full = buildTelegramChannelPostHtml(long);
    expect(measure(full)).toBeGreaterThan(1024);
    expect(full).toContain("свяжется и подтвердит даты");
    const fitted = buildTelegramChannelPostHtml(long, { captionLimit: 1024, measure });
    expect(measure(fitted)).toBeLessThanOrEqual(1024);
    expect(fitted).toContain("<b>Лагерь на Волге</b>");
    expect(fitted).toContain("Оставить заявку");
    expect(fitted).not.toContain("<b>Организатор</b>");
  });

  it("telegram HTML shows level / risk / price from the card and hides empty blocks", () => {
    const src = programRowToNotifySource({
      id: "p3",
      title: "Камчатка — Powder Expedition",
      discipline: "Freeride",
      region: "Камчатский край",
      startDate: new Date("2031-02-15T00:00:00Z"),
      endDate: new Date("2031-02-22T00:00:00Z"),
      levelRequired: "advanced",
      riskLevel: "high",
      priceFromRub: 185000,
      currency: "RUB",
    });
    const html = buildTelegramProgramNotifyHtml(src, null, { hideLinkFallbackHint: true });
    expect(html).toContain("\nУровень: продвинутый · Риск: высокий · <b>от 185\u00a0000 ₽</b>");
    expect(html).not.toContain("Для кого");
    expect(html).not.toContain("Что входит");
    expect(html).not.toContain("<b>Организатор</b>");
    expect(html).not.toContain("Перед бронированием");
    expect(html).not.toContain("на карточке");

    const noParams = buildTelegramProgramNotifyHtml({ ...src, levelRequired: null, riskLevel: null, priceFrom: 0 }, null, {
      hideLinkFallbackHint: true,
    });
    expect(noParams).not.toContain("Уровень:");
    expect(noParams).not.toContain("от ");
  });

  it("telegram HTML drops ingest defaults: medium risk, all_levels, placeholder copy", () => {
    const src = {
      ...baseSrc(),
      levelRequired: "all_levels",
      riskLevel: "medium",
      audienceFit: "Требует ручной нормализации оператором.",
      inclusions: "Базовая программа и сопровождение организатора. Детальный состав включенного оператор уточняет.",
      cancellationRules: "Требует ручного заполнения оператором.",
      whatHappensAfterBooking: "После заявки оператор уточняет детали и переводит в следующий шаг.",
    };
    const html = buildTelegramProgramNotifyHtml(src, null, { hideLinkFallbackHint: true });
    expect(html).not.toContain("Что входит");
    expect(html).not.toContain("Риск");
    expect(html).not.toContain("all_levels");
    expect(html).not.toContain("Требует ручной");
    expect(html).not.toContain("Базовая программа");
    expect(html).not.toContain("Требует ручного");
    expect(html).not.toContain("Перед бронированием");
    expect(html).toContain("Формат: camp");

    const confirmed = buildTelegramProgramNotifyHtml({ ...src, manualFields: ["riskLevel"] }, null, { hideLinkFallbackHint: true });
    expect(confirmed).toContain("Риск: средний");
  });

  it("on-request tour shows season and tour length instead of the season window", () => {
    const src = {
      ...baseSrc(),
      scheduleType: "on_request",
      seasonLabel: "июнь–сентябрь",
      durationDays: 8,
      startDate: new Date("2027-06-01T12:00:00Z"),
      endDate: new Date("2027-09-30T12:00:00Z"),
    };
    const html = buildTelegramProgramNotifyHtml(src, null, { hideLinkFallbackHint: true });
    expect(html).toContain("📅 <b>По запросу · сезон июнь–сентябрь</b> · 8 дней");
    expect(html).not.toContain("122 дня");
    expect(buildEmailProgramNotifyText(src, "u", "x")).toContain("Самара · По запросу · сезон июнь–сентябрь");
  });

  it("formatDateRangeRu covers single day and year boundary", () => {
    expect(formatDateRangeRu(new Date("2026-10-10T00:00:00Z"), new Date("2026-10-10T00:00:00Z"))).toBe("10 октября 2026");
    expect(formatDateRangeRu(new Date("2026-12-28T00:00:00Z"), new Date("2027-01-04T00:00:00Z"))).toBe(
      "28 декабря 2026 — 4 января 2027",
    );
    expect(durationLabel(new Date("2026-10-10T00:00:00Z"), new Date("2026-10-11T00:00:00Z"))).toBe("2 дня");
    expect(durationLabel(new Date("2026-10-10T00:00:00Z"), new Date("2026-10-10T00:00:00Z"))).toBeNull();
  });

  it("telegram HTML can hide fallback hint when link is missing", () => {
    const html = buildTelegramProgramNotifyHtml(baseSrc(), null, { hideLinkFallbackHint: true });
    expect(html).not.toContain("Откройте программу в приложении MyWaveTour");
  });

  it("telegram HTML can keep CTA only in keyboard (without body link)", () => {
    const html = buildTelegramProgramNotifyHtml(baseSrc(), "https://mywavetour.ru/program/p1", {
      includeCtaLinkInBody: false,
      hideLinkFallbackHint: true,
    });
    expect(html).not.toContain("Открыть карточку и оставить заявку");
  });

  it("email HTML hides empty organizer only when both missing — uses fallback", () => {
    const sparse = programRowToNotifySource({
      id: "p2",
      title: "X & <test>",
      discipline: "MTB",
      region: "Ufa",
      startDate: new Date("2032-01-05"),
      endDate: new Date("2032-01-05"),
      audienceFit: null,
      inclusions: null,
      organizerName: null,
      organizer: null,
      levelRequired: null,
      formatType: null,
      cancellationRules: null,
      whatHappensAfterBooking: null,
      medicalLimitations: null,
    });
    const h = buildEmailProgramNotifyHtml(
      sparse,
      "https://mywavetour.ru/program/p2",
      "https://api.mywavetour.ru/public/subscriptions/unsubscribe?email=a%40b.ru",
    );
    expect(h).toContain("&lt;test&gt;");
    expect(h).toContain("Кто проводит");
    expect(h).toContain("Отписаться");
    const t = buildEmailProgramNotifyText(
      sparse,
      "https://mywavetour.ru/program/p2",
      "https://api.mywavetour.ru/public/subscriptions/unsubscribe?email=a%40b.ru",
    );
    expect(t).toContain("X & <test>");
    expect(t).toContain("Отписаться:");
  });
});
