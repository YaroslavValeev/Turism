import assert from "node:assert/strict";
import test from "node:test";

import { formatProgramPrice, formatProgramPriceRub, formatProgramPriceRubTitle } from "./priceFormat";

const plain = (s: string | null | undefined) => (s == null ? s : s.replace(/\s/g, " "));

test("formatProgramPrice shows the organizer currency", () => {
  assert.equal(plain(formatProgramPrice({ priceFromRub: 1200, currency: "USD" })), "от 1 200 $");
  assert.equal(plain(formatProgramPrice({ priceFromRub: 50000, currency: "RUB" })), "от 50 000 ₽");
  assert.equal(plain(formatProgramPrice({ priceFromRub: 50000, currency: null })), "от 50 000 ₽");
  assert.equal(plain(formatProgramPrice({ priceFromRub: 300, currency: "AED" })), "от 300 AED");
  assert.equal(formatProgramPrice({ priceFromRub: null, currency: "USD" }), null);
});

test("formatProgramPriceRub renders the CBR line only for foreign currencies", () => {
  assert.equal(
    plain(formatProgramPriceRub({ priceFromRub: 1200, currency: "USD", priceRubApprox: 111000 })),
    "≈ 111 000 ₽ по курсу ЦБ",
  );
  assert.equal(formatProgramPriceRub({ priceFromRub: 50000, currency: "RUB", priceRubApprox: 50000 }), null);
  assert.equal(formatProgramPriceRub({ priceFromRub: 1200, currency: "USD", priceRubApprox: null }), null);
});

test("formatProgramPriceRubTitle mentions the rate date", () => {
  assert.match(
    formatProgramPriceRubTitle({ priceFromRub: 1200, currency: "USD", priceRubRateDate: "2026-09-26" }) ?? "",
    /2026-09-26/,
  );
  assert.equal(formatProgramPriceRubTitle({ priceFromRub: 1200, currency: "USD" }), undefined);
});
