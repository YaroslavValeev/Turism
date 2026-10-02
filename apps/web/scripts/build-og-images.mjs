/**
 * Превью-картинки для ссылок (Open Graph) и обложка Telegram Mini App.
 *   node apps/web/scripts/build-og-images.mjs
 * Логотип — public/brand/mywavetour-logo-human.png (на белом фоне), поэтому фон картинок белый.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logoPath = path.join(root, "public/brand/mywavetour-logo-human.png");
const FONT = "Segoe UI, Arial, Helvetica, sans-serif";
const ACCENT = "#0f766e";
const AQUA = "#1cc6d2";

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function pillsSvg(labels, { y, height, fontSize, gap, width }) {
  const padding = fontSize * 0.9;
  const widths = labels.map((l) => Math.round(l.length * fontSize * 0.56 + padding * 2));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (labels.length - 1);
  let x = (width - total) / 2;
  return labels
    .map((label, i) => {
      const w = widths[i];
      const filled = i < 2;
      const out = `<rect x="${x}" y="${y}" width="${w}" height="${height}" rx="${height / 2}" fill="${filled ? ACCENT : "#fff"}" stroke="${ACCENT}" stroke-width="3"/>
        <text x="${x + w / 2}" y="${y + height / 2 + fontSize * 0.36}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize}" font-weight="700" fill="${filled ? "#fff" : ACCENT}">${escape(label)}</text>`;
      x += w + gap;
      return out;
    })
    .join("");
}

// Фон логотипа не идеально белый: берём цвет угла, чтобы не было видно прямоугольника.
const { data: corner } = await sharp(logoPath).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
const background = { r: corner[0], g: corner[1], b: corner[2] };

async function compose({ width, height, logoWidth, logoTop, overlaySvg, out }) {
  const logo = await sharp(logoPath).resize({ width: logoWidth }).png().toBuffer();
  const { height: logoHeight } = await sharp(logo).metadata();
  const band = Math.round(height * 0.035);
  const base = sharp({ create: { width, height, channels: 3, background } });
  const layers = [
    { input: logo, left: Math.round((width - logoWidth) / 2), top: logoTop },
    {
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${overlaySvg(logoTop + logoHeight)}
          <rect x="0" y="${height - band}" width="${width}" height="${band}" fill="${AQUA}"/></svg>`,
      ),
      left: 0,
      top: 0,
    },
  ];
  mkdirSync(path.dirname(out), { recursive: true });
  await base.composite(layers).png({ compressionLevel: 9 }).toFile(out);
  console.log(`wrote ${path.relative(root, out)} ${width}x${height}`);
}

await compose({
  width: 1200,
  height: 630,
  logoWidth: 760,
  logoTop: 24,
  out: path.join(root, "public/og/date-search.png"),
  overlaySvg: (logoBottom) => `
    <text x="600" y="${logoBottom + 36}" text-anchor="middle" font-family="${FONT}" font-size="64" font-weight="800" fill="#0f172a">Поиск по датам</text>
    ${pillsSvg(["Эти выходные", "Следующие", "Свои даты"], { y: logoBottom + 76, height: 76, fontSize: 32, gap: 18, width: 1200 })}`,
});

await compose({
  width: 1200,
  height: 630,
  logoWidth: 900,
  logoTop: 70,
  out: path.join(root, "public/og/mywavetour.png"),
  overlaySvg: (logoBottom) => `
    <text x="600" y="${logoBottom + 40}" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="600" fill="#334155">Кэмпы и спортивные выезды по России</text>`,
});

await compose({
  width: 640,
  height: 360,
  logoWidth: 440,
  logoTop: 16,
  out: path.join(root, "public/og/telegram-miniapp-640x360.png"),
  overlaySvg: (logoBottom) => `
    <text x="320" y="${logoBottom + 18}" text-anchor="middle" font-family="${FONT}" font-size="36" font-weight="800" fill="#0f172a">Поиск по датам</text>
    ${pillsSvg(["Эти выходные", "Следующие", "Свои даты"], { y: logoBottom + 40, height: 44, fontSize: 18, gap: 10, width: 640 })}`,
});
