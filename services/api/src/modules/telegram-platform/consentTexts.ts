/** Версии текстов согласий — хранятся в TelegramConsentRecord.textVersion */

export const CONSENT_POLICY_VERSION = process.env.LEGAL_CONSENT_POLICY_VERSION?.trim() || "telegram-v1";

export const CONSENT_TEXTS = {
  pd_processing:
    "Согласие на обработку персональных данных в соответствии с политикой MyWave Tour.",
  contact_transfer:
    "Согласие на передачу моих контактных данных организатору выбранной программы для связи по заявке.",
  not_organizer:
    "Подтверждаю, что MyWave Tour не является организатором программы и не несёт ответственность за проведение поездки.",
  high_risk:
    "Подтверждаю, что ознакомлен(а) с уровнем риска программы и требованиями организатора.",
  kids_parent:
    "Подтверждаю, что являюсь родителем или законным представителем участника (детская программа).",
} as const;

export type RequiredConsentType = keyof typeof CONSENT_TEXTS;

export function requiredConsentsForProgram(riskLevel: string | null | undefined, isKids: boolean): RequiredConsentType[] {
  const base: RequiredConsentType[] = ["pd_processing", "contact_transfer", "not_organizer"];
  if (riskLevel === "high" || riskLevel === "extreme") {
    base.push("high_risk");
  }
  if (isKids) {
    base.push("kids_parent");
  }
  return base;
}
