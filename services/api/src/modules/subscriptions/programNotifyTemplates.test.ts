import { describe, expect, it } from "vitest";
import {
  buildEmailProgramNotifyHtml,
  buildEmailProgramNotifyText,
  buildTelegramProgramNotifyHtml,
  bulletsFromFreeText,
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
    expect(html).toContain("<b>Новый выезд в MyWaveTour</b>");
    expect(html).toContain("Лагерь на Волге");
    expect(html).toContain("Для кого");
    expect(html).toContain("Открыть карточку");
    expect(html).not.toContain("<script");
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
