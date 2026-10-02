/**
 * Telegram Visual System v1: 8 тестовых публикаций (по одной на рубрику) на реальных данных каталога
 * + бренд-ассеты (аватар из официального логотипа, обои light/dark).
 *
 *   pnpm --filter ./services/api exec tsx scripts/telegram-visual-samples.ts
 *
 * Данные: публичный каталог (TG_SAMPLES_API, по умолчанию https://api.mywavetour.ru/programs),
 * фото: TG_SAMPLES_MEDIA_BASE (по умолчанию https://mywavetour.ru). Ничего не публикует.
 * Результат: docs/design/telegram-visual-system-v1/exports/ (PNG + manifest.json с подписями и кнопками).
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { renderCoverPng, topographicSvg, type CoverInput } from "../src/modules/telegram/coverRenderer";
import { buildChannelCtas, ctasToInlineKeyboard } from "../src/modules/telegram/channelClicks";
import { enhanceHeroPhoto } from "../src/modules/telegram/photoEnhance";
import { TELEGRAM_CAPTION_LIMIT, visibleCaptionLength } from "../src/modules/telegram/telegramPhoto";
import {
  TELEGRAM_ASSET_MANIFEST,
  TELEGRAM_COLORS,
  TELEGRAM_EXPORT_PRESETS,
  telegramExportFileName,
  type TelegramRubric,
} from "../src/modules/telegram/visualSystem";
import {
  bulletsFromFreeText,
  buildTelegramChannelPostHtml,
  durationLabel,
  escapeTelegramHtml,
  formatDateRangeRu,
  isIngestPlaceholderText,
  programRowToNotifySource,
  type ProgramNotifySource,
} from "../src/modules/subscriptions/programNotifyTemplates";

const REPO = path.resolve(__dirname, "../../..");
const OUT = path.join(REPO, "docs/design/telegram-visual-system-v1/exports");
const API = process.env.TG_SAMPLES_API ?? "https://api.mywavetour.ru/programs";
const MEDIA_BASE = (process.env.TG_SAMPLES_MEDIA_BASE ?? "https://mywavetour.ru").replace(/\/+$/, "");
const WEB_BASE = (process.env.TG_SAMPLES_WEB_BASE ?? "https://mywavetour.ru").replace(/\/+$/, "");
const DATE = new Date("2026-10-01T00:00:00Z");

type PublicProgram = Record<string, any> & { id: string; media?: Array<{ mediaType: string; url: string }> };

type Sample = {
  rubric: TelegramRubric;
  slug: string;
  programId: string;
  /** Индекс image-медиа программы, выбранного редактором (проверено: фото соответствует программе). */
  heroIndex?: number | null;
  cover: Omit<CoverInput, "rubric" | "heroImage" | "logo" | "params" | "checklist"> & {
    params?: (s: ProgramNotifySource) => string[];
    checklist?: (s: ProgramNotifySource) => string[];
  };
  caption?: (s: ProgramNotifySource, all: Map<string, ProgramNotifySource>) => string;
  compareWith?: string;
};

/** На обложке даты без года (канон §14: «15–22 февраля · 8 дней»); полная дата — в подписи. */
const when = (s: ProgramNotifySource) =>
  [formatDateRangeRu(s.startDate, s.endDate).replace(/\s\d{4}(?=\s—|$)/g, ""), durationLabel(s.startDate, s.endDate)].filter(
    Boolean,
  ) as string[];

