/** Validate the contact without guessing a communication channel. */
export function contactError(value: string): string | null {
  const contact = value.trim();
  if (!contact) return "Укажите телефон, Telegram или email для ответа.";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return null;
  if (/^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(contact)) return null;
  if (
    /^\+?[\d\s()−-]+$/.test(contact) &&
    contact.replace(/\D/g, "").length >= 10 &&
    contact.replace(/\D/g, "").length <= 15
  )
    return null;
  return "Проверьте контакт: телефон с кодом страны, @username Telegram или email.";
}

export function bookingFeedback(
  status: number,
  body: unknown,
): { success?: string; error?: string } {
  const data =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const id = status === 409 ? data.bookingId : data.id;
  if (
    (status === 201 || status === 409) &&
    typeof id === "string" &&
    id.trim()
  ) {
    return {
      success:
        status === 409
          ? `Заявка № ${id} уже зарегистрирована. Повторно отправлять её не нужно. Участие и наличие мест ещё требуют подтверждения.`
          : `Заявка № ${id} зарегистрирована в MyWaveTour. Сохраните номер. Участие и наличие мест ещё требуют подтверждения; сроки ответа зависят от организатора.`,
    };
  }
  if (status === 404)
    return {
      error:
        "Этот выезд больше недоступен для заявки. Вернитесь в каталог и выберите другой.",
    };
  if (status === 429)
    return {
      error: "Слишком много попыток. Подождите немного и повторите отправку.",
    };
  return {
    error:
      "Не удалось подтвердить регистрацию заявки. Ваши данные остались в форме. Повторите попытку позже.",
  };
}
