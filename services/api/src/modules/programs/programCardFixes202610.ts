import type { CardFixSpec } from "./cardFixPlan";

export const PROGRAM_CARD_FIX_TAG = "data-fix 2026-10";
export const PROGRAM_CARD_FIX_ACTOR = "owner:data-fix-program-cards-2026-10";

/** Даты туров каталога хранятся как полдень UTC (см. ingestion/tourCatalog.ts). */
export function catalogDate(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}

const MULTI_REGION = "Красная Поляна / Шерегеш / Хибины";
const KUZBASS = "Кемеровская область — Кузбасс";

const BIRD_KIDS_SHEREGESH = "https://birdtravel.ru/routs/detskaya-gornolyzhnaya-shkola-v-sheregeshe/";
const BIRD_MAMAY = "https://birdtravel.ru/routs/ski-tur-na-mamae-gory-baykala/";
const BIRD_GULMARG = "https://birdtravel.ru/routs/frirayd-i-ski-tur-v-gulmarge-indiyskie-gimalai/";
const BIRD_TECH_SHEREGESH = "https://birdtravel.ru/routs/shkola-gornyh-lyzh-i-snouborda-v-sheregeshe/";
const BIRD_HELI_BAIKAL = "https://birdtravel.ru/routs/heli-ski-vyhodnye-na-baykale/";
const BIRD_GUDAURI = "https://birdtravel.ru/routs/frirajd-kemp-v-gruzii-gudauri/";
const FR_SCHEDULE_SEP = "https://t.me/freeriderussia/1032";
const FR_ANNOUNCE_JUL = "https://t.me/freeriderussia/968";

/**
 * Разовые исправления ошибок импорта каталога (октябрь 2026). Значения expect сняты с прода
 * (GET /api/programs/:id) 2026-10-02; set — со страниц организаторов на ту же дату.
 */
