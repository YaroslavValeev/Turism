import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: {} }));

import {
  candidateNeedsTelegramMediaRefresh,
  extractTelegramMediaUrls,
  isTelegramCdnMediaUrl,
  parseTelegramPostRef,
} from "./telegramMedia";

describe("telegramMedia helpers", () => {
  it("flags only Telegram candidates that still point at the CDN", () => {
    const base = { normalizedItemId: "n1", imageUrl: null };
    const post = "https://t.me/raceenduro/2881";
    expect(
      candidateNeedsTelegramMediaRefresh({
        ...base,
        rawItem: { id: "r1", sourceUrl: post, rawMediaJson: [{ url: "https://cdn4.telesco.pe/file/a.jpg" }] },
      }),
    ).toBe(true);
    expect(
      candidateNeedsTelegramMediaRefresh({
        ...base,
        imageUrl: "https://cdn4.telesco.pe/file/a.jpg",
        rawItem: { id: "r1", sourceUrl: post, rawMediaJson: [] },
      }),
    ).toBe(true);
    expect(
      candidateNeedsTelegramMediaRefresh({
        ...base,
        rawItem: { id: "r1", sourceUrl: post, rawMediaJson: [{ url: "/ingestion-media/tg-a.jpg" }] },
      }),
    ).toBe(false);
    expect(
      candidateNeedsTelegramMediaRefresh({
        ...base,
        rawItem: { id: "r1", sourceUrl: "https://example.com/x", rawMediaJson: ["https://cdn4.telesco.pe/file/a.jpg"] },
      }),
    ).toBe(false);
  });

  it("parses t.me post urls incl. /s/ feed form", () => {
    expect(parseTelegramPostRef("https://t.me/project18adv/10070")).toEqual({ channel: "project18adv", postId: "10070" });
    expect(parseTelegramPostRef("https://t.me/s/raceenduro/2862")).toEqual({ channel: "raceenduro", postId: "2862" });
    expect(parseTelegramPostRef("https://t.me/raceenduro")).toBeNull();
    expect(parseTelegramPostRef("https://example.com/raceenduro/2862")).toBeNull();
    expect(parseTelegramPostRef("https://t.me/raceenduro/abc")).toBeNull();
    expect(parseTelegramPostRef("https://t.me/a%2Fb/1")).toBeNull();
    expect(parseTelegramPostRef(null)).toBeNull();
  });

  it("detects Telegram CDN media but not the Bot API host", () => {
    expect(isTelegramCdnMediaUrl("https://cdn4.telesco.pe/file/abc.jpg")).toBe(true);
    expect(isTelegramCdnMediaUrl("//cdn1.telesco.pe/file/abc.jpg")).toBe(true);
    expect(isTelegramCdnMediaUrl("https://api.telegram.org/file/bot123/x.jpg")).toBe(false);
    expect(isTelegramCdnMediaUrl("/ingestion-media/tg-x.jpg")).toBe(false);
  });

  it("extracts photos and videos from t.me embed html, skipping emoji", () => {
    const html = [
      `<a class="tgme_widget_message_photo_wrap" style="width:100px;background-image:url('https://cdn4.telesco.pe/file/a.jpg')"></a>`,
      `<a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn4.telesco.pe/file/b.jpg')"></a>`,
      `<video src="https://cdn4.telesco.pe/file/c.mp4" class="tgme_widget_message_video js-message_video"></video>`,
      `<i style="background-image:url('//telegram.org/img/emoji/40/F09F988A.png')"></i>`,
    ].join("\n");
    expect(extractTelegramMediaUrls(html)).toEqual([
      { url: "https://cdn4.telesco.pe/file/a.jpg", mediaType: "image" },
      { url: "https://cdn4.telesco.pe/file/b.jpg", mediaType: "image" },
      { url: "https://cdn4.telesco.pe/file/c.mp4", mediaType: "video" },
    ]);
  });
});