const SAMPLES: Sample[] = [
  {
    rubric: "DESTINATION",
    slug: "kapchagay",
    programId: "cmum6tfc400msgghldh5t1ne3",
    heroIndex: 0,
    cover: { headline: "Капчагай", subhead: "Кемп на водохранилище", kicker: "Казахстан", params: when },
  },
  {
    rubric: "CAMP",
    slug: "krasnodar-wakesurf-relaxica",
    programId: "cmug9pvo000ccyiim0oau0mr1",
    heroIndex: 0,
    cover: { headline: "Краснодар", subhead: "Вейксерф-кэмп", kicker: "Wakesurf", params: when },
  },
  {
    rubric: "DROP",
    slug: "baikal-heliski",
    programId: "cmugp6s950004nzppfjror3fk",
    heroIndex: 0,
    cover: { headline: "Байкал", subhead: "Хели-ски", kicker: "Freeride", params: when },
  },
  {
    rubric: "GUIDE",
    slug: "sheregesh-freeride-schools",
    programId: "cmue1mv950005rpgifmy6iv6u",
    heroIndex: 2,
    cover: { headline: "Шерегеш", subhead: "Фрирайд-школы", kicker: "Freeride · гид", params: when },
  },
  {
    rubric: "PEOPLE",
    slug: "sheregesh-technical-course",
    programId: "cmufa6xfd00xhl57w7g77yp84",
    heroIndex: 0,
    cover: { headline: "Шерегеш", subhead: "Технический курс", kicker: "Лыжи и сноуборд", params: when },
  },
  {
    rubric: "STORY",
    slug: "georgia-freeride-camp",
    programId: "cmuf9n0ak00tpl57wgrv2l1ff",
    heroIndex: 0,
    cover: { headline: "Грузия", subhead: "Фрирайд-кэмп", kicker: "Freeride", mode: "dark", params: when },
  },
  {
    rubric: "COMPARE",
    slug: "krasnodar-wakesurf-camps",
    programId: "cmug9pvo000ccyiim0oau0mr1",
    compareWith: "cmug9qxjy00cmyiimgh0l3l68",
    heroIndex: null,
    cover: { headline: "Вейксерф", subhead: "Два кэмпа в Краснодаре", kicker: "Сравнение" },
    caption: (a, all) => compareCaption(a, all.get("cmug9qxjy00cmyiimgh0l3l68")!),
  },
  {
    rubric: "SAFETY",
    slug: "susanin-race-requirements",
    programId: "cmulpqtad001xgghlnfq5rq1j",
    heroIndex: null,
    cover: {
      headline: "Что нужно для старта",
      kicker: "Эндуро · Susanin Race",
      params: when,
      checklist: (s) =>
        bulletsFromFreeText(s.gearRequirements as string, 4, 44).filter((r) => !isIngestPlaceholderText(r)),
    },
    caption: (s) => safetyCaption(s),
  },
];

function short(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

function compareCaption(a: ProgramNotifySource, b: ProgramNotifySource): string {
  const side = (s: ProgramNotifySource) => {
    const org = s.organizerDisplayName ?? s.organizerName ?? s.title;
    const inc = isIngestPlaceholderText(s.inclusions) ? [] : bulletsFromFreeText(s.inclusions, 3, 70);
    return [
      `<b>${escapeTelegramHtml(org)}</b>`,
      `📅 ${escapeTelegramHtml(when(s).join(" · "))}`,
      ...inc.map((i) => `• ${escapeTelegramHtml(i)}`),
    ].join("\n");
  };
  return [
    "<i>Сравнение программ MyWaveTour</i>",
    "",
    "<b>Вейксерф в Краснодаре: два кэмпа этой осенью</b>",
    "",
    side(a),
    "",
    side(b),
    "",
    "Состав и условия — по данным организаторов на карточках программ. Кнопки ниже ведут к первой программе.",
  ].join("\n");
}

function safetyCaption(s: ProgramNotifySource & { gearRequirements?: string | null }): string {
  const req = bulletsFromFreeText(s.gearRequirements, 5, 120).filter((r) => !isIngestPlaceholderText(r));
  return [
    "<i>Safety · подготовка к старту</i>",
    "",
    `<b>${escapeTelegramHtml(s.title)}</b>`,
    `📅 <b>${escapeTelegramHtml(formatDateRangeRu(s.startDate, s.endDate))}</b>`,
    s.location ? `📍 ${escapeTelegramHtml([s.location, s.region].filter(Boolean).join(", "))}` : `📍 ${escapeTelegramHtml(s.region)}`,
    "",
    "<b>Что потребуется по данным организатора</b>",
    ...req.map((r) => `• ${escapeTelegramHtml(r)}`),
    "",
    "Требования могут меняться — уточните их у организатора до заявки. Без документов к старту не допускают.",
  ].join("\n");
}

async function fetchBuffer(url: string, attempts = 3): Promise<Buffer> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i >= attempts) throw e;
      await new Promise((res) => setTimeout(res, 2000 * i));
    }
  }
}

function toSource(p: PublicProgram): ProgramNotifySource & { gearRequirements?: string | null } {
  return {
    ...programRowToNotifySource({
      ...p,
      startDate: new Date(p.startDate),
      endDate: new Date(p.endDate),
      organizer: p.organizer ? { displayName: p.organizer.displayName } : null,
    } as Parameters<typeof programRowToNotifySource>[0]),
    gearRequirements: p.gearRequirements ?? null,
  };
}

function programUrl(id: string, rubric: TelegramRubric): string {
  const u = new URL(`${WEB_BASE}/program/${id}`);
  u.searchParams.set("utm_source", "telegram_channel");
  u.searchParams.set("utm_medium", "visual_system_v1");
  u.searchParams.set("utm_campaign", `sample_${rubric.toLowerCase()}`);
  return u.toString();
}

