const DISCIPLINE_TRANSLATIONS: Record<string, string> = {
  backcountry: "бэккантри",
  expedition: "экспедиция",
  freeride: "фрирайд",
  "heli-ski": "хели-ски",
  kite: "кайтсерфинг",
  mtb: "маунтинбайк",
  sailing: "яхтинг",
  ski: "горные лыжи",
  "ski tour": "ски-тур",
  "ski-tour": "ски-тур",
  snowboard: "сноуборд",
  snowmobile: "снегоход",
  sup: "сапбординг",
  surf: "серфинг",
  trekking: "трекинг",
  wakesurf: "вейксерф",
  wildlife: "дикая природа",
  yachting: "яхтинг",
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasCyrillic(value: string): boolean {
  return /[а-яё]/i.test(value);
}

function translatePart(part: string): string | null {
  const normalized = normalizeToken(part);
  if (!normalized || hasCyrillic(normalized)) return null;
  return DISCIPLINE_TRANSLATIONS[normalized] ?? null;
}

export type DisciplineDisplay = {
  original: string;
  translation: string | null;
};

export function getDisciplineDisplay(value: string | null | undefined): DisciplineDisplay {
  const original = String(value ?? "").trim() || "Уточняется";
  const parts = original.split(/\s*[/+]\s*/).map((part) => part.trim()).filter(Boolean);
  const translatedParts = parts.map(translatePart);

  if (!parts.length || translatedParts.every((part) => !part)) {
    return { original, translation: null };
  }

  const translation = parts
    .map((part, index) => translatedParts[index] ?? part)
    .join(original.includes("+") ? " + " : " / ");

  return translation.toLowerCase() === original.toLowerCase() ? { original, translation: null } : { original, translation };
}

export function getDisciplineCompactLabel(value: string | null | undefined): string {
  const display = getDisciplineDisplay(value);
  return display.translation ? `${display.original} · ${display.translation}` : display.original;
}
