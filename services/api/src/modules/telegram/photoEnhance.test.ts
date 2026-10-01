import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { enhanceHeroPhoto } from "./photoEnhance";

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 160 } } }).jpeg().toBuffer();

describe("enhanceHeroPhoto", () => {
  it("crops and resizes a usable photo to the cover format", async () => {
    const res = await enhanceHeroPhoto(await solid(1600, 1200), { width: 1080, height: 1350 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const meta = await sharp(res.buffer).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1080, 1350, "jpeg"]);
  });

  it("rejects photos that would need more than 3x upscale", async () => {
    const res = await enhanceHeroPhoto(await solid(180, 320), { width: 1080, height: 1350 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain("180×320");
  });
});