export const PROGRAM_CARD_FIXES_2026_10: CardFixSpec[] = [
  {
    programId: "cmuf9qybu00v7l57wibvk3qum",
    label: "Ски-тур на Мамае с гидом IFMGA (BirdTravel)",
    expect: {
      sourceUrl: BIRD_KIDS_SHEREGESH,
      startDate: catalogDate("2026-11-16"),
      endDate: catalogDate("2026-11-20"),
      durationDays: 5,
      region: MULTI_REGION,
      exactLocation: null,
      priceFromRub: 332000,
    },
    set: {
      sourceUrl: BIRD_MAMAY,
      startDate: catalogDate("2026-11-29"),
      endDate: catalogDate("2026-12-05"),
      durationDays: 7,
      region: "Иркутская область",
      exactLocation: "Хамар-Дабан, ущелье р. Большой Мамай",
      priceFromRub: 130000,
    },
    evidence: [BIRD_MAMAY],
    note: "ссылка/даты/цена были от детской школы в Шерегеше; ближайший заезд Мамая 29.11–05.12.2026, 7 дней, от 130 000 ₽",
  },
  {
    programId: "cmuf9wnk200wpl57wk408rzhe",
    label: "Детская горнолыжная и сноубордическая школа в Шерегеше (BirdTravel)",
    expect: {
      sourceUrl: BIRD_GULMARG,
      startDate: catalogDate("2026-11-16"),
      endDate: catalogDate("2026-11-20"),
      region: MULTI_REGION,
      exactLocation: null,
      priceFromRub: null,
      currency: "USD",
    },
    set: {
      sourceUrl: BIRD_KIDS_SHEREGESH,
      region: KUZBASS,
      exactLocation: "Шерегеш, гора Зелёная, сектор А",
      priceFromRub: 32000,
      currency: "RUB",
    },
    evidence: [BIRD_KIDS_SHEREGESH, BIRD_GULMARG],
    note: "ссылка вела на Гульмарг (Индия), валюта USD от него же; даты 16–20.11.2026 верные, цена 32 000 ₽",
  },
  {
    programId: "cmufa6xfd00xhl57w7g77yp84",
    label: "Технический курс по горным лыжам и сноуборду в Шерегеше (BirdTravel)",
    expect: {
      sourceUrl: BIRD_TECH_SHEREGESH,
      startDate: catalogDate("2026-11-23"),
      endDate: catalogDate("2026-11-27"),
      region: MULTI_REGION,
      exactLocation: null,
      priceFromRub: 360000,
    },
    set: {
      region: KUZBASS,
      exactLocation: "Шерегеш, гора Зелёная",
      priceFromRub: 60000,
    },
    evidence: [BIRD_TECH_SHEREGESH],
    note: "регион-заглушка вместо Кузбасса; цена 60 000 ₽ (группа 4–6 чел.), а не 360 000",
  },
  {
    programId: "cmulqlaxp00lugghlhxhro60t",
    label: "Кемп по фрирайду в Шерегеше (Freeride Russia)",
    expect: {
      sourceUrl: FR_SCHEDULE_SEP,
      startDate: catalogDate("2026-11-23"),
      endDate: catalogDate("2026-11-28"),
      durationDays: 6,
      region: "Russia",
      exactLocation: null,
      priceFromRub: null,
    },
    set: {
      startDate: catalogDate("2026-12-07"),
      endDate: catalogDate("2026-12-12"),
      region: KUZBASS,
      exactLocation: "Шерегеш, гора Зелёная",
      priceFromRub: 35000,
    },
    evidence: [FR_SCHEDULE_SEP, FR_ANNOUNCE_JUL],
    note: "23–28.11 — школа среднего уровня; кемп для продвинутых 7–12.12.2026 (пост 1032), цена кемпа 35 000 ₽ (пост 968)",
  },
  {
    programId: "cmugp6s950004nzppfjror3fk",
    label: "Хели-ски выходные на Байкале (BirdTravel)",
    expect: {
      sourceUrl: BIRD_HELI_BAIKAL,
      startDate: catalogDate("2026-11-24"),
      endDate: catalogDate("2026-11-27"),
      region: MULTI_REGION,
      exactLocation: null,
      priceFromRub: 4690000,
    },
    set: {
      region: "Республика Бурятия",
      exactLocation: "пос. Танхой, Хамар-Дабан",
      priceFromRub: 690000,
    },
    evidence: [BIRD_HELI_BAIKAL],
    note: "база в пос. Танхой (Бурятия), катание на Хамар-Дабане; цена от 690 000 ₽ (3-дневная), а не 4 690 000",
  },
  {
    programId: "cmue1mv950005rpgifmy6iv6u",
    label: "Фрирайд-школы в Шерегеше (Freeride Russia)",
    expect: {
      sourceUrl: FR_ANNOUNCE_JUL,
      startDate: catalogDate("2026-11-30"),
      endDate: catalogDate("2026-12-05"),
      durationDays: 6,
      region: "Russia",
      exactLocation: null,
      priceFromRub: 960000,
    },
    set: {
      endDate: catalogDate("2026-12-04"),
      durationDays: 5,
      region: KUZBASS,
      exactLocation: "Шерегеш, гора Зелёная",
      priceFromRub: 45000,
    },
    evidence: [FR_SCHEDULE_SEP, FR_ANNOUNCE_JUL],
    note: "даты по свежему расписанию (пост 1032): 30.11–04.12.2026; цена школы 45 000 ₽ (960 000 — цена хели-ски из того же поста 968)",
  },
  {
    programId: "cmuf9n0ak00tpl57wgrv2l1ff",
    label: "Фрирайд кемп в Грузии (BirdTravel)",
    expect: {
      sourceUrl: "https://birdtravel.ru/#",
      startDate: catalogDate("2027-01-02"),
      endDate: catalogDate("2027-01-09"),
      region: MULTI_REGION,
      exactLocation: null,
      priceFromRub: null,
      currency: "EUR",
    },
    set: {
      sourceUrl: BIRD_GUDAURI,
      region: "Грузия",
      exactLocation: "Новый Гудаури",
      priceFromRub: 1300,
    },
    evidence: [BIRD_GUDAURI],
    note: "ссылка вела на главную BirdTravel; страна хранится в region (как у других зарубежных туров); от 1 300 € (Twin/Double)",
  },
];