async function renderBrand(logo: Buffer) {
  const fontsFree = { width: 1080, height: 1080, fonts: [] as [] };
  const avatarTree = {
    type: "div",
    props: {
      style: { display: "flex", width: 1080, height: 1080, alignItems: "center", justifyContent: "center", backgroundColor: TELEGRAM_COLORS.white },
      children: { type: "img", props: { src: `data:image/png;base64,${logo.toString("base64")}`, width: 760, height: 297, style: { objectFit: "contain" } } },
    },
  };
  const avatarSvg = await satori(avatarTree as never, fontsFree);
  writeFileSync(path.join(OUT, "brand", telegramExportFileName({ kind: "avatar", version: 1 })), new Resvg(avatarSvg).render().asPng());

  for (const mode of ["light", "dark"] as const) {
    const svg = topographicSvg(mode);
    writeFileSync(
      path.join(OUT, "brand", telegramExportFileName({ kind: "wallpaper", mode, version: 1 })),
      new Resvg(svg, { fitTo: { mode: "width", value: 1440 } }).render().asPng(),
    );
  }
}

async function main() {
  mkdirSync(path.join(OUT, "samples"), { recursive: true });
  mkdirSync(path.join(OUT, "brand"), { recursive: true });
  const logo = readFileSync(path.join(REPO, TELEGRAM_ASSET_MANIFEST.officialLogo));
  await renderBrand(logo);

  const programs: PublicProgram[] = JSON.parse((await fetchBuffer(API)).toString("utf8"));
  const byId = new Map(programs.map((p) => [p.id, p]));
  const sources = new Map([...byId.entries()].map(([id, p]) => [id, toSource(p)]));

  // TG_SAMPLES_ONLY=SAFETY,CAMP — быстрый перерендер отдельных обложек; manifest.json при этом не трогаем.
  const only = process.env.TG_SAMPLES_ONLY?.split(",").map((s) => s.trim().toUpperCase());
  const manifest: unknown[] = [];
  for (const sample of SAMPLES.filter((s) => !only || only.includes(s.rubric))) {
    const program = byId.get(sample.programId);
    if (!program) throw new Error(`program ${sample.programId} is not in the public catalog`);
    const src = sources.get(sample.programId)!;
    const images = (program.media ?? []).filter((m) => m.mediaType === "image");
    const heroRef = sample.heroIndex != null ? images[sample.heroIndex]?.url : null;
    const rawHero = heroRef ? await fetchBuffer(heroRef.startsWith("http") ? heroRef : `${MEDIA_BASE}${heroRef}`) : null;
    const enhanced = rawHero ? await enhanceHeroPhoto(rawHero, TELEGRAM_EXPORT_PRESETS[sample.cover.format ?? "post"]) : null;
    if (enhanced && !enhanced.ok) console.warn(`  ${sample.rubric}: ${enhanced.reason} → типографская обложка`);
    const heroImage = enhanced?.ok ? enhanced.buffer : null;

    const compare =
      sample.compareWith && sources.get(sample.compareWith)
        ? ([src, sources.get(sample.compareWith)!].map((s) => ({
            title: s.organizerDisplayName ?? s.organizerName ?? s.title,
            lines: when(s),
          })) as CoverInput["compare"])
        : null;

    const png = await renderCoverPng({
      ...sample.cover,
      rubric: sample.rubric,
      params: sample.cover.params?.(src) ?? [],
      checklist: sample.cover.checklist?.(src) ?? null,
      heroImage,
      logo,
      compare,
    });
    const file = telegramExportFileName({ kind: "post", rubric: sample.rubric, slug: sample.slug, date: DATE, version: 1 });
    writeFileSync(path.join(OUT, "samples", file), png);

    const caption = sample.caption
      ? sample.caption(src, sources)
      : buildTelegramChannelPostHtml(src, { captionLimit: TELEGRAM_CAPTION_LIMIT, measure: visibleCaptionLength });
    const keyboard = ctasToInlineKeyboard(
      buildChannelCtas({ programUrl: programUrl(sample.programId, sample.rubric), askUrl: process.env.TELEGRAM_CHANNEL_ASK_URL }),
    );
    manifest.push({
      rubric: sample.rubric,
      programId: sample.programId,
      file: `samples/${file}`,
      heroMedia: heroRef,
      captionHtml: caption,
      captionVisibleLength: visibleCaptionLength(caption),
      replyMarkup: keyboard,
    });
    console.log(`${sample.rubric.padEnd(12)} ${file}  caption=${visibleCaptionLength(caption)}`);
  }
  if (!only) writeFileSync(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`done → ${path.relative(REPO, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
