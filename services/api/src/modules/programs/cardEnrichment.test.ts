import { describe, expect, it } from "vitest";
import {
  buildEnrichmentUpdate,
  buildEnrichmentUserMessage,
  cleanTitle,
  enrichmentSourceHash,
  hasUnsupportedLevelClaim,
  parseCardEnrichment,
} from "./cardEnrichment";

describe("hasUnsupportedLevelClaim", () => {
  it("пропускает уровень, названный в посте", () => {
    expect(hasUnsupportedLevelClaim("Для новичков старше 14 лет", "Классы: Новичок 14+")).toBe(false);
  });

  it("ловит уровень, которого в посте нет", () => {
    expect(hasUnsupportedLevelClaim("Подходит для всех уровней", "Обучение кайту и вингу")).toBe(true);
  });
});

describe("buildEnrichmentUserMessage", () => {
  it("не передаёт модели регион каталога", () => {
    const message = buildEnrichmentUserMessage({
      text: "Сафари в Красном море",
      discipline: "kite",
      formatType: "camp",
      startDate: new Date("2026-10-17T00:00:00Z"),
      endDate: new Date("2026-10-24T00:00:00Z"),
    });
    expect(message).not.toMatch(/Регион/);
  });
});

const SOURCE = `#RKN_команда КАЙТ И ВИНГ САФАРИ НА ЯХТЕ В КРАСНОМ МОРЕ!
Приглашаем райдеров любого уровня. В стоимость входит проживание на яхте, трехразовое питание,
работа инструктора и страховка. Перелет оплачивается отдельно. Снаряжение можно взять в аренду.`;

describe("cleanTitle", () => {
  it("убирает хэштеги, эмодзи и капс", () => {
    expect(cleanTitle("#RKN_команда 🏄 КАЙТ САФАРИ НА ЯХТЕ")).toBe("Кайт сафари на яхте");
  });

  it("отбрасывает слишком короткий заголовок", () => {
    expect(cleanTitle("Кайт")).toBe("");
  });
});

describe("parseCardEnrichment", () => {
  it("оставляет факты из поста и выбрасывает выдуманные пункты", () => {
    const result = parseCardEnrichment(
      {
        organizer: {
          title: "Кайт- и винг-сафари на яхте в Красном море",
          audienceFit: "Райдерам любого уровня.",
          inclusions: ["Проживание на яхте", "Трехразовое питание", "Трансфер из аэропорта Хургады"],
          exclusions: ["Перелет"],
          gearRequirements: [],
        },
        notes: { general: ["Обычно нужен загранпаспорт."], accommodation: "Как правило, каюты на двоих.", transfer: "", gear: "", cancellation: "" },
      },
      SOURCE,
    );
    expect(result?.organizer.title).toBe("Кайт- и винг-сафари на яхте в Красном море");
    expect(result?.organizer.inclusions).toEqual(["Проживание на яхте", "Трехразовое питание"]);
    expect(result?.organizer.exclusions).toEqual(["Перелет"]);
    expect(result?.notes.accommodation).toBe("Как правило, каюты на двоих.");
  });

  it("убирает «для кого» с уровнем, которого нет в посте", () => {
    const wakeSource = "Анонс Краснодарского кэмпа. 6 тренировок с Чемпионом мира. Полупансион. Проживание в особняке.";
    const result = parseCardEnrichment(
      { organizer: { title: "Кэмп по вейксерфингу", audienceFit: "Кэмп подходит для всех уровней, от новичков до опытных райдеров." } },
      wakeSource,
    );
    expect(result?.organizer.audienceFit).toBe("");
  });

  it("отбрасывает пункт, в котором большинство слов не из поста", () => {
    const result = parseCardEnrichment(
      { organizer: { inclusions: ["Проживание на яхте", "Проживание в пятизвёздочном отеле с бассейном"] } },
      SOURCE,
    );
    expect(result?.organizer.inclusions).toEqual(["Проживание на яхте"]);
  });

  it("не принимает заголовок с местом, которого нет в посте", () => {
    const result = parseCardEnrichment({ organizer: { title: "Кайт-сафари на Мальдивах в Индийском океане" } }, SOURCE, "kite camp");
    expect(result?.organizer.title).toBe("");
  });

  it("разрешает в заголовке дисциплину каталога", () => {
    const wake = "Анонс Краснодарского кэмпа. Катер centurion. Тренировки с чемпионом.";
    const result = parseCardEnrichment({ organizer: { title: "Кэмп по вейксерфингу в Краснодаре" } }, wake, "Вейксерфинг camp");
    expect(result?.organizer.title).toBe("Кэмп по вейксерфингу в Краснодаре");
  });

  it("вырезает ссылки из примечаний MyWave", () => {
    const result = parseCardEnrichment({ notes: { gear: "Обычно нужен гидрокостюм, см. https://example.com/gear" } }, SOURCE);
    expect(result?.notes.gear).toBe("Обычно нужен гидрокостюм, см.");
  });

  it("возвращает null на не-объект", () => {
    expect(parseCardEnrichment("oops", SOURCE)).toBeNull();
  });
});

describe("buildEnrichmentUpdate", () => {
  const result = {
    organizer: { title: "Кайт-сафари на яхте", audienceFit: "Любой уровень", inclusions: ["Питание", "Проживание"], exclusions: [], gearRequirements: [] },
    notes: { general: [], audience: "", accommodation: "", transfer: "", gear: "", cancellation: "" },
  };

  it("очищает поле, которое ИИ заполнял раньше, а теперь пост его не подтверждает", () => {
    const { data } = buildEnrichmentUpdate(
      {
        manualFields: [],
        aiEnrichment: { sourceHash: "x", notes: {}, fields: ["exclusions", "gearRequirements", "title"] },
      },
      { ...result, organizer: { ...result.organizer, title: "" } },
      { model: "m", sourceHash: "y", now: new Date("2026-09-30T00:00:00Z") },
    );
    expect(data.exclusions).toBeNull();
    expect(data.gearRequirements).toBeNull();
    expect("title" in data).toBe(false);
  });

  it("не трогает поля, которые админ правил вручную, и пропускает пустые", () => {
    const { data, stored } = buildEnrichmentUpdate({ manualFields: ["title"] }, result, {
      model: "gpt-4o-mini",
      sourceHash: enrichmentSourceHash(SOURCE),
      now: new Date("2026-09-30T00:00:00Z"),
    });
    expect(data).toEqual({ audienceFit: "Любой уровень", inclusions: "Питание\nПроживание" });
    expect(stored.fields).toEqual(["audienceFit", "inclusions"]);
  });
});
