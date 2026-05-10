/** Обложка карточки каталога: первое image из API или CSS-плейсхолдер. */

export type ProgramMediaItem = { url: string; mediaType: string };
export type ProgramCardCoverFit = "cover" | "contain";
export const PROGRAM_CARD_PLACEHOLDER_URL = "/images/placeholders/program-card.svg";

function isBrokenLiteralUrl(url: string): boolean {
  const lowered = url.trim().toLowerCase();
  return (
    lowered === "null" ||
    lowered === "undefined" ||
    lowered.endsWith("/null") ||
    lowered.endsWith("/undefined")
  );
}

function isLocalMediaUrl(url: string): boolean {
  return url.startsWith("/");
}

function shouldProxyMediaUrl(url: string): boolean {
  if (isLocalMediaUrl(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function presentProgramMediaUrl(url: string | null | undefined): string | null {
  const normalized = String(url ?? "").trim();
  if (!normalized) return null;
  if (isBrokenLiteralUrl(normalized)) return null;
  if (isLocalMediaUrl(normalized)) return normalized;
  if (!shouldProxyMediaUrl(normalized)) return normalized;
  return `/api/media?url=${encodeURIComponent(normalized)}`;
}

/**
 * Финальный src для <img> на карточке: nginx отдаёт REST на `/api/*`, а Next — только `/api/media`;
 * битые `/api/programs/...` и т.п. превращаем в плейсхолдер, чтобы не было массовых 404.
 */
export function normalizeProgramCardCoverSrc(url: string): string {
  const s = String(url).trim();
  if (!s) return PROGRAM_CARD_PLACEHOLDER_URL;
  if (isBrokenLiteralUrl(s)) return PROGRAM_CARD_PLACEHOLDER_URL;
  if (s.includes("<") || s.includes(">")) return PROGRAM_CARD_PLACEHOLDER_URL;
  if (/\s/.test(s) && !s.startsWith("/")) return PROGRAM_CARD_PLACEHOLDER_URL;
  if (s.startsWith("data:")) return PROGRAM_CARD_PLACEHOLDER_URL;
  if (s.startsWith("/api/") && !s.startsWith("/api/media")) return PROGRAM_CARD_PLACEHOLDER_URL;
  if (/^(https?:)?\/\//i.test(s)) {
    try {
      const parsed = new URL(s.startsWith("//") ? `https:${s}` : s);
      if (!["http:", "https:"].includes(parsed.protocol)) return PROGRAM_CARD_PLACEHOLDER_URL;
    } catch {
      return PROGRAM_CARD_PLACEHOLDER_URL;
    }
  }
  return s;
}

export function hasRenderableProgramCardCoverSrc(url: string | null | undefined): boolean {
  return normalizeProgramCardCoverSrc(String(url ?? "")) !== PROGRAM_CARD_PLACEHOLDER_URL;
}

export function applyProgramCardImageFallback(img: HTMLImageElement): void {
  if (img.dataset.fallbackApplied === "1") return;
  img.dataset.fallbackApplied = "1";
  img.src = PROGRAM_CARD_PLACEHOLDER_URL;
}

function isLikelyStatsOrClimateInfographicContext(text: string): boolean {
  const t = String(text ?? "")
    .trim()
    .toLowerCase();
  if (t.length < 24) return false;
  if (/температур(а|ы)?\s+воды|воды.*температур|средн(яя|ей)\s+температур|таблиц\w*\s+месяц|по\s+месяц\w*.*градус|в\s+течени[еи]\s+года|график\w*.*температур/i.test(t)) {
    return true;
  }
  const hits = [
    /температур/i,
    /таблиц/i,
    /график/i,
    /средн(яя|ей)/i,
    /градус\w*/i,
  ].filter((p) => p.test(t)).length;
  return hits >= 2;
}

/** URL, похожий на логотип/OG-баннер, а не на фото события — пропускаем при выборе обложки, если есть альтернативы. */
function isPromoGraphicUrl(url: string): boolean {
  const n = url.trim().toLowerCase();
  return (
    n.endsWith(".svg") ||
    /(?:^|[/._-])(logo|avatar|icon|badge|mark|brand)(?:[._-]|$)/i.test(n) ||
    n.includes("meta_og") ||
    n.includes("logoinst")
  );
}

/** Первое фото в альбоме TG нередко — инфографика; при «климатическом» тексте берём изображения в обратном порядке. */
export function pickBestProgramCoverImageUrl(
  media: ProgramMediaItem[] | undefined,
  contextHint: string | null | undefined,
): string | null {
  if (!media?.length) return null;
  const images = media.filter((m) => m.mediaType === "image" && m.url?.trim());
  if (images.length === 0) return null;
  const climate = isLikelyStatsOrClimateInfographicContext(String(contextHint ?? ""));
  // Раньше при одном фото и «климатическом» описании возвращали null → пустая карточка; лучше показать кадр, чем ничего.
  if (climate && images.length === 1) {
    return presentProgramMediaUrl(images[0]?.url ?? null);
  }
  const ordered = climate ? [...images].reverse() : images;
  if (ordered.length > 1) {
    for (const img of ordered) {
      const u = img?.url?.trim();
      if (!u) continue;
      if (isPromoGraphicUrl(u)) continue;
      return presentProgramMediaUrl(u);
    }
  }
  const u = ordered[0]?.url;
  return presentProgramMediaUrl(u ?? null);
}

export function firstProgramCoverImageUrl(media: ProgramMediaItem[] | undefined): string | null {
  return pickBestProgramCoverImageUrl(media, null);
}

/** Для галереи на PDP: при «инфографичном» тексте показывать снимки в порядке, удобном глазу (не с таблицы первой). */
export function orderProgramMediaForDisplay<T extends ProgramMediaItem & { id?: string }>(
  media: T[] | undefined,
  contextHint: string | null | undefined,
): T[] {
  if (!media?.length || media.length <= 1) return media ?? [];
  if (!isLikelyStatsOrClimateInfographicContext(String(contextHint ?? ""))) return media;
  return [...media].reverse();
}

function normalizeUrl(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function programCardCoverFit(url: string | null | undefined, title: string, organizerName?: string | null): ProgramCardCoverFit {
  const normalizedUrl = normalizeUrl(url);
  const normalizedTitle = `${title} ${organizerName ?? ""}`.toLowerCase();
  const isGraphicAsset =
    normalizedUrl.endsWith(".svg") ||
    /(?:^|[\/_-])(logo|avatar|icon|badge|mark|brand)(?:[._-]|$)/i.test(normalizedUrl) ||
    normalizedUrl.includes("meta_og") ||
    normalizedUrl.includes("logoinst") ||
    normalizedUrl.includes("placeholder");

  const isBrandLikeCard =
    /saratovsurfcamp|freetime|bonus summer camp|offys|wakehouse/i.test(normalizedTitle);

  return isGraphicAsset || isBrandLikeCard ? "contain" : "cover";
}

type CoverTheme = "krasnodar" | "dubai" | "bodrum";

function themeFromId(id: string): CoverTheme {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const m = Math.abs(h) % 3;
  if (m === 0) return "krasnodar";
  if (m === 1) return "dubai";
  return "bodrum";
}

/** Класс модификатора для градиента (совпадает с палитрой adventure-карусели). */
export function programCardCoverPlaceholderClass(title: string, id: string): string {
  if (/WaveLine/i.test(title)) return "mw-program-card__cover-placeholder--krasnodar";
  if (/SouthCrew/i.test(title)) return "mw-program-card__cover-placeholder--dubai";
  if (/Kuban|Family/i.test(title)) return "mw-program-card__cover-placeholder--bodrum";
  return `mw-program-card__cover-placeholder--${themeFromId(id)}`;
}
