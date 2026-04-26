/**
 * Длинные тексты контент-пака GM, если в БД поля пустые.
 * Приоритет: данные из API, затем override по шаблону названия программы.
 */

export type ProgramFieldOverrides = Partial<{
  audienceFit: string;
  itineraryDayByDay: string;
  trustReason: string;
  whatHappensAfterBooking: string;
  gearRequirements: string;
  medicalLimitations: string;
}>;

const waveline: ProgramFieldOverrides = {
  audienceFit:
    "Для гостей с опытом катания, которые хотят стабильно прокачать базу за выходные: от постановки на доску до уверенных поворотов и работы с канатом. Подходит тем, кто устал от «хаотичных» сессий без разбора ошибок.",
  itineraryDayByDay:
    "День 1 — знакомство с группой, разминка, разбор текущего уровня, вода: постановка и повторение базовых элементов.\n\nДень 2 — углубление в технику, мини-задачи на воде, разбор видео/наблюдений тренера.\n\nДень 3 — закрепление, итоговая сессия и рекомендации на домашнюю практику.",
  trustReason:
    "Карточка публикуется после согласования с оператором; формат малых групп обычно проще по организации на воде — детали уточняет организатор.",
  whatHappensAfterBooking:
    "Оператор при необходимости уточняет контакт и передаёт заявку организатору. Участие и оплату вы согласуете напрямую с организатором по его правилам.",
  gearRequirements:
    "Гидрокостюм по сезону, защита при необходимости; детали уточняет организатор после заявки.",
  medicalLimitations:
    "При противопоказаниях к нагрузкам на воде сообщите оператору до подтверждения участия.",
};

const southcrew: ProgramFieldOverrides = {
  audienceFit:
    "Для райдеров среднего уровня, которые хотят «обнулить» типичные ошибки и выровнять технику перед сезоном.",
  itineraryDayByDay:
    "Интенсив по блокам: разбор стойки, работа с канатом, повторяемые серии подсказок тренера. Точный тайминг — у организатора в финальной программе.",
  trustReason:
    "Описание и условия в карточке согласуются с оператором перед публикацией; акцент программы — на технике и обратной связи.",
  whatHappensAfterBooking:
    "Оператор при необходимости уточняет контакт, затем заявка уходит организатору; слоты и условия участия подтверждает организатор.",
};

const kuban: ProgramFieldOverrides = {
  audienceFit:
    "Семьи с детьми и начинающие: спокойный темп, акцент на безопасность и удовольствие от воды.",
  itineraryDayByDay:
    "Несколько коротких выходов на воду, перерывы, активности на берегу по плану организатора.",
  trustReason:
    "Семейный формат и базовые требования к безопасности обсуждаются при публикации карточки; итоговые условия — у организатора.",
  whatHappensAfterBooking:
    "Оператор при необходимости уточняет контакт и передаёт заявку; дальше — напрямую с организатором.",
};

const patterns: { pattern: RegExp; overrides: ProgramFieldOverrides }[] = [
  { pattern: /WaveLine/i, overrides: waveline },
  { pattern: /SouthCrew/i, overrides: southcrew },
  { pattern: /Kuban Wake|Family Days/i, overrides: kuban },
];

export function getProgramFieldOverrides(title: string): ProgramFieldOverrides {
  for (const { pattern, overrides } of patterns) {
    if (pattern.test(title)) return { ...overrides };
  }
  return {};
}

/** Возвращает значение поля: из БД если непусто, иначе из оверрайда. */
export function mergeProgramField(
  dbValue: string | null | undefined,
  overrideValue: string | undefined
): string | undefined {
  const t = typeof dbValue === "string" ? dbValue.trim() : "";
  if (t.length > 0) return dbValue ?? undefined;
  return overrideValue;
}
