export type RecommendedField = "equipment" | "accommodation" | "transfer";

type FallbackArgs = {
  field: RecommendedField;
  discipline?: string | null;
  programFormat?: string | null;
  isKids?: boolean;
  isHighRisk?: boolean;
};

export type ResolvedProgramField = {
  mode: "confirmed" | "recommended";
  text: string;
};

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(value));
}

function isWaterDiscipline(value: string): boolean {
  return hasAny(value, [/wakesurf/i, /wakeboard/i, /\bsup\b/i, /серф/i, /вейк/i, /вод/i]);
}

function isFreerideDiscipline(value: string): boolean {
  return hasAny(value, [/freeride/i, /snowboard/i, /\bski\b/i, /touring/i, /фрирайд/i, /сноуборд/i, /лыж/i]);
}

function isMotoOrMtbDiscipline(value: string): boolean {
  return hasAny(value, [/enduro/i, /\bmtb\b/i, /quad/i, /эндуро/i, /квад/i, /вело/i]);
}

function isClimbDiscipline(value: string): boolean {
  return hasAny(value, [/climb/i, /mountaineer/i, /альпин/i, /скал/i, /восхожд/i]);
}

function isCampFormat(value: string): boolean {
  return hasAny(value, [/\bcamp\b/i, /кэмп/i]);
}

function isOneDayFormat(value: string): boolean {
  return hasAny(value, [/one[-\s]?day/i, /одноднев/i, /выходн/i, /тренировк/i]);
}

function isExpeditionFormat(value: string): boolean {
  return hasAny(value, [/expedition/i, /экспедиц/i, /поход/i]);
}

function isTourFormat(value: string): boolean {
  return hasAny(value, [/\btour\b/i, /тур/i, /маршрут/i]);
}

function isMountainContext(text: string): boolean {
  return hasAny(text, [/mountain/i, /курорт/i, /горы/i, /склон/i, /фрирайд/i]);
}

function isWaterContext(text: string): boolean {
  return isWaterDiscipline(text);
}

export function getRecommendedFieldFallback({
  field,
  discipline,
  programFormat,
  isKids,
  isHighRisk,
}: FallbackArgs): string {
  const d = norm(discipline);
  const f = norm(programFormat);
  const combo = `${d} ${f}`;

  if (field === "equipment") {
    if (isKids) {
      return "Обязательно уточните у организатора список экипировки для ребёнка и требования по безопасности.";
    }
    if (isFreerideDiscipline(combo)) {
      return "Рекомендуем уточнить. Обычно нужны: личный комплект для катания, шлем, защита, а для фрирайда - лавинное снаряжение.";
    }
    if (hasAny(combo, [/wakesurf/i, /wakeboard/i, /вейк/i])) {
      return "Рекомендуем уточнить. Обычно доска и спасательный жилет предоставляются, гидрокостюм зависит от сезона и спота.";
    }
    if (hasAny(combo, [/\bsup\b/i, /вод/i])) {
      return "Рекомендуем уточнить. Обычно нужны спасжилет и одежда по погоде; доска/весло могут предоставляться организатором.";
    }
    if (isMotoOrMtbDiscipline(combo)) {
      return "Рекомендуем уточнить. Обычно требуется шлем и защита; техника и экипировка могут предоставляться или арендоваться отдельно.";
    }
    if (isClimbDiscipline(combo) || isHighRisk) {
      return "Рекомендуем уточнить. Обычно нужен личный базовый комплект, а специальное снаряжение зависит от маршрута и уровня группы.";
    }
    return "Рекомендуем уточнить у организатора. Обычно требуется базовая экипировка под дисциплину.";
  }

  if (field === "accommodation") {
    if (isKids) {
      return "Обязательно уточните у организатора: формат проживания, количество человек в комнате, сопровождение и бытовые условия.";
    }
    if (isOneDayFormat(f)) {
      return "Обычно не требуется для однодневного формата. Если программа с ночевкой - уточните условия у организатора.";
    }
    if (isExpeditionFormat(f)) {
      return "Рекомендуем уточнить. В экспедиционных форматах возможны палатки, турбазы, гостевые дома или смешанный формат.";
    }
    if (isCampFormat(f)) {
      return "Рекомендуем уточнить. Для кэмпов обычно используют гостевые дома, апартаменты, отели или турбазы рядом с локацией.";
    }
    return "Рекомендуем уточнить. Размещение может быть включено или подбираться участниками самостоятельно.";
  }

  if (isKids) {
    return "Обязательно уточните у организатора: кто сопровождает детей, откуда забирают группу и как оформляется передача ребенка.";
  }
  if (isCampFormat(f)) {
    return "Рекомендуем уточнить. Часто дорога до места проведения не включена, а локальные переезды могут организовываться отдельно.";
  }
  if (isTourFormat(f) || isExpeditionFormat(f)) {
    return "Рекомендуем уточнить. В турах часть маршрута может включать групповой трансфер, но дорога до точки старта обычно согласуется отдельно.";
  }
  if (isOneDayFormat(f)) {
    return "Обычно участники добираются самостоятельно. Уточните точку встречи у организатора.";
  }
  if (isMountainContext(combo)) {
    return "Рекомендуем уточнить. Обычно отдельно обсуждаются трансфер до курорта и локальные переезды к спотам.";
  }
  if (isWaterContext(combo)) {
    return "Рекомендуем уточнить. Обычно участник самостоятельно добирается до спота или причала.";
  }
  return "Рекомендуем уточнить. Дорога до места старта и локальные переезды зависят от программы.";
}

