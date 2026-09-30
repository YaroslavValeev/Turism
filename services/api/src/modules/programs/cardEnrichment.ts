import { createHash } from "node:crypto";

/** Поля карточки, которые ИИ заполняет «от организатора» — только по фактам из поста. */
export const ENRICHABLE_FIELDS = ["title", "audienceFit", "inclusions", "exclusions", "gearRequirements"] as const;
export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

export interface MyWaveNotes {
  general: string[];
  accommodation: string;
  transfer: string;
  gear: string;
  cancellation: string;
}

export interface CardEnrichmentResult {
  organizer: {
    title: string;
    audienceFit: string;
    inclusions: string[];
    exclusions: string[];
    gearRequirements: string[];
  };
  notes: MyWaveNotes;
}

export interface StoredEnrichment {
  generatedAt: string;
  model: string;
  sourceHash: string;
  fields: EnrichableField[];
  notes: MyWaveNotes;
}

export const CARD_ENRICHMENT_SYSTEM_PROMPT = `Ты редактор каталога спортивных выездов MyWaveTour. По тексту поста организатора заполни карточку.

Два слоя, их нельзя смешивать:
1) "organizer" — только факты из текста поста, переформулированные коротко и понятно. Ничего не добавляй от себя: если факта нет в тексте, оставь пустую строку или пустой массив.
   - title: до 90 символов, без хэштегов, эмодзи и КАПСА; что за выезд и где (например «Кайт- и винг-сафари на яхте в Красном море»). Место бери только из текста поста; если места в посте нет — не указывай его. Даты и цены в заголовок не пиши.
   - audienceFit: 1–2 предложения, кому подходит, только из того, что сказано в посте. Уровень участников («для новичков», «для всех уровней», «для опытных») пиши, только если он прямо назван в посте.
   - inclusions: что входит в стоимость или программу по словам организатора, короткими пунктами.
   - exclusions: только то, что организатор прямо называет не включённым или оплачиваемым отдельно. Требования к участникам (страховка, справки, возраст, согласие родителей) сюда не относятся.
   - gearRequirements: снаряжение и обязательные требования к участнику (страховка, документы), только если сказано.
2) "notes" — примечания MyWave: общая практика для такого формата и дисциплины, полезная участнику. Это НЕ слова организатора и НЕ факты о программе.
   - Формулируй осторожно: «обычно», «как правило», «уточните у организатора».
   - Не указывай цены, даты, имена, названия компаний и не противоречь посту.
   - Пиши только то, что реально помогает подготовиться к этой дисциплине и формату (снаряжение, погода, документы, физическая подготовка). Пустые советы вроде «уточните наличие мест» или «нужна предварительная бронь» не пиши — лучше оставь пусто.
   - general: до 3 пунктов; accommodation, transfer, gear, cancellation: по одному предложению или пустая строка.
   - Каждое примечание до 200 символов.

Верни ТОЛЬКО JSON:
{"organizer":{"title":"","audienceFit":"","inclusions":[],"exclusions":[],"gearRequirements":[]},"notes":{"general":[],"accommodation":"","transfer":"","gear":"","cancellation":""}}`;

/** Регион каталога сюда не передаём: он бывает определён эвристикой неверно, а модель ему доверяет. */
export function buildEnrichmentUserMessage(input: {
  text: string;
  discipline: string;
  formatType: string | null;
  startDate: Date;
  endDate: Date;
}): string {
  return [
    `Дисциплина: ${input.discipline}`,
    `Формат: ${input.formatType ?? "не указан"}`,
    `Даты: ${input.startDate.toISOString().slice(0, 10)} – ${input.endDate.toISOString().slice(0, 10)}`,
    "",
    "Текст поста организатора:",
    input.text.slice(0, 6000),
  ].join("\n");
}

export function enrichmentSourceHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function cleanList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => cleanLine(v, maxLen)).filter((v) => v.length >= 3))].slice(0, maxItems);
}

