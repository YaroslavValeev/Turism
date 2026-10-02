import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import {
  TELEGRAM_COLORS,
  TELEGRAM_EXPORT_PRESETS,
  TELEGRAM_MODES,
  TELEGRAM_RUBRIC_SPEC,
  type TelegramRubric,
  type TelegramVisualMode,
} from "./visualSystem";

/**
 * Рендер обложек Telegram Visual System v1 (детерминированный: одинаковые данные → одинаковый PNG).
 * На обложке только рубрика, короткий заголовок и 1–3 параметра; детали — нативным текстом поста.
 * Никаких псевдокнопок, QR, телефонов и прайсов на картинке (канон §9, §18).
 */

export type CoverFormat = "post" | "story";

export type CoverInput = {
  rubric: TelegramRubric;
  mode?: TelegramVisualMode;
  format?: CoverFormat;
  /** Короткий заголовок, 1–2 строки (редакционный override, исходные данные программы не меняет). */
  headline: string;
  /** География / дисциплина капслоком, например «FREERIDE · ШЕРЕГЕШ». */
  kicker?: string | null;
  /** Подзаголовок под заголовком: что за поездка («Вейксерф-кэмп»), 1 строка. */
  subhead?: string | null;
  /** До 3 коротких параметров: даты, длительность, «от … ₽». Пустые отбрасываются. */
  params?: Array<string | null | undefined>;
  /** Реальное фото (JPEG/PNG). Без фото — типографская обложка на фоне режима. */
  heroImage?: Buffer | null;
  /** Официальный логотип (PNG). Используется как небольшой brand mark, без искажений. */
  logo?: Buffer | null;
  /** COMPARE: ровно два объекта, у каждого заголовок и до 3 коротких строк. */
  compare?: [CompareSide, CompareSide] | null;
  /** SAFETY / GUIDE: до 4 пунктов чек-листа (только из данных организатора). */
  checklist?: Array<string | null | undefined> | null;
};

export type CompareSide = { title: string; lines: Array<string | null | undefined> };

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };

function h(type: string, style: Record<string, unknown>, children?: unknown, extra?: Record<string, unknown>): Node {
  return { type, props: { style, ...(extra ?? {}), ...(children !== undefined ? { children } : {}) } };
}

const FONT_STACK = "Inter Latin, Inter Cyrillic";

type FontFace = { name: string; data: Buffer; weight: 400 | 500 | 600 | 800 | 900; style: "normal" | "italic" };

let cachedFonts: FontFace[] | null = null;

function loadFonts(): FontFace[] {
  if (cachedFonts) return cachedFonts;
  const require = createRequire(__filename);
  const dir = path.join(path.dirname(require.resolve("@fontsource/inter/package.json")), "files");
  const faces = [
    [400, "normal"],
    [500, "normal"],
    [600, "normal"],
    [800, "normal"],
    [900, "italic"],
  ] as const;
  // @fontsource режет Inter на подмножества; satori не склеивает одноимённые файлы,
  // поэтому латиница и кириллица — отдельные семейства с fallback в FONT_STACK.
  cachedFonts = faces.flatMap(([weight, style]) =>
    (["latin", "cyrillic"] as const).map((subset) => ({
      name: subset === "latin" ? "Inter Latin" : "Inter Cyrillic",
      data: readFileSync(path.join(dir, `inter-${subset}-${weight}-${style}.woff`)),
      weight,
      style,
    })),
  );
  return cachedFonts;
}

const keyedLogos = new WeakMap<Buffer, { uri: string; width: number; height: number }>();

/**
 * Официальный PNG логотипа — бирюзовый знак на белом фоне. Убираем белый (alpha = 1 − R) и
 * заливаем знак фирменным Aqua: форма и цвет логотипа не меняются, пропадает только подложка.
 */
function keyedLogo(logo: Buffer): { uri: string; width: number; height: number } {
  const cached = keyedLogos.get(logo);
  if (cached) return cached;
  if (sniffMime(logo) !== "image/png") throw new Error("logo must be PNG");
  const width = logo.readUInt32BE(16);
  const height = logo.readUInt32BE(20);
  const hex = TELEGRAM_COLORS.aqua.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">` +
    `<filter id="k" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} -1.08 0 0 0 1.08"/></filter>` +
    `<image width="${width}" height="${height}" xlink:href="data:image/png;base64,${logo.toString("base64")}" filter="url(#k)"/></svg>`;
  const png = Buffer.from(new Resvg(svg).render().asPng());
  const out = { uri: `data:image/png;base64,${png.toString("base64")}`, width, height };
  keyedLogos.set(logo, out);
  return out;
}

function svgUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const ARROW_SVG = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><path d="M10 24h26M26 13l11 11-11 11" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
);
const CHECK_SVG = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><path d="M10 21l7 7 13-15" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
);

function sniffMime(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(1, 4).toString("ascii") === "PNG") return "image/png";
  return null;
}

function dataUri(buf: Buffer): string {
  const mime = sniffMime(buf);
  if (!mime) throw new Error("cover image must be JPEG or PNG");
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** Заголовок капслоком (Inter Black Italic), кегль по самому длинному слову и общей длине. */
function headlineSize(headline: string, format: CoverFormat): number {
  const text = headline.trim();
  const longestWord = Math.max(...text.split(/\s+/).map((w) => w.length));
  const base = format === "story" ? 1.08 : 1;
  // ~0.74em на знак капса Inter Black: самое длинное слово должно влезть в ~800px (952 минус кнопка-стрелка).
  const byWord = 800 / (Math.max(longestWord, 1) * 0.74);
  const byLength = text.length <= 10 ? 160 : text.length <= 18 ? 128 : text.length <= 28 ? 104 : 86;
  return Math.round(Math.min(byWord, byLength) * base);
}

function cleanParams(params: CoverInput["params"]): string[] {
  return (params ?? []).map((p) => p?.trim() ?? "").filter(Boolean).slice(0, 3);
}

function rubricLabel(rubric: TelegramRubric): Node {
  return h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      padding: "12px 24px",
      borderRadius: 12,
      backgroundColor: TELEGRAM_COLORS.aqua,
      color: TELEGRAM_COLORS.white,
      fontSize: 28,
      fontWeight: 800,
      letterSpacing: 3,
    },
    rubric,
  );
}

function brandMark(logo: Buffer | null | undefined): Node | null {
  if (!logo) return null;
  const keyed = keyedLogo(logo);
  const width = 300;
  const height = Math.round((keyed.height / keyed.width) * width);
  return h("img", { width, height, objectFit: "contain" }, undefined, { src: keyed.uri, width, height });
}

function arrowButton(): Node {
  return h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 112,
      height: 112,
      flexShrink: 0,
      borderRadius: 999,
      backgroundColor: TELEGRAM_COLORS.aqua,
      boxShadow: "0 10px 30px rgba(12,199,212,0.45)",
    },
    h("img", { width: 52, height: 52 }, undefined, { src: ARROW_SVG, width: 52, height: 52 }),
  );
}

function textBlock(input: CoverInput, mode: TelegramVisualMode, format: CoverFormat, onPhoto: boolean): Node {
  const palette = TELEGRAM_MODES[mode];
  const titleColor = onPhoto ? TELEGRAM_COLORS.white : palette.heading;
  const kickerColor = onPhoto ? TELEGRAM_COLORS.aqua : mode === "aqua" ? TELEGRAM_COLORS.deepOcean : TELEGRAM_COLORS.aqua;
  const paramColor = onPhoto ? TELEGRAM_COLORS.white : palette.text;
  const params = cleanParams(input.params);
  const size = headlineSize(input.headline, format);
  return h("div", { display: "flex", flexDirection: "column", gap: 20, flex: 1, minWidth: 0 }, [
    input.kicker
      ? h("div", { display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 4, color: kickerColor }, input.kicker.toUpperCase())
      : null,
    h(
      "div",
      {
        display: "block",
        fontSize: size,
        fontWeight: 900,
        fontStyle: "italic",
        lineHeight: 0.96,
        letterSpacing: -2,
        color: titleColor,
        lineClamp: 3,
        textShadow: onPhoto ? "0 4px 24px rgba(0,0,0,0.35)" : "none",
      },
      input.headline.trim().toUpperCase(),
    ),
    input.subhead
      ? h(
          "div",
          { display: "block", fontSize: 42, fontWeight: 800, letterSpacing: 2, lineHeight: 1.1, color: titleColor, lineClamp: 1 },
          input.subhead.trim().toUpperCase(),
        )
      : null,
    params.length
      ? h(
          "div",
          { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, fontSize: 34, fontWeight: 600, color: paramColor },
          params.flatMap((p, i) => (i ? [h("div", { display: "flex", color: TELEGRAM_COLORS.aqua }, "·"), h("div", { display: "flex" }, p)] : [h("div", { display: "flex" }, p)])),
        )
      : null,
  ].filter(Boolean));
}

