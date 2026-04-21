/**
 * Publish gate. Source of truth: program_card_schema.md (Required for publish).
 * Правила собраны в одном массиве: и проверка `canPublish`, и подсказки для мастера организатора.
 */
import { Organizer, Program, ProgramMedia } from "@prisma/client";
import { inclusiveDurationDaysUTC } from "@mywave/shared-types";

export type ProgramWithMedia = Program & { media: ProgramMedia[]; organizer?: Pick<Organizer, "verificationStatus"> | Organizer | null };

function filled(s: string | null | undefined): boolean {
  return s != null && String(s).trim() !== "";
}

function isVerifiedSupplyOrganizer(verificationStatus: string | null | undefined): boolean {
  return verificationStatus === "verified" || verificationStatus === "trusted_by_platform";
}

export type PublishGateRule = {
  /** Токен в массиве missing (совместимость с прежним API) */
  missingToken: string;
  tier: "baseline" | "verified";
  /** Показывать в публичном мастере организатора (нет поля organizerId на этапе intake) */
  showInOrganizerWizardHints: boolean;
  /** Короткий заголовок для UI */
  hintTitleRu: string;
  /** Пояснение */
  hintBodyRu: string;
  pass: (program: ProgramWithMedia) => boolean;
};

function hasProgramSummary(program: ProgramWithMedia): boolean {
  return filled(program.itineraryDayByDay) || filled(program.audienceFit) || filled(program.inclusions);
}

export const PUBLISH_GATE_RULES: PublishGateRule[] = [
  {
    missingToken: "title",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Название программы",
    hintBodyRu: "Короткое уникальное название кэмпа / выезда, как его увидит гость в каталоге.",
    pass: (p) => filled(p.title),
  },
  {
    missingToken: "organizer",
    tier: "baseline",
    showInOrganizerWizardHints: false,
    hintTitleRu: "Организатор в системе",
    hintBodyRu: "В карточке в БД должна быть привязка к организатору — делает оператор при заведении.",
    pass: (p) => Boolean(p.organizerId),
  },
  {
    missingToken: "category/discipline",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Дисциплина / категория",
    hintBodyRu: "Направление активности (wakesurf, MTB и т.д.) — для фильтров каталога.",
    pass: (p) => filled(p.discipline),
  },
  {
    missingToken: "location (region)",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Регион",
    hintBodyRu: "Страна и регион или известное направление (как в каталоге).",
    pass: (p) => filled(p.region),
  },
  {
    missingToken: "exact_location",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Точное место",
    hintBodyRu: "Город, база, акватория или трейл — чтобы гость понимал, куда едет.",
    pass: (p) => filled(p.exactLocation),
  },
  {
    missingToken: "date (start_date, end_date)",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Даты начала и окончания",
    hintBodyRu: "Должны быть заданы обе даты поездки / кэмпа.",
    pass: (p) => Boolean(p.startDate && p.endDate),
  },
  {
    missingToken: "duration_days_calendar",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Согласованность длительности с датами",
    hintBodyRu:
      "Поле durationDays вычисляется на сервере по startDate/endDate (включительно, UTC). При расхождении публикация блокируется — обновите даты через PATCH.",
    pass: (p) => {
      if (!p.startDate || !p.endDate || p.durationDays == null) return false;
      try {
        return inclusiveDurationDaysUTC(p.startDate, p.endDate) === p.durationDays;
      } catch {
        return false;
      }
    },
  },
  {
    missingToken: "level/skill level",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Уровень подготовки",
    hintBodyRu: "Кому подходит: beginner / intermediate / advanced / expert / all_levels.",
    pass: (p) => filled(p.levelRequired),
  },
  {
    missingToken: "risk_level",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Оценка риска / интенсивности",
    hintBodyRu: "low / medium / high / critical — для ожиданий гостя и модерации.",
    pass: (p) => filled(p.riskLevel),
  },
  {
    missingToken: "gear_requirements",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Экипировка и требования",
    hintBodyRu: "Что взять с собой, что арендуется на месте, обязательная экипировка.",
    pass: (p) => filled(p.gearRequirements),
  },
  {
    missingToken: "medical_limitations (set empty string if N/A)",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Медицина и ограничения",
    hintBodyRu: "Поле должно быть задано. Если ограничений нет — укажите «Нет» или «Не применимо».",
    pass: (p) => !(p.medicalLimitations === undefined || p.medicalLimitations === null),
  },
  {
    missingToken: "cancellation_rules",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Условия отмены и участия",
    hintBodyRu: "Политика отмены, сроки, штрафы — минимум для доверия и поддержки.",
    pass: (p) => filled(p.cancellationRules),
  },
  {
    missingToken: "program summary/structure (itinerary_day_by_day, audience_fit or inclusions)",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Структура программы",
    hintBodyRu: "Заполните хотя бы одно: по дням, для кого программа, или что включено.",
    pass: (p) => hasProgramSummary(p),
  },
  {
    missingToken: "at least 1 media",
    tier: "baseline",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Медиа (обложка)",
    hintBodyRu: "Минимум одно изображение или медиа — в каталоге нужна визуальная опора.",
    pass: (p) => Boolean(p.media?.length),
  },
  {
    missingToken: "format_type",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Формат",
    hintBodyRu: "Например: группа 6–8 человек, индивидуально, кэмп с проживанием…",
    pass: (p) => filled(p.formatType),
  },
  {
    missingToken: "price_from_rub",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Цена «от»",
    hintBodyRu: "Число в рублях (или основной валюте карточки).",
    pass: (p) => p.priceFromRub != null,
  },
  {
    missingToken: "currency",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Валюта",
    hintBodyRu: "Код валюты (например RUB).",
    pass: (p) => filled(p.currency),
  },
  {
    missingToken: "audience_fit",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Для кого программа",
    hintBodyRu: "Аудитория, опыт, ожидания — обязательный блок для verified / trusted.",
    pass: (p) => filled(p.audienceFit),
  },
  {
    missingToken: "inclusions",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Что включено",
    hintBodyRu: "Явный перечень включённых услуг.",
    pass: (p) => filled(p.inclusions),
  },
  {
    missingToken: "exclusions",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Что не включено",
    hintBodyRu: "Перелёты, страховка, питание и т.д. — чтобы снизить споры.",
    pass: (p) => filled(p.exclusions),
  },
  {
    missingToken: "itinerary_day_by_day",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "План по дням",
    hintBodyRu: "Детальный itinerary — для конверсии и модерации trusted-потока.",
    pass: (p) => filled(p.itineraryDayByDay),
  },
  {
    missingToken: "organizer_name",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Имя организатора в карточке",
    hintBodyRu: "Как подписать блок организатора на публичной странице.",
    pass: (p) => filled(p.organizerName),
  },
  {
    missingToken: "trust_reason",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Почему можно доверять",
    hintBodyRu: "Опыт, лицензии, партнёры, страховка — коротко и по делу.",
    pass: (p) => filled(p.trustReason),
  },
  {
    missingToken: "reviews_summary",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Отзывы / репутация",
    hintBodyRu: "Краткое резюме отзывов или внешних оценок (если есть).",
    pass: (p) => filled(p.reviewsSummary),
  },
  {
    missingToken: "what_happens_after_booking",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "После заявки",
    hintBodyRu: "Что получит гость: сроки ответа, доплаты, договор, чат и т.д.",
    pass: (p) => filled(p.whatHappensAfterBooking),
  },
  {
    missingToken: "cta",
    tier: "verified",
    showInOrganizerWizardHints: true,
    hintTitleRu: "Призыв к действию",
    hintBodyRu: "Следующий шаг для гостя (например: оставить заявку, получить программу дня).",
    pass: (p) => filled(p.cta),
  },
];