export function cleanTitle(value: unknown): string {
  const text = cleanLine(typeof value === "string" ? value.replace(/#[\p{L}\p{N}_]+/gu, "") : value, 90)
    .replace(/^[\s|—–-]+|[\s|—–-]+$/g, "");
  if (text.length < 8) return "";
  const letters = text.replace(/[^\p{L}]/gu, "");
  const upper = letters.replace(/[^\p{Lu}]/gu, "");
  if (letters.length > 0 && upper.length / letters.length > 0.6) return text.charAt(0) + text.slice(1).toLowerCase();
  return text;
}

function stems(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().replace(/ё/g, "е").match(/[\p{L}\p{N}]{4,}/gu) ?? []).map((w) => w.slice(0, 5)),
  );
}

/**
 * Защита от выдуманного «от организатора»: пункт принимается, только если хотя бы одно
 * значимое слово (по первым 5 буквам) встречается в тексте поста.
 */
export function groundedInSource(item: string, sourceStems: Set<string>): boolean {
  const words = [...stems(item)];
  return words.length === 0 ? false : words.some((w) => sourceStems.has(w));
}

const LEVEL_CLAIMS: ReadonlyArray<RegExp> = [
  /новичо?к|начинающ|с нуля|без опыта/i,
  /всех уровн|любого уровня|любой уровень|любым уровнем|разных уровн|всем уровням/i,
  /опытн|продвинут|профи/i,
];

/** «Для кого» с уровнем участников, которого нет в посте, — домысел модели. */
export function hasUnsupportedLevelClaim(text: string, sourceText: string): boolean {
  return LEVEL_CLAIMS.some((re) => re.test(text) && !re.test(sourceText));
}

export function parseCardEnrichment(raw: unknown, sourceText: string): CardEnrichmentResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { organizer?: Record<string, unknown>; notes?: Record<string, unknown> };
  const org = o.organizer && typeof o.organizer === "object" ? o.organizer : {};
  const notes = o.notes && typeof o.notes === "object" ? o.notes : {};
  const source = stems(sourceText);
  const grounded = (items: string[]) => items.filter((item) => groundedInSource(item, source));

  const audience = cleanLine(org.audienceFit, 400);
  return {
    organizer: {
      title: cleanTitle(org.title),
      audienceFit:
        audience && groundedInSource(audience, source) && !hasUnsupportedLevelClaim(audience, sourceText) ? audience : "",
      inclusions: grounded(cleanList(org.inclusions, 12, 160)),
      exclusions: grounded(cleanList(org.exclusions, 12, 160)),
      gearRequirements: grounded(cleanList(org.gearRequirements, 8, 160)),
    },
    notes: {
      general: cleanList(notes.general, 3, 200),
      accommodation: cleanLine(notes.accommodation, 200),
      transfer: cleanLine(notes.transfer, 200),
      gear: cleanLine(notes.gear, 200),
      cancellation: cleanLine(notes.cancellation, 200),
    },
  };
}

/** Обновление программы: только непустые поля и только те, что админ не правил вручную. */
export function buildEnrichmentUpdate(
  program: { manualFields: readonly string[] },
  result: CardEnrichmentResult,
  meta: { model: string; sourceHash: string; now: Date },
): { data: Partial<Record<EnrichableField, string>>; stored: StoredEnrichment } {
  const locked = new Set(program.manualFields);
  const candidates: Record<EnrichableField, string> = {
    title: result.organizer.title,
    audienceFit: result.organizer.audienceFit,
    inclusions: result.organizer.inclusions.join("\n"),
    exclusions: result.organizer.exclusions.join("\n"),
    gearRequirements: result.organizer.gearRequirements.join("\n"),
  };
  const data: Partial<Record<EnrichableField, string>> = {};
  for (const field of ENRICHABLE_FIELDS) {
    if (!locked.has(field) && candidates[field]) data[field] = candidates[field];
  }
  return {
    data,
    stored: {
      generatedAt: meta.now.toISOString(),
      model: meta.model,
      sourceHash: meta.sourceHash,
      fields: Object.keys(data) as EnrichableField[],
      notes: result.notes,
    },
  };
}

export function readStoredEnrichment(value: unknown): StoredEnrichment | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<StoredEnrichment>;
  if (typeof v.sourceHash !== "string" || !v.notes) return null;
  return v as StoredEnrichment;
}
