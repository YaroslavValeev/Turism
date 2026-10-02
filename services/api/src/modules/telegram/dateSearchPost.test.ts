import { describe, expect, it } from "vitest";
import { buildDateSearchKeyboard, buildDateSearchMessage, isTelegramMiniAppLink } from "./dateSearchPost";

const SITE = "https://mywavetour.ru/";

describe("buildDateSearchKeyboard", () => {
  const rows = buildDateSearchKeyboard(SITE).inline_keyboard;
  const urls = rows.flat().map((b) => new URL(b.url));

  it("links weekend buttons to relative presets, not fixed dates", () => {
    expect(rows[0]!.map((b) => b.text)).toEqual(["Эти выходные", "Следующие выходные"]);
    expect(urls[0]!.searchParams.get("when")).toBe("this-weekend");
    expect(urls[1]!.searchParams.get("when")).toBe("next-weekend");
    for (const url of urls) {
      expect(url.searchParams.has("from")).toBe(false);
      expect(url.searchParams.has("to")).toBe(false);
    }
  });

  it("points buttons at the site with channel UTM", () => {
    for (const url of urls) {
      expect(url.origin).toBe("https://mywavetour.ru");
      expect(url.searchParams.get("utm_source")).toBe("telegram_channel");
      expect(url.searchParams.get("utm_campaign")).toBe("date_search");
    }
    expect(urls[0]!.hash).toBe("#programs");
    expect(urls[2]!.searchParams.get("nearest")).toBe("1");
    expect(urls[3]!.pathname).toBe("/dates");
  });

  it("opens the calendar as a Mini App when a direct link is configured", () => {
    const rows = buildDateSearchKeyboard(SITE, { miniAppUrl: "https://t.me/MyWaveTour_bot/tourApp" }).inline_keyboard;
    expect(rows[1]![0]!.url).toBe("https://t.me/MyWaveTour_bot/tourApp?startapp=2w");
    expect(rows[2]![0]!.url).toBe("https://t.me/MyWaveTour_bot/tourApp?startapp=calendar");
    expect(rows[0]!.map((b) => b.url)).toEqual([
      "https://t.me/MyWaveTour_bot/tourApp?startapp=this-weekend",
      "https://t.me/MyWaveTour_bot/tourApp?startapp=next-weekend",
    ]);
  });

  it("rejects anything that is not a t.me direct link", () => {
    expect(isTelegramMiniAppLink("https://t.me/MyWaveTour_bot/dates")).toBe(true);
    expect(isTelegramMiniAppLink("https://evil.example/MyWaveTour_bot/dates")).toBe(false);
    expect(isTelegramMiniAppLink("https://t.me/MyWaveTour_bot")).toBe(false);
    expect(isTelegramMiniAppLink(undefined)).toBe(false);
  });
});

describe("buildDateSearchMessage", () => {
  const message = buildDateSearchMessage(SITE);

  it("shows the large /dates preview above the text", () => {
    expect(message.link_preview_options).toMatchObject({ prefer_large_media: true, show_above_text: true });
    const preview = new URL(message.link_preview_options.url);
    expect(preview.pathname).toBe("/dates");
    expect([...preview.searchParams.keys()]).toEqual(["v"]);
    expect(message.text).toContain('<a href="https://mywavetour.ru/dates?');
    expect(message.text).not.toMatch(/href="[^"]*&(?!amp;)/);
  });

  it("keeps the post within Telegram limits", () => {
    expect(message.text.length).toBeLessThan(4096);
    expect(message.reply_markup.inline_keyboard.flat().every((b) => b.text.length <= 32)).toBe(true);
  });
});
