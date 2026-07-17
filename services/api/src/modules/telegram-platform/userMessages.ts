import { CONSENT_LABELS, type RequiredConsentType } from "./consentTexts";

const LEAD_SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  attempt_not_found: "Заявка не найдена или уже завершена. Начните заявку заново.",
  incomplete_contact: "Не заполнены контактные данные. Начните заявку заново.",
  consent_required: "Подтвердите все обязательные согласия.",
  program_not_found: "Программа недоступна.",
};

export function consentLabel(key: string): string {
  return CONSENT_LABELS[key as RequiredConsentType] ?? "обязательное согласие";
}

export function formatConsentList(keys: string[]): string {
  return keys.map(consentLabel).join(", ");
}

export function leadSubmitErrorMessage(error: string): string {
  return LEAD_SUBMIT_ERROR_MESSAGES[error] ?? "Не удалось отправить заявку. Попробуйте ещё раз.";
}
