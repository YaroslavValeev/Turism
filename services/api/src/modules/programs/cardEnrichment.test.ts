import { describe, expect, it } from "vitest";
import { buildEnrichmentUpdate, cleanTitle, enrichmentSourceHash, parseCardEnrichment } from "./cardEnrichment";

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

  it("возвращает null на не-объект", () => {
    expect(parseCardEnrichment("oops", SOURCE)).toBeNull();
  });
});

describe("buildEnrichmentUpdate", () => {
  const result = {
    organizer: { title: "Кайт-сафари на яхте", audienceFit: "Любой уровень", inclusions: ["Питание", "Проживание"], exclusions: [], gearRequirements: [] },
    notes: { general: [], accommodation: "", transfer: "", gear: "", cancellation: "" },
  };

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
