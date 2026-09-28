/**
 * Официальный курс ЦБ РФ для справочного пересчёта цен в рубли.
 * Цена программы хранится в валюте организатора; рубли — только подсказка «≈ … ₽ по курсу ЦБ».
 */

export type CbrRates = {
  /** Дата курса в формате ЦБ (ДД.ММ.ГГГГ). */
  date: string;
  /** Сколько рублей стоит 1 единица валюты (с учётом Nominal). */
  rubPerUnit: Record<string, number>;
  fetchedAt: number;
};

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const CBR_XML_URL = "https://www.cbr.ru/scripts/XML_daily.asp";
const CBR_JSON_MIRROR_URL = "https://www.cbr-xml-daily.ru/daily_json.js";
const TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

const CURRENCY_ALIASES: Record<string, string> = {
  "₽": "RUB",
  "Р": "RUB",
  "РУБ": "RUB",
  "RUR": "RUB",
  "$": "USD",
  "€": "EUR",
  "₸": "KZT",
  "ТЕНГЕ": "KZT",
};

export function normalizeCurrencyCode(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim().toUpperCase().replace(/\.$/, "");
  if (!raw) return null;
  if (CURRENCY_ALIASES[raw]) return CURRENCY_ALIASES[raw];
  return /^[A-Z]{3}$/.test(raw) ? raw : null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: "₽",
  USD: "$",
  EUR: "€",
  KZT: "₸",
  GBP: "£",
  CNY: "¥",
  TRY: "₺",
  GEL: "₾",
  THB: "฿",
};

/** «1 200 $», «50 000 ₽»; неизвестная валюта — кодом («1 200 AED»). */
export function formatMoney(amount: number, currency: string | null | undefined): string {
  const code = normalizeCurrencyCode(currency) ?? "RUB";
  return `${Math.round(amount).toLocaleString("ru-RU")} ${CURRENCY_SYMBOLS[code] ?? code}`;
}

function parseRuNumber(value: string): number {
  return Number(value.replace(/\s/g, "").replace(",", "."));
}

export function parseCbrXml(xml: string, now = Date.now()): CbrRates | null {
  const date = /<ValCurs[^>]*\bDate="(\d{2}\.\d{2}\.\d{4})"/.exec(xml)?.[1];
  if (!date) return null;
  const rubPerUnit: Record<string, number> = {};
  for (const block of xml.match(/<Valute\b[\s\S]*?<\/Valute>/g) ?? []) {
    const code = /<CharCode>([A-Z]{3})<\/CharCode>/.exec(block)?.[1];
    const nominal = parseRuNumber(/<Nominal>([^<]+)<\/Nominal>/.exec(block)?.[1] ?? "");
    const value = parseRuNumber(/<Value>([^<]+)<\/Value>/.exec(block)?.[1] ?? "");
    if (code && nominal > 0 && value > 0) rubPerUnit[code] = value / nominal;
  }
  return Object.keys(rubPerUnit).length ? { date, rubPerUnit, fetchedAt: now } : null;
}

export function parseCbrJson(body: string, now = Date.now()): CbrRates | null {
  let data: { Date?: string; Valute?: Record<string, { CharCode?: string; Nominal?: number; Value?: number }> };
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data.Date ?? ""));
  if (!iso || !data.Valute) return null;
  const rubPerUnit: Record<string, number> = {};
  for (const [key, item] of Object.entries(data.Valute)) {
    const code = String(item.CharCode ?? key).toUpperCase();
    const nominal = Number(item.Nominal);
    const value = Number(item.Value);
    if (/^[A-Z]{3}$/.test(code) && nominal > 0 && value > 0) rubPerUnit[code] = value / nominal;
  }
  return Object.keys(rubPerUnit).length ? { date: `${iso[3]}.${iso[2]}.${iso[1]}`, rubPerUnit, fetchedAt: now } : null;
}

/** Округление справочной суммы: до 10 ₽ для небольших цен, до 100 ₽ для остальных. */
function roundApproxRub(value: number): number {
  const step = value < 10_000 ? 10 : 100;
  return Math.round(value / step) * step;
}

/** Справочная цена в рублях; null — если цена уже в рублях, неизвестна валюта или нет курса. */
export function priceInRub(amount: number | null | undefined, currency: string | null | undefined, rates: CbrRates | null): number | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0 || !rates) return null;
  const code = normalizeCurrencyCode(currency);
  if (!code || code === "RUB") return null;
  const rate = rates.rubPerUnit[code];
  return rate ? roundApproxRub(amount * rate) : null;
}

async function fetchText(fetchImpl: FetchLike, url: string): Promise<string | null> {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

async function loadRates(fetchImpl: FetchLike, now: number): Promise<CbrRates | null> {
  const xml = await fetchText(fetchImpl, CBR_XML_URL);
  const fromXml = xml ? parseCbrXml(xml, now) : null;
  if (fromXml) return fromXml;
  const json = await fetchText(fetchImpl, CBR_JSON_MIRROR_URL);
  return json ? parseCbrJson(json, now) : null;
}

let cached: CbrRates | null = null;
let lastFailureAt = Number.NEGATIVE_INFINITY;
let inflight: Promise<CbrRates | null> | null = null;

function refresh(fetchImpl: FetchLike, now: number): Promise<CbrRates | null> {
  if (!inflight) {
    inflight = loadRates(fetchImpl, now)
      .then((rates) => {
        if (rates) cached = rates;
        else {
          lastFailureAt = now;
          console.warn("[fx] CBR rates unavailable, keeping previous rates");
        }
        return cached;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Курс с кэшем на 6 часов. Устаревший курс отдаётся сразу, обновление идёт в фоне,
 * чтобы каталог не ждал ЦБ. После неудачи повтор не чаще раза в 15 минут.
 */
export async function getCbrRates(fetchImpl: FetchLike = fetch as unknown as FetchLike, now = Date.now()): Promise<CbrRates | null> {
  const fresh = cached && now - cached.fetchedAt < TTL_MS;
  if (fresh) return cached;
  const mayRetry = now - lastFailureAt >= RETRY_AFTER_FAILURE_MS;
  if (cached) {
    if (mayRetry) void refresh(fetchImpl, now);
    return cached;
  }
  return mayRetry ? refresh(fetchImpl, now) : null;
}

export function resetCbrRatesCacheForTests(): void {
  cached = null;
  lastFailureAt = Number.NEGATIVE_INFINITY;
  inflight = null;
}
