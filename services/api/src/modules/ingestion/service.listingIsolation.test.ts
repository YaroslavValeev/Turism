import { describe, expect, it, vi } from "vitest";
vi.mock("../../lib/prisma", () => ({ prisma: {} }));
vi.mock("child_process", () => ({ spawnSync: vi.fn(() => { throw new Error("No external OCR in tests"); }) }));
import { parseHtmlDiscoveryItems } from "./service";

function sourceFor(url: string, name: string) {
  return {
    id: `${name}-test`, name, type: "site", urlOrHandle: url,
    discipline: null, country: "Russia", region: null,
    trustScore: 0.8, metaJson: null, organizer: null,
  } as unknown as Parameters<typeof parseHtmlDiscoveryItems>[0];
}

// Structural fixture from birdtravel.ru/routs/: price sits before the card links, details after the title.
function birdCard(slug: string, title: string, dates: string, price: string, place: string, days: string) {
  return `<div class="isotope-item col-xl-3 col-lg-4 alpine-skiing ${slug}"> <div class="vertical-item gallery-title text-center ">
    <div class="price"><span>${price}</span></div>
    <div class="item-media gradientdarken-background"> <img src="https://birdtravel.ru/wp-content/uploads/${slug}-450x680.jpg" alt=""/>
      <div class="media-links"> <a class="abs-link" href="https://birdtravel.ru/routs/${slug}/"></a> </div> </div>
    <div class="item-content"> <h4 class="mt-4"> <a href="https://birdtravel.ru/routs/${slug}/"> ${title} </a> </h4>
      <span class="small-text subtitle"> ${dates} </span>
      <ul class="data-wrap"><li><span class="title">Место</span><span class="data">${place}</span></li><li><span class="title">Длительность</span><span class="data">${days}</span></li></ul>
    </div> </div> </div>`;
}

describe("listing page card isolation", () => {
  it("keeps price, dates and place inside each BirdTravel card", () => {
    const source = sourceFor("https://birdtravel.ru/routs/", "BirdTravel");
    const html = `<div class="row">${[
      birdCard("heli-ski-week", "Неделя хели-ски на Байкале. Heliski Week", "28.11.2026 - 04.12.2026", "990 000₽", "Байкал, Россия", "7 дней"),
      birdCard("frirayd-kemp-v-sheregeshe", "Горнолыжный кемп в Шерегеше. Проживание в шале", "22.11.2026 - 29.11.2026", "110 000₽", "Шерегеш, Россия", "8 дней"),
      birdCard("shkola-frirayda", "Школа фрирайда в Шерегеше. 5 дней", "23.11.2026 - 28.11.2026", "55 000₽", "Шерегеш, Россия", "5 дней"),
    ].join("")}</div>`;
    const items = parseHtmlDiscoveryItems(source, html, source.urlOrHandle);
    expect(items.map((item) => item.sourceUrl)).toEqual([
      "https://birdtravel.ru/routs/heli-ski-week/",
      "https://birdtravel.ru/routs/frirayd-kemp-v-sheregeshe/",
      "https://birdtravel.ru/routs/shkola-frirayda/",
    ]);
    const [heli, camp, school] = items;
    expect(heli.rawText).toContain("990 000₽");
    expect(heli.rawText).toContain("Байкал");
    expect(heli.rawText).not.toMatch(/Шерегеш|110 000/);
    expect(camp.rawText).toContain("110 000₽");
    expect(camp.rawText).toContain("22.11.2026 - 29.11.2026");
    expect(camp.rawText).not.toMatch(/990 000|55 000|23\.11\.2026|Байкал/);
    expect(school.rawText).toContain("55 000₽");
    expect(school.rawText).not.toMatch(/110 000|22\.11\.2026/);
    expect(camp.rawMedia).toEqual([{ url: "https://birdtravel.ru/wp-content/uploads/frirayd-kemp-v-sheregeshe-450x680.jpg" }]);
  });

  it("ignores site menu links and the page itself (Mountain Guru)", () => {
    const source = sourceFor("https://mountainguru.ru/alp/", "Mountain Guru");
    const cr = (id: number, dates: string, title: string) => `<div class="cr">
      <div class="cr-bg-container"><div class="bg"></div></div>
      <a href="/alp/0_${id}/"><div class="dt">${dates}</div><h4>${title}</h4><p>Программа сборов по альпинизму</p></a>
      <div class="gr"><a href="/do/?course=${id}" class="btn">Записаться</a></div></div>`;
    const html = `<html><head><link rel="stylesheet" href="/css/laptop.css" media="(min-width: 761px)" type="text/css"></head><body>
      <header><div class="logo"><a href="/"><img src="/i/logo.svg"></a></div><nav>
        <a href="/alp/" class="active"><span>Школа альпинизма</span></a>
        <a href="/climb/"><span>Скалолазные кэмпы</span></a>
        <a href="/trekking/"><span>Треккинг</span></a></nav></header>
      <section class=""><div class="container"><h1>Школа альпинизма</h1><div class="schedule">
      ${cr(84, "29 октября—08 ноября", "Программа первопрохождений в Северной Осетии")}
      ${cr(70, "21 ноября—02 декабря", "Альпинистские сборы в Кязи по программе СП")}
      ${cr(95, "23 января—01 февраля", "Альпинистские сборы в Кязи по программе НП")}
      </div></div></section></body></html>`;
    const items = parseHtmlDiscoveryItems(source, html, source.urlOrHandle);
    expect(items.map((item) => item.sourceUrl)).toEqual([
      "https://mountainguru.ru/alp/0_84/",
      "https://mountainguru.ru/alp/0_70/",
      "https://mountainguru.ru/alp/0_95/",
    ]);
    expect(items[0].rawText).toContain("29 октября");
    expect(items[0].rawText).not.toMatch(/21 ноября|min-width|text\/css|Скалолазные/);
    expect(items[1].rawText).not.toMatch(/29 октября|23 января/);
  });

  it("clamps the fallback window at neighbouring program links when cards have no shared container", () => {
    const source = sourceFor("https://example-school.ru/", "Example");
    const html = `<p>Анонс</p><a href="/camp-a/">Кэмп А по кайту 10-15 июля 2026</a> Цена 50 000 ₽
      <a href="/camp-b/">Кэмп Б по кайту 20-25 июля 2026</a> Цена 70 000 ₽`;
    const [a, b] = parseHtmlDiscoveryItems(source, html, source.urlOrHandle);
    expect(a.rawText).toContain("50 000");
    expect(a.rawText).not.toContain("70 000");
    expect(b.rawText).toContain("70 000");
    expect(b.rawText).not.toContain("10-15 июля");
  });
});
