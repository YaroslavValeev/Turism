import { existsSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  TELEGRAM_ASSET_MANIFEST,
  TELEGRAM_COLORS,
  TELEGRAM_EXPORT_PRESETS,
  TELEGRAM_RUBRICS,
  TELEGRAM_RUBRIC_SPEC,
  telegramExportFileName,
} from "./visualSystem";

const repoRoot = path.resolve(__dirname, "../../../../..");

describe("telegram visual system v1", () => {
  it("keeps canon colors and export sizes", () => {
    expect(TELEGRAM_COLORS.aqua).toBe("#0CC7D4");
    expect(TELEGRAM_COLORS.deepOcean).toBe("#075B6A");
    expect(TELEGRAM_EXPORT_PRESETS.post).toMatchObject({ width: 1080, height: 1350 });
    expect(TELEGRAM_EXPORT_PRESETS.story).toMatchObject({ width: 1080, height: 1920 });
    expect(TELEGRAM_EXPORT_PRESETS.videoHorizontal).toMatchObject({ width: 1280, height: 720 });
  });

  it("defines all 8 rubrics", () => {
    expect(TELEGRAM_RUBRICS).toHaveLength(8);
    for (const r of TELEGRAM_RUBRICS) expect(TELEGRAM_RUBRIC_SPEC[r].meaning).toBeTruthy();
  });

  it("builds export file names by canon §17", () => {
    const date = new Date("2026-10-01T10:00:00Z");
    expect(telegramExportFileName({ kind: "post", rubric: "CAMP", slug: "Kamchatka Powder", date, version: 1 })).toBe(
      "tg_post_camp_kamchatka-powder_20261001_v01.png",
    );
    expect(telegramExportFileName({ kind: "story", album: "freeride", slug: "elbrus", date, version: 12 })).toBe(
      "tg_story_freeride_elbrus_20261001_v12.png",
    );
    expect(telegramExportFileName({ kind: "video", slug: "sochi-wake", orientation: "vertical", version: 2 })).toBe(
      "tg_video_sochi-wake_vertical_v02.png",
    );
    expect(telegramExportFileName({ kind: "avatar", version: 1 })).toBe("tg_brand_avatar_v01.png");
    expect(telegramExportFileName({ kind: "wallpaper", mode: "dark", version: 3 })).toBe("tg_brand_wallpaper_dark_v03.png");
    expect(() => telegramExportFileName({ kind: "post", rubric: "CAMP", slug: "Камчатка", date, version: 1 })).toThrow();
    expect(() => telegramExportFileName({ kind: "avatar", version: 100 })).toThrow();
  });

  it("asset manifest points to files that exist in the repo", () => {
    for (const rel of Object.values(TELEGRAM_ASSET_MANIFEST)) {
      expect(existsSync(path.join(repoRoot, rel)), rel).toBe(true);
    }
  });
});