function checklistBlock(items: string[], mode: TelegramVisualMode, onPhoto: boolean): Node {
  const dark = onPhoto || mode === "dark";
  return h(
    "div",
    { display: "flex", flexDirection: "column", gap: 18, width: "100%" },
    items.map((item) =>
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          gap: 26,
          padding: "24px 30px",
          borderRadius: 24,
          backgroundColor: dark ? "rgba(31,42,46,0.85)" : TELEGRAM_COLORS.white,
          border: `2px solid ${dark ? "rgba(12,199,212,0.45)" : "rgba(7,91,106,0.15)"}`,
        },
        [
          h(
            "div",
            { display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, flexShrink: 0, borderRadius: 999, backgroundColor: TELEGRAM_COLORS.aqua },
            h("img", { width: 36, height: 36 }, undefined, { src: CHECK_SVG, width: 36, height: 36 }),
          ),
          h(
            "div",
            { display: "block", fontSize: 40, fontWeight: 600, lineHeight: 1.15, color: dark ? TELEGRAM_COLORS.white : TELEGRAM_COLORS.night, lineClamp: 2 },
            item.charAt(0).toUpperCase() + item.slice(1),
          ),
        ],
      ),
    ),
  );
}

/**
 * Фирменная топографическая сетка (обои канала и фон обложек без фото). Детерминированная,
 * линии тонкие и низкоконтрастные — не шумят за текстом (канон §4).
 */
export function topographicSvg(mode: "light" | "dark", width = 1440, height = 2560): string {
  const bg = mode === "light" ? TELEGRAM_COLORS.sand : TELEGRAM_COLORS.night;
  const line = mode === "light" ? TELEGRAM_COLORS.deepOcean : TELEGRAM_COLORS.aqua;
  const opacity = mode === "light" ? 0.12 : 0.16;
  const sx = width / 1440;
  const sy = height / 2560;
  const peaks = [
    { x: 260, y: 420, n: 16, s: 34, a: 0.6, b: 1.7 },
    { x: 1180, y: 980, n: 18, s: 38, a: 2.1, b: 0.4 },
    { x: 420, y: 1720, n: 20, s: 36, a: 1.2, b: 2.6 },
    { x: 1250, y: 2300, n: 14, s: 40, a: 2.9, b: 1.1 },
  ];
  const k = Math.max(sx, sy);
  const paths: string[] = [];
  for (const p of peaks) {
    for (let i = 1; i <= p.n; i++) {
      const r0 = i * p.s * k;
      const pts: string[] = [];
      for (let j = 0; j <= 180; j++) {
        const t = (j / 180) * Math.PI * 2;
        const r = r0 * (1 + 0.18 * Math.sin(3 * t + p.a + i * 0.07) + 0.09 * Math.sin(5 * t + p.b - i * 0.05));
        pts.push(`${(p.x * sx + r * Math.cos(t)).toFixed(1)},${(p.y * sy + r * Math.sin(t)).toFixed(1)}`);
      }
      const stroke = (i % 5 === 0 ? 2.6 : 1.4) * k;
      paths.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${line}" stroke-opacity="${opacity}" stroke-width="${stroke.toFixed(2)}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${bg}"/>${paths.join("")}</svg>`;
}

function compareBlock(sides: [CompareSide, CompareSide], mode: TelegramVisualMode, onPhoto: boolean): Node {
  const palette = TELEGRAM_MODES[mode];
  const titleColor = onPhoto ? TELEGRAM_COLORS.white : palette.heading;
  const lineColor = onPhoto ? TELEGRAM_COLORS.sky : palette.text;
  const column = (side: CompareSide) =>
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        gap: 14,
        padding: "28px 26px",
        borderRadius: 24,
        backgroundColor: onPhoto ? "rgba(15,23,42,0.55)" : mode === "aqua" ? TELEGRAM_COLORS.white : TELEGRAM_COLORS.graphite,
        border: `3px solid ${TELEGRAM_COLORS.aqua}`,
      },
      [
        h("div", { display: "block", fontSize: 40, fontWeight: 800, lineHeight: 1.08, color: titleColor, lineClamp: 2 }, side.title),
        ...cleanParams(side.lines).map((l) => h("div", { display: "flex", fontSize: 30, fontWeight: 500, color: lineColor }, l)),
      ],
    );
  const vs = h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "absolute",
      left: "50%",
      top: "50%",
      width: 88,
      height: 88,
      marginLeft: -44,
      marginTop: -44,
      borderRadius: 999,
      backgroundColor: TELEGRAM_COLORS.aqua,
      color: TELEGRAM_COLORS.white,
      fontSize: 32,
      fontWeight: 900,
      fontStyle: "italic",
      border: `6px solid ${onPhoto ? TELEGRAM_COLORS.night : palette.background}`,
    },
    "VS",
  );
  // VS последним в дереве: satori рисует по порядку, так бейдж ложится поверх обеих карточек.
  return h("div", { display: "flex", position: "relative", gap: 24, width: "100%" }, [column(sides[0]), column(sides[1]), vs]);
}

