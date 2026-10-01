import { describe, expect, it } from "vitest";
import {
  buildEnrichmentUpdate,
  buildEnrichmentUserMessage,
  cleanTitle,
  DEFAULT_CANCELLATION_NOTE,
  DEFAULT_GEAR_NOTE,
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

  it("подставляет стандартное примечание, если об отмене и снаряжении молчат и пост, и ИИ", () => {
    const empty = parseCardEnrichment({ organizer: {}, notes: { gear: "", cancellation: "" } }, SOURCE);
    expect(empty?.notes.cancellation).toBe(DEFAULT_CANCELLATION_NOTE);
    expect(empty?.notes.gear).toBe(DEFAULT_GEAR_NOTE);
    const moto = "Регистрация на гонку. Предоплата не возвращается. Обязателен шлем.";
    const filled = parseCardEnrichment(
      { organizer: { cancellationRules: ["Предоплата не возвращается"], gearRequirements: ["Обязателен шлем"] } },
      moto,
    );
    expect(filled?.notes.cancellation).toBe("");
    expect(filled?.notes.gear).toBe("");
  });

  it("держит доплату в «Не включено», а не в условиях отмены, и сохраняет «для кого» по группам", () => {
    const kapchagay =
      "Кемп будет полезен спортсменам с любым уровнем подготовки: от новичка до участника чемпионата мира. " +
      "С новичками мы подчистим базу и освоим новые трюки, а с более продвинутыми спортсменами отточим соревновательную программу. " +
      "Включено двухместное проживание в гостинице в центре Алматы на 6 ночей с завтраками. Доплата за одноместное размещение 250$. " +
      "Прямые билеты из Москвы сейчас стоят от 39000 руб. туда-обратно. Бронируйте прямо сейчас, количество мест ограничено!";
    const fromExclusions = parseCardEnrichment(
      { organizer: { exclusions: ["Доплата за одноместное размещение 250$", "Билеты из Москвы от 39000 руб. туда-обратно"] } },
      kapchagay,
    );
    expect(fromExclusions?.organizer.exclusions).toEqual([
      "Доплата за одноместное размещение 250$",
      "Билеты из Москвы от 39000 руб. туда-обратно",
    ]);
    expect(fromExclusions?.organizer.cancellationRules).toEqual([]);

    const fromTerms = parseCardEnrichment(
      {
        organizer: {
          audienceFit:
            "Спортсменам с любым уровнем подготовки: от новичка до участника чемпионата мира.\nНовичкам — подчистить базу и освоить новые трюки.\nПродвинутым — отточить соревновательную программу.",
          cancellationRules: ["Доплата за одноместное размещение 250$"],
        },
      },
      kapchagay,
    );
    expect(fromTerms?.organizer.cancellationRules).toEqual([]);
    expect(fromTerms?.organizer.exclusions).toEqual(["Доплата за одноместное размещение 250$"]);
    expect(fromTerms?.organizer.audienceFit.split("\n")).toHaveLength(3);
  });

  it("вырезает ссылки из примечаний MyWave", () => {
    const result = parseCardEnrichment({ notes: { gear: "Обычно нужен гидрокостюм, см. https://example.com/gear" } }, SOURCE);
    expect(result?.notes.gear).toBe("Обычно нужен гидрокостюм, см.");
  });

  it("не дублирует требования в «Не включено» и убирает награды из «Включено»", () => {
    const moto = "Открытая тренировка, брифинг, заезды. Награждение победителей. Требования: страховка не менее 100 000 р.";
    const result = parseCardEnrichment(
      {
        organizer: {
          inclusions: ["Открытая тренировка", "Брифинг", "Награждение победителей"],
          exclusions: ["Страховка"],
          gearRequirements: ["Страховка не менее 100 000 р."],
        },
      },
      moto,
    );
    expect(result?.organizer.inclusions).toEqual(["Открытая тренировка", "Брифинг"]);
    expect(result?.organizer.exclusions).toEqual([]);
    expect(result?.organizer.gearRequirements).toEqual(["Страховка не менее 100 000 р."]);
  });

  it("переносит требования и условия оплаты из «Не включено» в нужные поля", () => {
    const post =
      "Питание: завтрак и обед. Бронирование 50% стоимости при записи, вторая часть 50% за неделю до старта. Присутствие и расписка от родителей для спортсменов до 18 лет. Перелет не включен.";
    const result = parseCardEnrichment(
      {
        organizer: {
          exclusions: [
            "Перелет",
            "50% предоплата при записи, оставшиеся 50% за неделю до старта",
            "Присутствие и расписка от родителей для спортсменов до 18 лет",
          ],
        },
      },
      post,
    );
    expect(result?.organizer.exclusions).toEqual(["Перелет"]);
    expect(result?.organizer.cancellationRules).toEqual(["50% предоплата при записи, оставшиеся 50% за неделю до старта"]);
    expect(result?.organizer.gearRequirements).toEqual(["Присутствие и расписка от родителей для спортсменов до 18 лет"]);
  });

  it("возвращает null на не-объект", () => {
    expect(parseCardEnrichment("oops", SOURCE)).toBeNull();
  });
});

describe("buildEnrichmentUpdate", () => {
  const result = {
    organizer: {
      title: "Кайт-сафари на яхте",
      audienceFit: "Любой уровень",
      inclusions: ["Питание", "Проживание"],
      exclusions: [],
      gearRequirements: [],
      cancellationRules: [],
    },
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

  it("не обнуляет ранее заполненные ИИ условия отмены", () => {
    const empty = { ...result, organizer: { ...result.organizer, cancellationRules: [] } };
    const { data } = buildEnrichmentUpdate(
      { manualFields: [], aiEnrichment: { fields: ["cancellationRules"] } },
      empty,
      { model: "m", sourceHash: "z", now: new Date("2026-09-30T00:00:00Z") },
    );
    expect("cancellationRules" in data).toBe(false);
  });

  it("очищает сырой «для кого» из сбора, если ИИ ничего не подтвердил", () => {
    const post = "Друзья, мы едем закрывать сезон в Краснодаре в октябре! Остались места на даты 25-31 октября.";
    const empty = { ...result, organizer: { ...result.organizer, audienceFit: "" } };
    const meta = { model: "m", sourceHash: "y", now: new Date("2026-09-30T00:00:00Z"), sourceText: post };
    expect(
      buildEnrichmentUpdate({ manualFields: [], audienceFit: "Друзья, мы едем закрывать сезон в Краснодаре…" }, empty, meta).data
        .audienceFit,
    ).toBeNull();
    expect(
      buildEnrichmentUpdate({ manualFields: [], audienceFit: 'a href="/dream-summits/0_53/">Тетнульди' }, empty, meta).data
        .audienceFit,
    ).toBeNull();
    expect(
      "audienceFit" in buildEnrichmentUpdate({ manualFields: [], audienceFit: "Для райдеров от 16 лет" }, empty, meta).data,
    ).toBe(false);
    expect(
      "audienceFit" in
        buildEnrichmentUpdate({ manualFields: ["audienceFit"], audienceFit: "Друзья, мы едем закрывать сезон" }, empty, meta).data,
    ).toBe(false);
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
