import Link from "next/link";
import type { FormEvent } from "react";
import { contactError } from "../../lib/bookingFeedback";

type Props = {
  ended: boolean;
  returnTo: string;
  guestContact: string;
  onGuestContactChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  consentTransfer: boolean;
  onConsentTransferChange: (value: boolean) => void;
  consentPrivacy: boolean;
  onConsentPrivacyChange: (value: boolean) => void;
  submitting: boolean;
  submitError: string;
  submitSuccess: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/**
 * Разметка существующей формы заявки. Состояние, валидация и POST /bookings остаются в контейнере;
 * id полей (`guestContact`, `notes`, `program-request-feedback`) и якорь `#request` — часть контракта.
 */
export function ProgramApplicationForm({
  ended,
  returnTo,
  guestContact,
  onGuestContactChange,
  notes,
  onNotesChange,
  consentTransfer,
  onConsentTransferChange,
  consentPrivacy,
  onConsentPrivacyChange,
  submitting,
  submitError,
  submitSuccess,
  onSubmit,
}: Props) {
  const contactInvalid = Boolean(submitError && contactError(guestContact));
  const contactDescribedBy = ["program-request-hint", submitError || submitSuccess ? "program-request-feedback" : null]
    .filter(Boolean)
    .join(" ");

  return (
    <section id="request" className="mw-form-card mw-pdp-form" aria-labelledby="request-title">
      <h2 id="request-title" className="mw-pdp-h2">
        {ended ? "Выезд завершён" : "Оставить заявку на участие"}
      </h2>
      {ended && (
        <p role="status">
          Эти даты уже прошли. <Link href={returnTo}>Выберите актуальный выезд в каталоге</Link>.
        </p>
      )}
      <p id="program-request-hint" className="mw-form-hint">
        Укажите контакт для ответа. Заявка не бронирует место и не требует оплаты на сайте.
      </p>
      {submitError && (
        <p id="program-request-feedback" tabIndex={-1} role="alert" className="mw-pdp-form__error">
          {submitError}
        </p>
      )}
      {submitSuccess && (
        <div className="mw-success-panel">
          <p id="program-request-feedback" tabIndex={-1} role="status" aria-live="polite">
            {submitSuccess}
          </p>
          <Link href={returnTo}>Вернуться к результатам поиска</Link>
        </div>
      )}
      {!submitSuccess && (
        <form onSubmit={onSubmit} noValidate aria-busy={submitting}>
          <div className="mw-field mw-pdp-form__field">
            <label htmlFor="guestContact">Телефон, Telegram или email</label>
            <input
              id="guestContact"
              className="mw-input"
              value={guestContact}
              onChange={(e) => onGuestContactChange(e.target.value)}
              placeholder="+7…, @telegram или почта"
              disabled={submitting}
              autoComplete="off"
              maxLength={254}
              required
              aria-required="true"
              aria-describedby={contactDescribedBy}
              aria-invalid={contactInvalid}
            />
          </div>
          <div className="mw-field mw-pdp-form__field">
            <label htmlFor="notes">Что важно для тебя в этом выезде</label>
            <textarea
              id="notes"
              className="mw-textarea"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Ваш уровень, желаемые даты, кто едет, что важно по поездке"
              rows={4}
              disabled={submitting}
            />
          </div>
          <div className="mw-field mw-pdp-form__consent">
            <label>
              <input
                type="checkbox"
                checked={consentTransfer}
                onChange={(e) => onConsentTransferChange(e.target.checked)}
                disabled={submitting}
                required
              />
              <span>Соглашаюсь на передачу контакта организатору этой программы для ответа по заявке.</span>
            </label>
          </div>
          <div className="mw-field mw-pdp-form__consent">
            <label>
              <input
                type="checkbox"
                checked={consentPrivacy}
                onChange={(e) => onConsentPrivacyChange(e.target.checked)}
                disabled={submitting}
                required
              />
              <span>
                Ознакомился с{" "}
                <Link href="/privacy-and-consent" className="mw-link" prefetch={false}>
                  политикой и согласием
                </Link>{" "}
                (в т.ч. обработка данных в рамках заявки).
              </span>
            </label>
          </div>
          <button type="submit" disabled={submitting || ended} className="mw-btn mw-btn--primary mw-pdp-form__submit">
            {ended ? "Выезд завершён" : submitting ? "Отправляем…" : "Оставить заявку"}
          </button>
          <p className="mw-form-note">Срок ответа зависит от организатора. Оплата на сайте не производится.</p>
          <p className="mw-form-note">Финальные условия подтвердит организатор.</p>
        </form>
      )}
    </section>
  );
}
