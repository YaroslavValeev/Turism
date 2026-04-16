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
    "Организатор проходит проверку карточки до публикации; формат малых групп снижает риск перегруза на воде.",
  whatHappensAfterBooking:
    "Оператор MyWave подтверждает контакт, уточняет уровень и передаёт заявку организатору. Дальнейшая коммуникация по брони — напрямую с организатором, с нашей поддержкой на старте.",
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
    "Карточка проверена по стандарту публикации; акцент на технике и обратной связи.",
  whatHappensAfterBooking:
    "Связь оператора → передача лида организатору → согласование слотов и условий вне платформы.",
};

const kuban: ProgramFieldOverrides = {
  audienceFit:
    "Семьи с детьми и начинающие: спокойный темп, акцент на безопасность и удовольствие от воды.",
  itineraryDayByDay:
    "Несколько коротких выходов на воду, перерывы, активности на берегу по плану организатора.",
  trustReason:
    "Формат family-friendly согласован с правилами публикации и безопасного размещения.",
  whatHappensAfterBooking:
    "Оператор помогает с первым контактом; детали брони — с организатором.",
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
