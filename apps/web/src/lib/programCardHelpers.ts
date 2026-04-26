type LocProgram = { region: string; exactLocation?: string | null };

export function sourceTypeLabelRu(t: string | null | undefined): string {
  const k = String(t ?? "").toLowerCase();
  if (k === "instagram") return "Instagram";
  if (k === "telegram") return "Telegram";
  if (k === "rss") return "RSS";
  if (k === "site" || k === "website") return "сайт";
  return t ? t : "источник";
}

export function reviewWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отзыва";
  return "отзывов";
}

export function organizerVerificationLabelRu(status: string | null | undefined): string {
  switch (status) {
    case "trusted_by_platform":
      return "Статус публикации: данные проверены (trusted)";
    case "verified":
      return "Статус публикации: данные проверены (verified)";
    case "checked":
      return "Статус публикации: проверка данных (checked)";
    case "listed":
      return "Статус публикации: в каталоге";
    case "paused":
      return "Статус публикации: приостановлена";
    case "rejected":
      return "Статус публикации: отклонено";
    default:
      return "Статус публикации: нет данных";
  }
}

function sanitizeLocation(value: string | null | undefined): string | null {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  const parts = normalized
    .split(/[·•|]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    return parts[parts.length - 1] ?? normalized;
  }
  return normalized;
}

export function resolveLocation(program: LocProgram): { primary: string; secondary: string | null } {
  const exact = sanitizeLocation(program.exactLocation);
  const region = sanitizeLocation(program.region);

  if (exact && region && exact.toLowerCase() !== region.toLowerCase()) {
    return { primary: exact, secondary: region };
  }
  if (exact) {
    return { primary: exact, secondary: null };
  }
  if (region) {
    return { primary: region, secondary: null };
  }
  return { primary: "Уточняется", secondary: null };
}

export function riskLabel(value: string | null | undefined): string {
  switch (String(value ?? "").toLowerCase()) {
    case "low":
      return "низкий";
    case "medium":
      return "средний";
    case "high":
      return "высокий";
    case "extreme":
      return "высокий, нужен опыт";
    default:
      return "уточняется у организатора";
  }
}

export function audienceShort(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text) return "по уровню и формату программы";
  return text.length > 86 ? `${text.slice(0, 83).trimEnd()}...` : text;
}
