import { describe, expect, it } from "vitest";
import {
  buildEmailProgramNotifyHtml,
  buildEmailProgramNotifyText,
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
    expect(html).toContain("📍 Самара · Wakesurf");
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
    expect(html).toContain("📍 Алматы, Russia");
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