/** Служебные заглушки сбора из источников: на сайте это не данные организатора. */
const PLACEHOLDER_PATTERNS = [
  /^требует ручного заполнения/i,
  /^базовая программа и сопровождение организатора\.\s*детальный состав/i,
];

export function isPlaceholderProgramText(value: string | null | undefined): boolean {
  const text = String(value ?? "").trim();
  return text !== "" && PLACEHOLDER_PATTERNS.some((p) => p.test(text));
}

/** Текст организатора без служебных заглушек; пустое значение → null. */
export function organizerText(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return text && !isPlaceholderProgramText(text) ? text : null;
}

export type MyWaveNotes = {
  general: string[];
  audience: string;
  accommodation: string;
  transfer: string;
  gear: string;
  cancellation: string;
};

/** Примечания MyWave из ИИ-автозаполнения (aiEnrichment.notes): общая практика, не слова организатора. */
export function readMyWaveNotes(aiEnrichment: unknown): MyWaveNotes | null {
  if (!aiEnrichment || typeof aiEnrichment !== "object") return null;
  const notes = (aiEnrichment as { notes?: unknown }).notes;
  if (!notes || typeof notes !== "object") return null;
  const n = notes as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const general = Array.isArray(n.general) ? n.general.map(str).filter(Boolean) : [];
  const result = {
    general,
    audience: str(n.audience),
    accommodation: str(n.accommodation),
    transfer: str(n.transfer),
    gear: str(n.gear),
    cancellation: str(n.cancellation),
  };
  const { general: _general, ...single } = result;
  return general.length || Object.values(single).some(Boolean) ? result : null;
}

export function resolveProgramField(
  args: FallbackArgs & { organizerValue?: string | null | undefined; myWaveNote?: string | null },
): ResolvedProgramField {
  const confirmed = organizerText(args.organizerValue);
  if (confirmed) return { mode: "confirmed", text: confirmed };
  return {
    mode: "recommended",
    text: args.myWaveNote?.trim() || getRecommendedFieldFallback(args),
  };
}

export function extractLabeledFieldValue(
  field: Exclude<RecommendedField, "equipment">,
  sources: Array<string | null | undefined>
): string | null {
  const lines = sources
    .map((s) => String(s ?? ""))
    .join("\n")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const patterns =
    field === "accommodation"
      ? [/^(?:тип\s+размещ(?:ения|ение)|размещ(?:ение|ения)|проживание)\s*[:\-]\s*(.+)$/i]
      : [/^(?:трансфер|дорога|логистика|переезды)\s*[:\-]\s*(.+)$/i];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) {
        const candidate = match[1].trim();
        if (candidate) return candidate;
      }
    }
  }
  return null;
}