export function getProgramPublishHintsJson(): {
  version: 1;
  baseline: { missingToken: string; hintTitleRu: string; hintBodyRu: string }[];
  verifiedExtra: { missingToken: string; hintTitleRu: string; hintBodyRu: string }[];
} {
  const baseline = PUBLISH_GATE_RULES.filter((r) => r.tier === "baseline" && r.showInOrganizerWizardHints).map((r) => ({
    missingToken: r.missingToken,
    hintTitleRu: r.hintTitleRu,
    hintBodyRu: r.hintBodyRu,
  }));
  const verifiedExtra = PUBLISH_GATE_RULES.filter((r) => r.tier === "verified" && r.showInOrganizerWizardHints).map((r) => ({
    missingToken: r.missingToken,
    hintTitleRu: r.hintTitleRu,
    hintBodyRu: r.hintBodyRu,
  }));
  return { version: 1, baseline, verifiedExtra };
}

export type PublishGateMissingField = { field: string; titleRu: string };

export function canPublish(program: ProgramWithMedia): {
  ok: boolean;
  missing: string[];
  missingFields: PublishGateMissingField[];
} {
  const missing: string[] = [];
  const missingFields: PublishGateMissingField[] = [];
  const organizerVerification = program.organizer?.verificationStatus;
  const verifiedLayer = isVerifiedSupplyOrganizer(organizerVerification);

  for (const rule of PUBLISH_GATE_RULES) {
    if (rule.tier === "verified" && !verifiedLayer) continue;
    if (!rule.pass(program)) {
      missing.push(rule.missingToken);
      missingFields.push({ field: rule.missingToken, titleRu: rule.hintTitleRu });
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    missingFields,
  };
}
