/**
 * Цена программы показывается в валюте организатора (priceFromRub + currency — поле исторически
 * называется «Rub», но хранит сумму в currency). Для иностранных валют API присылает
 * priceRubApprox — справочную сумму по курсу ЦБ, её выводим отдельной тонкой строкой.
 */

export type ProgramPriceFields = {
  priceFromRub: number | null;
  currency?: string | null;
  priceRubApprox?: number | null;
  priceRubRateDate?: string | null;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: "₽",
  RUR: "₽",
  USD: "$",
  EUR: "€",
  KZT: "₸",
  GBP: "£",
  CNY: "¥",
  TRY: "₺",
  GEL: "₾",
  THB: "฿",
};

export function currencySymbol(currency: string | null | undefined): string {
  const code = String(currency ?? "").trim().toUpperCase();
  if (!code || code === "₽") return "₽";
  return CURRENCY_SYMBOLS[code] ?? code;
}

function amount(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

/** «от 1 200 $» / «от 50 000 ₽»; null — цены нет. */
export function formatProgramPrice(p: ProgramPriceFields): string | null {
  if (p.priceFromRub == null || !Number.isFinite(p.priceFromRub)) return null;
  return `от ${amount(p.priceFromRub)} ${currencySymbol(p.currency)}`;
}

/** «≈ 111 000 ₽ по курсу ЦБ» — только для иностранной валюты, когда API прислал пересчёт. */
export function formatProgramPriceRub(p: ProgramPriceFields): string | null {
  if (p.priceFromRub == null || p.priceRubApprox == null || !Number.isFinite(p.priceRubApprox)) return null;
  if (currencySymbol(p.currency) === "₽") return null;
  return `≈ ${amount(p.priceRubApprox)} ₽ по курсу ЦБ`;
}

export function formatProgramPriceRubTitle(p: ProgramPriceFields): string | undefined {
  return p.priceRubRateDate ? `Курс ЦБ РФ на ${p.priceRubRateDate}. Итоговую сумму уточняйте у организатора.` : undefined;
}
