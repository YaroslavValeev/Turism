/**
 * Форматы активностей (как проводится программа), ортогональны дисциплине:
 * «Kite / camp» = дисциплина kite + формат camp.
 */

export type ActivityFormatDef = {
  id: string;
  labelRu: string;
  aliases: readonly string[];
};

export const ACTIVITY_FORMATS = [
  { id: "camp", labelRu: "Кэмп", aliases: ["кэмп", "кемп", "кэмпы", "кемпы", "лагерь", "лагеря", "тренировочный лагерь", "тренировочные лагеря"] },
  { id: "school", labelRu: "Школа", aliases: ["школа", "школы"] },
  { id: "clinic", labelRu: "Клиника", aliases: ["клиника", "клиники", "интенсив"] },
  { id: "course", labelRu: "Курс", aliases: ["курс", "курсы", "лавинный курс", "лавинные курсы", "avalanche course"] },
  { id: "tour", labelRu: "Тур", aliases: ["trip", "тур", "туры", "поездка", "поездки", "выезд", "выезды"] },
  { id: "expedition", labelRu: "Экспедиция", aliases: ["экспедиция", "экспедиции", "expeditions"] },
  {
    id: "training",
    labelRu: "Тренировочные сборы",
    aliases: ["сборы", "тренировочные сборы", "горные тренировочные сборы", "тренировки", "training camp"],
  },
  { id: "race", labelRu: "Гонка / соревнования", aliases: ["competition", "гонка", "гонки", "соревнования", "соревнование"] },
  { id: "festival", labelRu: "Фестиваль", aliases: ["фестиваль", "фестивали", "fest"] },
  { id: "weekend", labelRu: "Выходные", aliases: ["выходные", "уикенд", "уик-энд"] },
] as const satisfies readonly ActivityFormatDef[];

export type ActivityFormatId = (typeof ACTIVITY_FORMATS)[number]["id"];

export const ACTIVITY_FORMAT_IDS: readonly ActivityFormatId[] = ACTIVITY_FORMATS.map((f) => f.id);
