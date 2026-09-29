import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCbrRates,
  normalizeCurrencyCode,
  parseCbrJson,
  parseCbrXml,
  priceInRub,
  resetCbrRatesCacheForTests,
  type CbrRates,
} from "./cbrRates";

const XML = `<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="27.09.2026" name="Foreign Currency Market">
<Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>x</Name><Value>92,5000</Value></Valute>
<Valute ID="R01239"><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>x</Name><Value>100,2500</Value></Valute>
<Valute ID="R01335"><NumCode>398</NumCode><CharCode>KZT</CharCode><Nominal>100</Nominal><Name>x</Name><Value>18,5000</Value></Valute>
</ValCurs>`;

const JSON_BODY = JSON.stringify({
  Date: "2026-09-27T11:30:00+03:00",
  Valute: { USD: { CharCode: "USD", Nominal: 1, Value: 92.5 } },
});

const RATES: CbrRates = { date: "27.09.2026", rubPerUnit: { USD: 92.5, EUR: 100.25, KZT: 0.185 }, fetchedAt: 0 };

function fakeFetch(responses: Record<string, string | null>) {
  return vi.fn(async (url: string) => {
    const body = responses[url];
    return { ok: body != null, status: body != null ? 200 : 503, text: async () => body ?? "" };
  });
}

afterEach(() => {
  resetCbrRatesCacheForTests();
});

describe("parseCbrXml", () => {
  it("учитывает Nominal и десятичную запятую", () => {
    const rates = parseCbrXml(XML, 1);
    expect(rates?.date).toBe("27.09.2026");
    expect(rates?.rubPerUnit.USD).toBe(92.5);
    expect(rates?.rubPerUnit.KZT).toBeCloseTo(0.185);
  });

  it("мусор — null", () => {
    expect(parseCbrXml("<html>error</html>")).toBeNull();
  });
});

describe("parseCbrJson", () => {
  it("разбирает зеркало cbr-xml-daily", () => {
    expect(parseCbrJson(JSON_BODY, 1)).toEqual({ date: "27.09.2026", rubPerUnit: { USD: 92.5 }, fetchedAt: 1 });
  });
});

describe("normalizeCurrencyCode", () => {
  it.each([
    ["$", "USD"],
    ["usd", "USD"],
    ["€", "EUR"],
    ["₸", "KZT"],
    ["₽", "RUB"],
    ["руб.", "RUB"],
    ["", null],
    ["доллары", null],
  ])("%s → %s", (input, expected) => {
    expect(normalizeCurrencyCode(input)).toBe(expected);
  });
});

describe("priceInRub", () => {
  it("пересчитывает и округляет до 100 ₽", () => {
    expect(priceInRub(1200, "USD", RATES)).toBe(111_000);
  });

  it("небольшие суммы округляет до 10 ₽", () => {
    expect(priceInRub(50, "USD", RATES)).toBe(4630);
  });

  it("рублёвую цену не пересчитывает", () => {
    expect(priceInRub(50_000, "RUB", RATES)).toBeNull();
  });

  it("без курса или валюты — null", () => {
    expect(priceInRub(100, "USD", null)).toBeNull();
    expect(priceInRub(100, "XYZ", RATES)).toBeNull();
    expect(priceInRub(null, "USD", RATES)).toBeNull();
  });
});

describe("getCbrRates", () => {
  it("берёт официальный XML и кэширует его", async () => {
    const fetchImpl = fakeFetch({ "https://www.cbr.ru/scripts/XML_daily.asp": XML });
    const first = await getCbrRates(fetchImpl, 1000);
    const second = await getCbrRates(fetchImpl, 2000);
    expect(first?.rubPerUnit.USD).toBe(92.5);
    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("при недоступном ЦБ берёт зеркало", async () => {
    const fetchImpl = fakeFetch({ "https://www.cbr-xml-daily.ru/daily_json.js": JSON_BODY });
    expect((await getCbrRates(fetchImpl, 1000))?.rubPerUnit.USD).toBe(92.5);
  });

  it("после неудачи не долбит ЦБ повторно 15 минут", async () => {
    const fetchImpl = fakeFetch({});
    expect(await getCbrRates(fetchImpl, 1000)).toBeNull();
    expect(await getCbrRates(fetchImpl, 1000 + 60_000)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("устаревший курс отдаёт сразу, обновляя в фоне", async () => {
    const fetchImpl = fakeFetch({ "https://www.cbr.ru/scripts/XML_daily.asp": XML });
    const first = await getCbrRates(fetchImpl, 0);
    const stale = await getCbrRates(fetchImpl, 7 * 60 * 60 * 1000);
    expect(stale).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
