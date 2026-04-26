/**
 * Склонение существительного по числу (1 программа, 2 программы, 5 программ).
 * @param n — целое неотрицательное
 * @param forms — [одна, 2–4, 0,5,6–9 и 11–19]
 */
export function ruPluralNoun(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n)) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 === 1) return forms[0];
  if (n1 >= 2 && n1 <= 4) return forms[1];
  return forms[2];
}
