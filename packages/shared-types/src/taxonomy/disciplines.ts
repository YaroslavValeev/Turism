/**
 * Канонический словарь дисциплин MyWaveTour.
 *
 * id — lowercase kebab-case латиницей, стабилен (пишется в данные и URL).
 * aliases — русские/английские написания, включая legacy-значения из БД, импортов и OSINT.
 * Сопоставление регистронезависимое, ё = е (см. normalizeToken в ./normalize).
 *
 * aiTour: true — дисциплины, которые разрешено возвращать ИИ-сборщику каталогов турфирм
 * (порядок совпадает с TOUR_DISCIPLINES в services/api/src/modules/ingestion/tourCatalog.ts).
 *
 * Решения владельца:
 * - голое «эндуро» / «enduro» = мотоэндуро (moto-enduro): в русскоязычной среде это мотодисциплина
 *   (например, Susanin Race). Велоэндуро — только явно: «велоэндуро», «mtb enduro», «эндуро mtb» → mtb.
 * - велотуризм / bikepacking / велопоходы → mtb: отдельной шоссейной/туристической вело-дисциплины пока нет.
 * - «wake» → wakesurf (как в explore-хабах); вейкборд — только явно.
 * - «snow» → snowboard (как в explore-хабах).
 */

export type DisciplineGroup = "snow" | "mountain" | "water" | "air" | "wheels" | "nature" | "multi";

export type DisciplineDef = {
  id: string;
  labelRu: string;
  labelEn: string;
  group: DisciplineGroup;
  aliases: readonly string[];
  aiTour?: boolean;
};

