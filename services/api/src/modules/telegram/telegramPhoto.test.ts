import path from "path";
import { describe, expect, it } from "vitest";
import { INGESTION_MEDIA_DIR } from "../ingestion/mediaCache";
import { resolveLocalIngestionMedia, visibleCaptionLength } from "./telegramPhoto";

describe("resolveLocalIngestionMedia", () => {
  it("maps cached ingestion media to a local file", () => {
    expect(resolveLocalIngestionMedia("/ingestion-media/abc_123.jpg")).toEqual({
      filePath: path.join(INGESTION_MEDIA_DIR, "abc_123.jpg"),
      contentType: "image/jpeg",
    });
  });

  it("rejects traversal, unknown extensions and foreign paths", () => {
    expect(resolveLocalIngestionMedia("/ingestion-media/../secret.jpg")).toBeNull();
    expect(resolveLocalIngestionMedia("/ingestion-media/.hidden.jpg")).toBeNull();
    expect(resolveLocalIngestionMedia("/ingestion-media/file.svg")).toBeNull();
    expect(resolveLocalIngestionMedia("/uploads/file.jpg")).toBeNull();
    expect(resolveLocalIngestionMedia("https://mywavetour.ru/ingestion-media/a.jpg")).toBeNull();
  });
});

describe("visibleCaptionLength", () => {
  it("ignores tags and counts entities as one char", () => {
    expect(visibleCaptionLength("<b>Кэмп</b> &amp; <a href=\"https://x\">сёрф</a>")).toBe("Кэмп & сёрф".length);
  });
});
