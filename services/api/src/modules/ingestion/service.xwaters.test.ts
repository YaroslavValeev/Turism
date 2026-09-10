import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/prisma", () => ({ prisma: {} }));
vi.mock("child_process", () => ({ spawnSync: vi.fn(() => { throw new Error("No external OCR in tests"); }) }));
import { buildNormalizedDraft, parseHtmlDiscoveryItems } from "./service";

const source = {
  id: "xwaters-test", name: "X-WATERS", type: "site", urlOrHandle: "https://x-waters.com/",
  discipline: "Open Water", country: "Russia", region: "Россия + международные старты",
  trustScore: 0.9, metaJson: null, organizer: null,
} as unknown as Parameters<typeof parseHtmlDiscoveryItems>[0];

// Structural fixture from the live event grid: background photo precedes a league icon.
function card(slug: string, title: string, date: string, region = "russia", image = `${slug}.jpg`) {
  return `<a data-region='${region}' href='/events/${slug}/' class='project_itm js-event-block'>
    <div class='project_itm__bg js-lazy-load' data-image='/wp-content/uploads/${image}'></div>
    <div class='project_info'><div class='project_itm__attr'>
      <div class='project_itm__category classic-category'>Классика</div>
      <img src='/images/ultra_league.svg'><br></div>
      <div class='project_itm__date'>${date}</div>
      <div class='project_itm__title big_title'>${title}</div>
      <div class='project_itm__desc'>Описание только ${slug}</div>
    </div></a>`;
}

function normalize(item: ReturnType<typeof parseHtmlDiscoveryItems>[number]) {
  return buildNormalizedDraft({
    ...item, rawMediaJson: item.rawMedia, rawPayloadJson: item.rawPayload,
    publishedAt: new Date("2026-09-01T12:00:00Z"), source: { ...source, organizer: null },
  } as Parameters<typeof buildNormalizedDraft>[0]);
}

afterEach(() => vi.useRealTimers());

describe("X-WATERS event isolation", () => {
  it("keeps each title, date range and photo inside its own anchor through normalization", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T00:00:00Z"));
    const grid = card("camp", "Сборы X-WATERS Владивосток 2026", "7-13 сентября 2026")
      + card("vladivostok", "X-WATERS Владивосток 2026", "12-13 сентября 2026")
      + card("nuclear-camp", "Сборы X-WATERS Нуклеар 2026", "13-18 сентября 2026")
      + card("nuclear", "X-WATERS Нуклеар 2026", "18-20 сентября 2026")
      + card("montenegro", "X-WATERS Черногория 2026", "26-27 сентября 2026", "europe");
    const items = parseHtmlDiscoveryItems(source, grid, source.urlOrHandle);
    expect(items).toHaveLength(5);
    const dates = [[7,13], [12,13], [13,18], [18,20], [26,27]];
    items.forEach((item, i) => {
      const n = normalize(item);
      expect(n.title).toBe(item.rawTitle);
      expect(n.startDate?.toISOString()).toBe(`2026-09-${String(dates[i][0]).padStart(2,"0")}T12:00:00.000Z`);
      expect(n.endDate?.toISOString()).toBe(`2026-09-${String(dates[i][1]).padStart(2,"0")}T12:00:00.000Z`);
      expect(n.descriptionFull).not.toMatch(/class=|<div|ultra_league|background-image/);
      expect(n.imageUrl).toMatch(/\/wp-content\/uploads\/.+\.jpg$/);
      expect(n.region).toBeNull();
      expect(n.priceFrom).toBeNull();
      expect(n.scores.routedStatus).toBe("needs_review");
      expect(n.descriptionFull).not.toContain(i === 0 ? "Описание только vladivostok" : "Описание только camp");
    });
    expect(normalize(items[4]).country).toBeNull();
    expect(normalize(items[0]).country).toBe("Russia");
  });

  it("does not invent dates for unopened events or borrow the next event's date", () => {
    const items = parseHtmlDiscoveryItems(source,
      card("belgrad", "X-WATERS Белград 2027", "скоро открытие", "europe")
        + card("azov", "X-WATERS Азовское море 2027", "21-23 мая 2027"), source.urlOrHandle);
    expect(normalize(items[0])).toMatchObject({ startDate: null, endDate: null, durationDays: null, country: null });
    expect(normalize(items[1]).startDate?.toISOString()).toBe("2027-05-21T12:00:00.000Z");
  });

  it("does not use a logo, SVG or page-level image when the card photo is missing", () => {
    const html = `<meta property='og:image' content='/global.jpg'>` + card("test", "X-WATERS Test", "", "russia", "night.svg");
    const [item] = parseHtmlDiscoveryItems(source, html, source.urlOrHandle);
    expect(item.rawMedia).toEqual([]);
    expect(normalize(item).imageUrl).toBeNull();
  });

  it("deduplicates links and skips unrelated links and cards without a title", () => {
    const event = card("test", "X-WATERS Test", "13 сентября 2026");
    const items = parseHtmlDiscoveryItems(source, event + event + card("empty", "", "2026")
      + `<a href='/events/other/'>Чужое событие 10 сентября 2026</a>`, source.urlOrHandle);
    expect(items).toHaveLength(1);
  });

  it("fails closed on changed X-WATERS markup instead of falling back to mixed context", () => {
    expect(parseHtmlDiscoveryItems(source, `<a href='/events/test/'>Сборы 10 сентября 2026</a>`, source.urlOrHandle)).toEqual([]);
  });

  it("collects cards beyond the old generic 12-link limit", () => {
    const grid = Array.from({ length: 15 }, (_, i) => card(`event-${i}`, `X-WATERS ${i}`, "18 сентября 2026")).join("");
    expect(parseHtmlDiscoveryItems(source, grid, source.urlOrHandle)).toHaveLength(15);
  });
});