export const DISCIPLINES = [
  // --- aiTour: порядок как в TOUR_DISCIPLINES ---
  {
    id: "trekking",
    labelRu: "Треккинг",
    labelEn: "Trekking",
    group: "mountain",
    aiTour: true,
    aliases: ["трекинг", "треккинг", "trek", "hiking", "hike", "хайкинг", "поход", "походы", "пеший туризм", "пешие туры", "пешие походы", "пеший поход"],
  },
  {
    id: "expedition",
    labelRu: "Экспедиции",
    labelEn: "Expedition",
    group: "multi",
    aiTour: true,
    aliases: ["Expedition", "expeditions", "экспедиция", "экспедиции"],
  },
  {
    id: "freeride",
    labelRu: "Фрирайд",
    labelEn: "Freeride",
    group: "snow",
    aiTour: true,
    aliases: ["Freeride", "FreeRide", "free ride", "FR", "фрирайд", "фри-райд", "фри райд"],
  },
  {
    id: "heli-ski",
    labelRu: "Хели-ски",
    labelEn: "Heli-ski",
    group: "snow",
    aiTour: true,
    aliases: ["heliski", "heli ski", "heliskiing", "heli-skiing", "хели-ски", "хелиски", "хели ски"],
  },
  {
    id: "ski",
    labelRu: "Горные лыжи",
    labelEn: "Ski",
    group: "snow",
    aiTour: true,
    aliases: ["Ski", "skiing", "alpine skiing", "горные лыжи", "лыжи", "горнолыжный спорт", "горнолыж", "gornolyzh"],
  },
  {
    id: "ski-tour",
    labelRu: "Скитур",
    labelEn: "Ski touring",
    group: "snow",
    aiTour: true,
    aliases: ["skitour", "ski tour", "ski touring", "skitouring", "ski-touring", "скитур", "ски-тур", "ски тур", "скитуринг", "ски-туринг"],
  },
  {
    id: "snowboard",
    labelRu: "Сноуборд",
    labelEn: "Snowboard",
    group: "snow",
    aiTour: true,
    aliases: ["Snowboard", "snowboarding", "snow", "сноуборд", "сноубординг"],
  },
  {
    id: "snowmobile",
    labelRu: "Снегоходы",
    labelEn: "Snowmobile",
    group: "snow",
    aiTour: true,
    aliases: ["snowmobiling", "снегоход", "снегоходы", "снегоходные туры", "снегоходный тур", "снегоходные заброски"],
  },
  {
    id: "backcountry",
    labelRu: "Бэккантри",
    labelEn: "Backcountry",
    group: "snow",
    aiTour: true,
    aliases: ["back country", "бэккантри", "бекканри", "бэкантри"],
  },
  {
    id: "mtb",
    labelRu: "MTB",
    labelEn: "Mountain biking",
    group: "wheels",
    aiTour: true,
    aliases: [
      "MTB",
      "мтб",
      "mountain bike",
      "mountain biking",
      "маунтинбайк",
      "горный велосипед",
      "downhill",
      "даунхилл",
      "all mountain",
      "gravity",
      "велотур",
      "велотуры",
      "велотуризм",
      "велопоход",
      "велопоходы",
      "bikepacking",
      "байкпакинг",
      "велоэндуро",
      "mtb enduro",
      "enduro mtb",
      "эндуро mtb",
      "эндуро мтб",
    ],
  },
  {
    id: "sup",
    labelRu: "SUP",
    labelEn: "SUP",
    group: "water",
    aiTour: true,
    aliases: ["SUP", "supboarding", "sup-boarding", "sup board", "сап", "сапбординг", "сап-бординг", "сапсерфинг"],
  },
  {
    id: "surf",
    labelRu: "Серфинг",
    labelEn: "Surf",
    group: "water",
    aiTour: true,
    aliases: ["Surf", "surfing", "серф", "серфинг"],
  },
  {
    id: "kite",
    labelRu: "Кайтсерфинг",
    labelEn: "Kitesurfing",
    group: "water",
    aiTour: true,
    aliases: ["Kite", "kitesurfing", "kitesurf", "kiteboarding", "кайт", "кайтсерфинг", "кайтсерф", "кайтинг", "кайтбординг"],
  },
  {
    id: "wakesurf",
    labelRu: "Вейксерф",
    labelEn: "Wakesurf",
    group: "water",
    aiTour: true,
    aliases: ["Wakesurf", "wakesurfing", "wake surf", "wake", "вейксерф", "вейк-серф", "вейк серф", "вейксерфинг"],
  },
  {
    id: "sailing",
    labelRu: "Яхтинг",
    labelEn: "Sailing",
    group: "water",
    aiTour: true,
    aliases: ["яхтинг", "yachting", "парусный спорт", "парус"],
  },
  {
    id: "wildlife",
    labelRu: "Дикая природа",
    labelEn: "Wildlife",
    group: "nature",
    aiTour: true,
    aliases: ["дикая природа", "wildlife watching", "наблюдение за животными"],
  },
  // --- остальные дисциплины ---
  {
    id: "wakeboard",
    labelRu: "Вейкборд",
    labelEn: "Wakeboard",
    group: "water",
    aliases: ["wakeboarding", "wake board", "вейкборд", "вейк-борд", "вейк борд", "вейкбординг"],
  },
  {
    id: "wing",
    labelRu: "Вингфойл",
    labelEn: "Wing foil",
    group: "water",
    aliases: ["wingfoil", "wing foil", "wingfoiling", "винг", "вингфойл", "вингсерфинг"],
  },
  {
    id: "windsurf",
    labelRu: "Виндсерфинг",
    labelEn: "Windsurfing",
    group: "water",
    aliases: ["windsurfing", "виндсерфинг", "виндсерф"],
  },
  {
    id: "wakeskate",
    labelRu: "Вейкскейт",
    labelEn: "Wakeskate",
    group: "water",
    aliases: ["wakeskating", "вейкскейт", "вейкскейтинг"],
  },
  {
    id: "mountaineering",
    labelRu: "Альпинизм",
    labelEn: "Mountaineering",
    group: "mountain",
    aliases: ["альпинизм", "alpinism", "восхождения", "восхождение", "высотный альпинизм"],
  },
  {
    id: "climbing",
    labelRu: "Скалолазание",
    labelEn: "Climbing",
    group: "mountain",
    aliases: ["rock climbing", "скалолазание", "ледолазание", "ice climbing"],
  },
  {
    id: "rafting",
    labelRu: "Рафтинг",
    labelEn: "Rafting",
    group: "water",
    aliases: ["рафтинг", "сплав", "сплавы"],
  },
  {
    id: "kayaking",
    labelRu: "Каякинг",
    labelEn: "Kayaking",
    group: "water",
    aliases: ["kayak", "sea kayaking", "каякинг", "каяк", "морской каякинг", "байдарка", "байдарки"],
  },
  {
    id: "paragliding",
    labelRu: "Парапланеризм",
    labelEn: "Paragliding",
    group: "air",
    aliases: ["paraglider", "парапланеризм", "параплан", "полеты на параплане"],
  },
  {
    id: "skydiving",
    labelRu: "Парашютный спорт",
    labelEn: "Skydiving",
    group: "air",
    aliases: ["парашютный спорт", "прыжки с парашютом", "скайдайвинг", "парашют"],
  },
  {
    id: "freediving",
    labelRu: "Фридайвинг",
    labelEn: "Freediving",
    group: "water",
    aliases: ["freedive", "фридайвинг", "фридайв"],
  },
  {
    id: "trail-running",
    labelRu: "Трейлраннинг",
    labelEn: "Trail running",
    group: "mountain",
    aliases: ["trail running", "trailrunning", "трейлраннинг", "трейл-раннинг", "трейл раннинг", "горный бег"],
  },
  {
    id: "moto-enduro",
    labelRu: "Мотоэндуро",
    labelEn: "Moto enduro",
    group: "wheels",
    aliases: ["enduro", "Enduro", "эндуро", "мотоэндуро", "мото-эндуро", "moto enduro", "hard enduro", "хард-эндуро", "хард эндуро", "мототуры", "мототур"],
  },
  {
    id: "horse-riding",
    labelRu: "Конные туры",
    labelEn: "Horse riding",
    group: "nature",
    aliases: ["horseback riding", "конные туры", "конный тур", "конные походы", "конный туризм", "верховая езда"],
  },
  {
    id: "jeep-tour",
    labelRu: "Джип-туры",
    labelEn: "Jeep tour",
    group: "wheels",
    aliases: ["jeep tour", "jeeping", "джип-тур", "джип-туры", "джип тур", "джип туры", "джиппинг", "off-road", "оффроуд"],
  },
  {
    id: "multisport",
    labelRu: "Мультиспорт",
    labelEn: "Multisport",
    group: "multi",
    aliases: ["multi", "multi-sport", "мультиспорт"],
  },
] as const satisfies readonly DisciplineDef[];

export type DisciplineId = (typeof DISCIPLINES)[number]["id"];

export const DISCIPLINE_IDS: readonly DisciplineId[] = DISCIPLINES.map((d) => d.id);

export const AI_TOUR_DISCIPLINE_IDS: readonly DisciplineId[] = DISCIPLINES.filter(
  (d): d is Extract<(typeof DISCIPLINES)[number], { aiTour: true }> => "aiTour" in d && d.aiTour === true,
).map((d) => d.id);

export function getDiscipline(id: DisciplineId): DisciplineDef {
  return DISCIPLINES.find((d) => d.id === id) as DisciplineDef;
}
