/**
 * Telegram Visual System v1 — единый источник токенов, форматов, рубрик и ассетов для канала MyWaveTour.
 * Канон: docs/design/telegram-visual-system-v1/README.md. Изменение ядра (палитра, шрифт, рубрики,
 * роль Aqua/Dark) — только новой версией канона с approve владельца; здесь значения не «подкручиваем».
 * Токены относятся только к Telegram: палитра сайта (apps/web globals.css) живёт отдельно.
 */

export const TELEGRAM_VISUAL_SYSTEM_VERSION = "1.0" as const;

export const TELEGRAM_COLORS = {
  aqua: "#0CC7D4",
  deepOcean: "#075B6A",
  night: "#0F172A",
  graphite: "#1F2A2E",
  sky: "#E6F7F8",
  sand: "#F7F9FA",
  stone: "#64748B",
  sun: "#F4D7A7",
  coral: "#FF7B6B",
  white: "#FFFFFF",
} as const;

export type TelegramVisualMode = "aqua" | "dark";

/** Aqua — режим по умолчанию (~70–80% публикаций); Dark — редакционный акцент (~20–30%). */
export const TELEGRAM_MODES: Record<
  TelegramVisualMode,
  { background: string; surface: string; text: string; mutedText: string; accent: string; heading: string }
> = {
  aqua: {
    background: TELEGRAM_COLORS.sand,
    surface: TELEGRAM_COLORS.sky,
    text: TELEGRAM_COLORS.night,
    mutedText: TELEGRAM_COLORS.stone,
    accent: TELEGRAM_COLORS.aqua,
    heading: TELEGRAM_COLORS.deepOcean,
  },
  dark: {
    background: TELEGRAM_COLORS.night,
    surface: TELEGRAM_COLORS.graphite,
    text: TELEGRAM_COLORS.white,
    mutedText: TELEGRAM_COLORS.sky,
    accent: TELEGRAM_COLORS.aqua,
    heading: TELEGRAM_COLORS.white,
  },
};

export const TELEGRAM_TYPOGRAPHY = {
  fontFamily: "Inter",
  weights: { headline: 800, subheading: 600, body: 400, label: 500 },
  /** Заголовок обложки — 1–2 строки; капслок только для рубрики/географии. */
  coverHeadlineMaxLines: 2,
} as const;

export const TELEGRAM_SPACING = [8, 16, 24, 32, 48, 64] as const;
export const TELEGRAM_RADIUS = { min: 16, max: 24 } as const;
/** Минимальный контраст текста (WCAG): обычный / крупный. */
export const TELEGRAM_CONTRAST = { normal: 4.5, large: 3 } as const;

export type TelegramExportFormat = "post" | "story" | "avatar" | "videoVertical" | "videoHorizontal";

export const TELEGRAM_EXPORT_PRESETS: Record<
  TelegramExportFormat,
  { width: number; height: number; safeMargin: number; note: string }
> = {
  post: { width: 1080, height: 1350, safeMargin: 64, note: "Feed / editorial 4:5, поле 48–64 px" },
  story: { width: 1080, height: 1920, safeMargin: 64, note: "Story / Album 9:16, верх и низ свободны под UI Telegram" },
  avatar: { width: 1080, height: 1080, safeMargin: 130, note: "Круговая маска, свободный край ≥12% диаметра" },
  videoVertical: { width: 1080, height: 1920, safeMargin: 64, note: "Обложка вертикального видео / Stories" },
  videoHorizontal: { width: 1280, height: 720, safeMargin: 48, note: "Обложка горизонтального видео" },
};

export const TELEGRAM_RUBRICS = [
  "DESTINATION",
  "CAMP",
  "DROP",
  "GUIDE",
  "PEOPLE",
  "STORY",
  "COMPARE",
  "SAFETY",
] as const;
export type TelegramRubric = (typeof TELEGRAM_RUBRICS)[number];