export function buildCoverTree(input: CoverInput): { tree: Node; width: number; height: number } {
  const format = input.format ?? "post";
  const mode = input.mode ?? TELEGRAM_RUBRIC_SPEC[input.rubric].defaultMode;
  const preset = TELEGRAM_EXPORT_PRESETS[format];
  const { width, height } = preset;
  const margin = preset.safeMargin;
  // Story: верх и низ оставляем под интерфейс Telegram.
  const vPad = format === "story" ? 250 : margin;
  const palette = TELEGRAM_MODES[mode];
  const hero = input.heroImage ? dataUri(input.heroImage) : null;
  const checklist = (input.checklist ?? []).map((c) => c?.trim() ?? "").filter(Boolean).slice(0, 4);

  const layers: Array<Node | null> = [];
  if (hero) {
    layers.push(
      h("img", { position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }, undefined, { src: hero, width, height }),
    );
    const shade =
      mode === "aqua"
        ? "linear-gradient(180deg, rgba(4,40,48,0.55) 0%, rgba(7,91,106,0) 24%, rgba(7,91,106,0) 42%, rgba(7,60,72,0.55) 62%, rgba(4,32,40,0.94) 100%)"
        : "linear-gradient(180deg, rgba(15,23,42,0.60) 0%, rgba(15,23,42,0.05) 26%, rgba(15,23,42,0.10) 42%, rgba(15,23,42,0.75) 64%, rgba(15,23,42,0.98) 100%)";
    layers.push(h("div", { position: "absolute", top: 0, left: 0, width, height, backgroundImage: shade }));
  } else {
    const topo = Buffer.from(topographicSvg(mode === "aqua" ? "light" : "dark", width, height)).toString("base64");
    layers.push(
      h("img", { position: "absolute", top: 0, left: 0, width, height }, undefined, {
        src: `data:image/svg+xml;base64,${topo}`,
        width,
        height,
      }),
    );
  }

  const frame = h(
    "div",
    {
      position: "absolute",
      top: 0,
      left: 0,
      width,
      height,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: `${vPad}px ${margin}px`,
    },
    [
      h("div", { display: "flex", justifyContent: "space-between", alignItems: "center" }, [
        rubricLabel(input.rubric),
        brandMark(input.logo),
      ].filter(Boolean)),
      h(
        "div",
        { display: "flex", flexDirection: "column", gap: 40 },
        [
          h("div", { display: "flex", alignItems: "flex-end", gap: 32 }, [
            textBlock(input.compare ? { ...input, params: [] } : input, mode, format, Boolean(hero)),
            arrowButton(),
          ]),
          input.compare ? compareBlock(input.compare, mode, Boolean(hero)) : null,
          checklist.length ? checklistBlock(checklist, mode, Boolean(hero)) : null,
        ].filter(Boolean),
      ),
    ],
  );
  layers.push(frame);

  const tree = h(
    "div",
    { display: "flex", position: "relative", width, height, backgroundColor: palette.background, fontFamily: FONT_STACK },
    layers.filter(Boolean),
  );
  return { tree, width, height };
}

export async function renderCoverPng(input: CoverInput): Promise<Buffer> {
  const { tree, width, height } = buildCoverTree(input);
  // satori принимает React-подобное дерево; типы React здесь не нужны.
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width, height, fonts: loadFonts() });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng());
}
