import sharp from "sharp";

/**
 * Автоподготовка фото для обложек Telegram: кадрирование под формат,
 * мягкая автокоррекция уровней, насыщенности и резкости. Содержимое кадра не меняется (без генерации).
 * Слишком маленькие исходники отбраковываются: апскейл больше чем в MAX_UPSCALE раз даёт «мыло».
 */

// 450 px по ширине (типично для фото организаторов) → ×2.4 ещё выглядит прилично после lanczos + sharpen; 180×320 (×6) — нет.
export const MAX_UPSCALE = 3;

export type EnhancedPhoto =
  | { ok: true; buffer: Buffer; source: { width: number; height: number }; upscale: number }
  | { ok: false; reason: string; source: { width: number; height: number } };

export async function enhanceHeroPhoto(input: Buffer, target: { width: number; height: number }): Promise<EnhancedPhoto> {
  const meta = await sharp(input).metadata();
  // EXIF-ориентация 5–8 меняет местами ширину и высоту.
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  const source = { width, height };
  if (!width || !height) return { ok: false, reason: "не удалось прочитать размер фото", source };

  const upscale = Math.max(target.width / width, target.height / height);
  if (upscale > MAX_UPSCALE) {
    return { ok: false, reason: `фото ${width}×${height} слишком маленькое для ${target.width}×${target.height}`, source };
  }

  const buffer = await sharp(input)
    .rotate()
    // Кроп по центру: «attention» на тестах срезал главный объект (вертолёт) ради фактуры снега.
    .resize(target.width, target.height, { fit: "cover", position: "centre", kernel: "lanczos3" })
    .normalise({ lower: 1, upper: 99 })
    .modulate({ saturation: 1.1, brightness: 1.02 })
    .sharpen({ sigma: upscale > 1.2 ? 1.1 : 0.6 })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  return { ok: true, buffer, source, upscale: Number(upscale.toFixed(2)) };
}