export const TELEGRAM_RUBRIC_SPEC: Record<TelegramRubric, { meaning: string; defaultMode: TelegramVisualMode }> = {
  DESTINATION: { meaning: "Локация / направление / spot", defaultMode: "aqua" },
  CAMP: { meaning: "Кэмп / программа / выезд", defaultMode: "aqua" },
  DROP: { meaning: "Новый выезд / сезонный запуск", defaultMode: "aqua" },
  GUIDE: { meaning: "Гид, маршрут, экспертный материал", defaultMode: "aqua" },
  PEOPLE: { meaning: "Люди, тренеры, участники, комьюнити", defaultMode: "aqua" },
  STORY: { meaning: "История поездки / репортаж", defaultMode: "aqua" },
  COMPARE: { meaning: "Сравнение программ, мест, снаряжения", defaultMode: "aqua" },
  SAFETY: { meaning: "Риски, подготовка, страховка, правила", defaultMode: "dark" },
};

export const TELEGRAM_STORY_ALBUMS = [
  { slug: "camps", title: "КЭМПЫ" },
  { slug: "freeride", title: "ФРИРАЙД" },
  { slug: "wake", title: "WAKE" },
  { slug: "enduro", title: "ЭНДУРО" },
  { slug: "guides", title: "ГИДЫ" },
  { slug: "people", title: "ЛЮДИ" },
  { slug: "reviews", title: "ОТЗЫВЫ" },
  { slug: "tips", title: "ГАЙДЫ/СОВЕТЫ" },
] as const;
export type TelegramStoryAlbumSlug = (typeof TELEGRAM_STORY_ALBUMS)[number]["slug"];

/** Пути относительно корня репозитория. Логотип — только официальный исходник, без перерисовки. */
export const TELEGRAM_ASSET_MANIFEST = {
  officialLogo: "apps/web/public/brand/mywavetour-logo-official.png",
  canonPdf: "docs/design/telegram-visual-system-v1/canon/MyWaveTour_Telegram_Visual_System_v1_CANON.pdf",
  implementationBriefPdf: "docs/design/telegram-visual-system-v1/canon/Implementation_Brief_Tour_Team_v1.pdf",
  referenceAqua: "docs/design/telegram-visual-system-v1/references/Reference_A_Adventure_Magazine_Aqua.png",
  referenceDark: "docs/design/telegram-visual-system-v1/references/Reference_B_Premium_Dark_Editorial.png",
} as const;

export type TelegramExportName =
  | { kind: "post"; rubric: TelegramRubric; slug: string; date: Date; version: number }
  | { kind: "story"; album: TelegramStoryAlbumSlug; slug: string; date: Date; version: number }
  | { kind: "video"; slug: string; orientation: "vertical" | "horizontal"; version: number }
  | { kind: "avatar"; version: number }
  | { kind: "wallpaper"; mode: "light" | "dark"; version: number };

function slugPart(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`telegram export name: empty slug for "${value}"`);
  return slug;
}

function datePart(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function versionPart(v: number): string {
  if (!Number.isInteger(v) || v < 1 || v > 99) throw new Error(`telegram export name: bad version ${v}`);
  return `v${String(v).padStart(2, "0")}`;
}

/** Имена экспортов по канону (§17): tg_post_<type>_<slug>_<YYYYMMDD>_vNN.png и т. д. */
export function telegramExportFileName(spec: TelegramExportName): string {
  switch (spec.kind) {
    case "post":
      return `tg_post_${slugPart(spec.rubric)}_${slugPart(spec.slug)}_${datePart(spec.date)}_${versionPart(spec.version)}.png`;
    case "story":
      return `tg_story_${slugPart(spec.album)}_${slugPart(spec.slug)}_${datePart(spec.date)}_${versionPart(spec.version)}.png`;
    case "video":
      return `tg_video_${slugPart(spec.slug)}_${spec.orientation}_${versionPart(spec.version)}.png`;
    case "avatar":
      return `tg_brand_avatar_${versionPart(spec.version)}.png`;
    case "wallpaper":
      return `tg_brand_wallpaper_${spec.mode}_${versionPart(spec.version)}.png`;
  }
}
