import { describe, expect, it } from "vitest";
import { renderCoverPng, topographicSvg } from "./coverRenderer";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("coverRenderer", () => {
  it("renders a typographic post cover (no photo) at 1080×1350", async () => {
    const png = await renderCoverPng({
      rubric: "SAFETY",
      headline: "Требования к экипировке Susanin Race 2026",
      kicker: "Перед стартом",
      params: ["Шлем", "Защита", "Аптечка", "лишний параметр"],
    });
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
  }, 60_000);

  it("renders a compare story cover at 1080×1920", async () => {
    const png = await renderCoverPng({
      rubric: "COMPARE",
      format: "story",
      headline: "Wake surf: два лагеря",
      compare: [
        { title: "Relaxica", lines: ["12–19 июля", "7 дней"] },
        { title: "Wake Point", lines: ["По запросу"] },
      ],
    });
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 });
  }, 60_000);

  it("topographic background is deterministic and scales to the requested size", () => {
    const a = topographicSvg("light", 1080, 1350);
    expect(a).toBe(topographicSvg("light", 1080, 1350));
    expect(a).toContain('width="1080" height="1350"');
    expect(topographicSvg("dark")).not.toBe(topographicSvg("light"));
  });
});
