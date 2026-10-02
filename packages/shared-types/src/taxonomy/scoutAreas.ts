/**
 * Зоны разведки Scout (куда ищем организаторов). Волна 1 — пилотные зоны OSINT,
 * волна 2 — дефолт владельца из 9 зон; зону легко разделить позже (новый id + перенос алиасов).
 *
 * macro — slug регионального хаба из packages/explore-links/src/exploreMap.ts (caucasus, siberia, karelia).
 * Для зон без хаба: "far-east" (Камчатка, Сахалин и Курилы) и "north" (Хибины и Кольский) — хабы ещё не заведены.
 *
 * subjectsRu — субъекты РФ. В resolveScoutArea субъект срабатывает, только если он однозначен
 * (Карачаево-Черкесская Республика = Архыз и Домбай → не резолвится).
 */

export type ScoutMacro = "caucasus" | "siberia" | "karelia" | "far-east" | "north";

export type ScoutAreaDef = {
  id: string;
  labelRu: string;
  subjectsRu: readonly string[];
  macro: ScoutMacro;
  aliases: readonly string[];
  wave: 1 | 2;
};

export const SCOUT_AREAS = [
  {
    id: "kamchatka",
    labelRu: "Камчатка",
    subjectsRu: ["Камчатский край"],
    macro: "far-east",
    aliases: ["Kamchatka", "Петропавловск-Камчатский"],
    wave: 1,
  },
  {
    id: "altai",
    labelRu: "Алтай",
    subjectsRu: ["Республика Алтай", "Алтайский край"],
    macro: "siberia",
    aliases: ["Altai", "Altay", "Горный Алтай", "Белуха"],
    wave: 1,
  },
  {
    id: "elbrus",
    labelRu: "Приэльбрусье",
    subjectsRu: ["Кабардино-Балкарская Республика"],
    macro: "caucasus",
    aliases: ["Эльбрус", "Elbrus", "Кабардино-Балкария", "Терскол", "Чегет"],
    wave: 1,
  },
  {
    id: "sheregesh",
    labelRu: "Шерегеш",
    subjectsRu: ["Кемеровская область — Кузбасс"],
    macro: "siberia",
    aliases: ["Sheregesh", "Кузбасс", "Кемеровская область", "Горная Шория"],
    wave: 2,
  },
  {
    id: "krasnaya-polyana",
    labelRu: "Красная Поляна",
    subjectsRu: ["Краснодарский край"],
    macro: "caucasus",
    aliases: ["Krasnaya Polyana", "Роза Хутор", "Rosa Khutor", "Эсто-Садок"],
    wave: 2,
  },
  {
    id: "arkhyz",
    labelRu: "Архыз",
    subjectsRu: ["Карачаево-Черкесская Республика"],
    macro: "caucasus",
    aliases: ["Arkhyz", "Романтик"],
    wave: 2,
  },
  {
    id: "dombay",
    labelRu: "Домбай",
    subjectsRu: ["Карачаево-Черкесская Республика"],
    macro: "caucasus",
    aliases: ["Dombay", "Теберда"],
    wave: 2,
  },
  {
    id: "khibiny-kola",
    labelRu: "Хибины и Кольский",
    subjectsRu: ["Мурманская область"],
    macro: "north",
    aliases: ["Хибины", "Кировск", "Кольский", "Кольский полуостров", "Kola", "Khibiny", "Териберка"],
    wave: 2,
  },
  {
    id: "baikal",
    labelRu: "Байкал",
    subjectsRu: ["Иркутская область", "Республика Бурятия"],
    macro: "siberia",
    aliases: ["Baikal", "Бурятия", "Ольхон", "Иркутск"],
    wave: 2,
  },
  {
    id: "karelia",
    labelRu: "Карелия",
    subjectsRu: ["Республика Карелия"],
    macro: "karelia",
    aliases: ["Karelia", "Karelija"],
    wave: 2,
  },
  {
    id: "dagestan",
    labelRu: "Дагестан",
    subjectsRu: ["Республика Дагестан"],
    macro: "caucasus",
    aliases: ["Dagestan", "Сулакский каньон"],
    wave: 2,
  },
  {
    id: "sakhalin-kurils",
    labelRu: "Сахалин и Курилы",
    subjectsRu: ["Сахалинская область"],
    macro: "far-east",
    aliases: ["Сахалин", "Курилы", "Курильские острова", "Sakhalin", "Kurils", "Kuril Islands"],
    wave: 2,
  },
] as const satisfies readonly ScoutAreaDef[];

export type ScoutAreaId = (typeof SCOUT_AREAS)[number]["id"];

export const SCOUT_AREA_IDS: readonly ScoutAreaId[] = SCOUT_AREAS.map((a) => a.id);
