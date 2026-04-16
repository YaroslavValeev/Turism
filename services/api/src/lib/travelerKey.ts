import { createHmac } from "crypto";
import type { Env } from "@mywave/config";

/**
 * Нормализация произвольного текста контакта (имя + телефон + email в одной строке).
 * Не логировать результат в аналитике как открытый текст.
 */
export function normalizeGuestContact(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ");
}

/**
 * Стабильный псевдоним клиента для связки lead/booking/payment/repeat без хранения сырого PII в analytics_events.
 * Требуется TRAVELER_KEY_SALT в окружении; иначе возвращает null (поле в БД остаётся пустым).
 */
export function computeTravelerKeyHash(env: Env, guestContact: string): string | null {
  const salt = env.TRAVELER_KEY_SALT?.trim();
  if (!salt) return null;
  const normalized = normalizeGuestContact(guestContact);
  if (!normalized.length) return null;
  return createHmac("sha256", salt).update(normalized, "utf8").digest("hex");
}
