/**
 * Собирает web-ready JPEG для hero-киноленты: единый кадр 1920×1200 (16:10),
 * progressive JPEG, ~качество 82. Сначала — загрузка с Picsum (seeds, воспроизводимо),
 * при сетевом сбое — градиент-SVG → JPEG через sharp.
 *
 * Запуск из корня монорепо: pnpm --filter web run filmstrip:build-assets
 * или: cd apps/web && node ./scripts/build_filmstrip_web_images.mjs
 */
import { mkdir, stat } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");
const W = 1920;
const H = 1200;

const targets = [
  {
    rel: "media/filmstrip/wakesurf/wasurf_1.jpg",
    seed: "mww-hero-ws-a",
    fallback: { a: [13, 148, 136], b: [5, 78, 90] },
  },
  {
    rel: "media/filmstrip/wakesurf/wasurf_2.jpg",
    seed: "mww-hero-ws-b",
    fallback: { a: [8, 120, 128], b: [20, 60, 80] },
  },
  {
    rel: "media/filmstrip/mtb/mtbdh_1.jpg",
    seed: "mww-hero-mtb",
    fallback: { a: [34, 100, 55], b: [12, 45, 28] },
  },
  {
    rel: "media/filmstrip/ski/ski_kids_1.jpg",
    seed: "mww-hero-ski",
    fallback: { a: [200, 220, 240], b: [80, 130, 190] },
  },
  {
    rel: "media/filmstrip/kite/kite_1.jpg",
    seed: "mww-hero-kite",
    fallback: { a: [20, 90, 150], b: [40, 140, 200] },
  },
];

function svgGradient(hexA, hexB) {
  const a = `rgb(${hexA.join(",")})`;
  const b = `rgb(${hexB.join(",")})`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${a}"/>
<stop offset="1" stop-color="${b}"/>
</linearGradient>
</defs>
<rect width="100%" height="100%" fill="url(#g)"/>
</svg>`;
}

async function tryFetchPicsum(seed) {
  const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${W}/${H}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function normalizeToJpeg(input) {
  return sharp(input)
    .rotate()
    .resize(W, H, { fit: "cover", position: "attention" })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true, chromaSubsampling: "4:2:0" });
}

async function main() {
  let totalIn = 0;
  for (const t of targets) {
    const outPath = join(publicDir, t.rel);
    await mkdir(dirname(outPath), { recursive: true });

    let input = await tryFetchPicsum(t.seed);
    if (!input || input.length < 2000) {
      const { a, b } = t.fallback;
      const svg = svgGradient(a, b);
      input = await sharp(Buffer.from(svg, "utf8")).png().toBuffer();
    }

    await normalizeToJpeg(input).toFile(outPath);

    const st = await stat(outPath);
    totalIn += st.size;
    // eslint-disable-next-line no-console
    console.log("OK", t.rel, `${(st.size / 1024).toFixed(1)} KiB`);
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "filmstrip_assets_built", files: targets.length, totalBytes: totalIn }, null, 0));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
