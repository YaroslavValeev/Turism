export type SafetySeverity = "low" | "medium" | "high";

const PHRASE_RULES: Array<{ re: RegExp; label: string; severity: SafetySeverity; rewrite?: string }> = [
  { re: /полностью безопасно/giu, label: "абсолютная безопасность", severity: "high", rewrite: "Сопровождаемый формат; риски индивидуальны." },
  { re: /без\s+риск[ау]/giu, label: "отсутствие риска", severity: "high" },
  { re: /гаранти(рованн|и)/giu, label: "гарантия результата", severity: "high" },
  { re: /подходит\s+всем/giu, label: "универсальная пригодность", severity: "medium" },
  { re: /без\s+подготовки/giu, label: "без подготовки (контекст рискованной активности)", severity: "medium" },
  { re: /mywave\s+организ|организатор\s+—\s*mywave|платформа\s+проводит/giu, label: "впечатление, что MyWave = организатор", severity: "high", rewrite: "Программа у организатора; площадка — MyWave." },
];

/**
 * Быстрые правила без внешнего LLM. Дополняет (не заменяет) политику публикации.
 */
export function checkSafetyHeuristic(text: string): {
  hasRiskyClaims: boolean;
  riskyPhrases: string[];
  suggestedRewrites: string[];
  severity: SafetySeverity;
} {
  const riskyPhrases: string[] = [];
  const rewrites: string[] = [];
  let worst: SafetySeverity = "low";
  const order: Record<SafetySeverity, number> = { low: 0, medium: 1, high: 2 };
  for (const rule of PHRASE_RULES) {
    if (rule.re.test(text)) {
      riskyPhrases.push(rule.label);
      if (rule.rewrite) rewrites.push(rule.rewrite);
      if (order[rule.severity] > order[worst]) worst = rule.severity;
    }
  }
  return {
    hasRiskyClaims: riskyPhrases.length > 0,
    riskyPhrases,
    suggestedRewrites: rewrites,
    severity: worst,
  };
}
