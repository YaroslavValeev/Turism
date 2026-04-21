"use client";

import { useState, type ReactNode } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Props = {
  discipline: string;
  region?: string;
};

type NotifyChannel = "email" | "telegram" | "max";

function IconEmail() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
      <path
        fill="currentColor"
        d="M4 6.5C4 5.67 4.67 5 5.5 5h13c.83 0 1.5.67 1.5 1.5v11c0 .83-.67 1.5-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-11Zm1.2.9 6.3 4.72a1 1 0 0 0 1.2 0L18.8 7.4H5.2Zm-.2 1.35V16.9l4.35-3.26L5 9.75Zm15 8.8V7.35l-4.35 3.26L19 16.9ZM17.65 17H6.35l-4-3 6.15-4.61L12 14l3.5-2.62 6.15 4.61-4 3Z"
      />
    </svg>
  );
}

function IconTelegram() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
      <path
        fill="currentColor"
        d="m9.04 15.92 10.5-7.45c.55-.39.42-1.25-.22-1.45L4.18 3.05c-.75-.24-1.45.45-1.2 1.2l2.35 7.55c.12.38.45.65.85.68l3.86.44Zm1.56-1.28-.44-3.86 5.9-5.9-14.2 9.76 8.74-.01Z"
      />
    </svg>
  );
}

function IconMax() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        fill="currentColor"
        d="M7.2 16V8h2.1l2.7 4.55L14.7 8H16.8v8h-2V11.2L12 15.2h-1.2L9.2 11.25V16H7.2Z"
      />
    </svg>
  );
}

function HintDetails({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="mw-hint-details">
      <summary title={label}>
        <span className="mw-sr-only">{label}</span>
        <span aria-hidden="true">i</span>
      </summary>
      <div className="mw-hint-details__body">{children}</div>
    </details>
  );
}

export function StartAlertsSignup({ discipline, region }: Props) {
  const [email, setEmail] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [maxRecipientId, setMaxRecipientId] = useState("");
  const [useEmail, setUseEmail] = useState(true);
  const [useTelegram, setUseTelegram] = useState(false);
  const [useMax, setUseMax] = useState(false);
  const [alsoDateChanges, setAlsoDateChanges] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const trimmedDiscipline = discipline.trim();
  const normalizedTelegramChatId = telegramChatId.trim();
  const normalizedMaxRecipientId = maxRecipientId.trim();
  const hasContact =
    (useEmail && Boolean(email.trim())) ||
    (useTelegram && Boolean(normalizedTelegramChatId)) ||
    (useMax && Boolean(normalizedMaxRecipientId));
  const anyChannel = useEmail || useTelegram || useMax;
  const canSubmit = Boolean(trimmedDiscipline && anyChannel && hasContact && consent);

  async function postSubscription(channel: NotifyChannel, type: "seasonal" | "program_updates"): Promise<string> {
    const filters: Record<string, string> = { discipline: trimmedDiscipline };
    if (region?.trim()) filters.region = region.trim();
    const res = await fetch(`${API_URL}/public/notification-subscriptions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel,
        type,
        contactEmail: channel === "email" ? email.trim() : undefined,
        telegramChatId: channel === "telegram" ? normalizedTelegramChatId : undefined,
        maxRecipientId: channel === "max" ? normalizedMaxRecipientId : undefined,
        consent: true,
        filters,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${res.status}`);
    }
    return typeof body?.message === "string" ? body.message : "Запрос принят.";
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anyChannel) {
      setNote({ kind: "err", text: "Выберите хотя бы один канал." });
      return;
    }
    if (useTelegram && !normalizedTelegramChatId) {
      setNote({ kind: "err", text: "Для Telegram укажите chat id." });
      return;
    }
    if (useMax && !normalizedMaxRecipientId) {
      setNote({ kind: "err", text: "Для MAX укажите идентификатор получателя." });
      return;
    }
    if (!canSubmit) return;
    setBusy(true);
    setNote(null);
    try {
      const channels: NotifyChannel[] = [];
      if (useEmail) channels.push("email");
      if (useTelegram) channels.push("telegram");
      if (useMax) channels.push("max");
      const lines: string[] = [];
      for (const channel of channels) {
        lines.push(await postSubscription(channel, "seasonal"));
        if (alsoDateChanges) {
          lines.push(await postSubscription(channel, "program_updates"));
        }
      }
      const text = [...new Set(lines)].join(" ");
      setNote({ kind: "ok", text });
    } catch (err) {
      setNote({ kind: "err", text: err instanceof Error ? err.message : "Не удалось сохранить" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mw-card"
      style={{
        marginTop: 16,
        marginBottom: 8,
        padding: "14px 16px",
        borderColor: "rgba(13,148,136,0.2)",
        background: "rgba(248,250,252,0.95)",
      }}
    >
      <h3 className="mw-h3" style={{ marginTop: 0, marginBottom: 8 }}>
        Уведомления по каталогу
      </h3>
      {!trimmedDiscipline ? (
        <p style={{ margin: 0, fontSize: "0.92rem", color: "var(--mw-muted)", lineHeight: 1.55 }}>
          Выберите дисциплину в фильтрах шапки — затем можно подписаться на напоминания о стартах (иконки каналов ниже).
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mw-catalog-notify-form">
          <p style={{ margin: 0, fontSize: "0.92rem", color: "var(--mw-muted)", lineHeight: 1.55 }}>
            Дисциплина: <strong>{trimmedDiscipline}</strong>
            {region?.trim() ? (
              <>
                {" "}
                · регион: <strong>{region.trim()}</strong>
              </>
            ) : null}
          </p>

          <div className="mw-catalog-notify-channels">
            <span className="mw-catalog-notify-channels__label">Каналы</span>
            <div className="mw-catalog-notify-chips">
              <div className="mw-channel-wrap">
                <label
                  className={`mw-channel-toggle${useEmail ? " mw-channel-toggle--on" : ""}`}
                  aria-label="Получать на Email"
                >
                  <input type="checkbox" checked={useEmail} onChange={(e) => setUseEmail(e.target.checked)} />
                  <IconEmail />
                </label>
                <HintDetails label="Подробнее: уведомления на Email">
                  <p style={{ margin: "0 0 8px" }}>
                    На email уходит подтверждение подписки и дальнейшие письма по выбранной дисциплине. В каждом письме есть ссылка отписки.
                  </p>
                </HintDetails>
              </div>
              <div className="mw-channel-wrap">
                <label
                  className={`mw-channel-toggle${useTelegram ? " mw-channel-toggle--on" : ""}`}
                  aria-label="Получать в Telegram"
                >
                  <input type="checkbox" checked={useTelegram} onChange={(e) => setUseTelegram(e.target.checked)} />
                  <IconTelegram />
                </label>
                <HintDetails label="Подробнее: Telegram">
                  <p style={{ margin: "0 0 8px" }}>
                    Нужен числовой <code>chat id</code> (личный или группа, например <code>-100…</code>).
                  </p>
                  <p style={{ margin: 0 }}>
                    Как получить: напишите боту MyWave команду <code>/start</code>. Если id не показался — напишите в поддержку, пришлют ваш{" "}
                    <code>chat id</code>.
                  </p>
                </HintDetails>
              </div>
              <div className="mw-channel-wrap">
                <label className={`mw-channel-toggle${useMax ? " mw-channel-toggle--on" : ""}`} aria-label="Получать в MAX">
                  <input type="checkbox" checked={useMax} onChange={(e) => setUseMax(e.target.checked)} />
                  <IconMax />
                </label>
                <HintDetails label="Подробнее: MAX">
                  <p style={{ margin: "0 0 8px" }}>
                    Вставьте идентификатор получателя из MAX (точный формат задаётся официальным API). Подписка в каталоге сохраняется сразу.
                  </p>
                  <p style={{ margin: 0 }}>
                    Доставка сообщений включится после настройки на сервере переменных <code>MAX_MESSENGER_API_BASE_URL</code> и при необходимости{" "}
                    <code>MAX_MESSENGER_SEND_PATH</code> / <code>MAX_MESSENGER_ACCESS_TOKEN</code>.
                  </p>
                </HintDetails>
              </div>
            </div>
          </div>

          {useEmail && (
            <label className="mw-field" style={{ margin: 0 }}>
              <span className="mw-catalog-notify-inline" style={{ width: "100%" }}>
                <span className="mw-catalog-notify-fieldhead">Email</span>
                <HintDetails label="Подробнее: поле Email">
                  <p style={{ margin: 0 }}>Используйте адрес, к которому есть доступ: на него придёт письмо с подтверждением перед активацией рассылки.</p>
                </HintDetails>
              </span>
              <input className="mw-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required={useEmail} />
            </label>
          )}

          {useTelegram && (
            <label className="mw-field" style={{ margin: 0 }}>
              <span className="mw-catalog-notify-inline" style={{ width: "100%" }}>
                <span className="mw-catalog-notify-fieldhead">Telegram chat id</span>
                <HintDetails label="Подробнее: Telegram chat id">
                  <p style={{ margin: "0 0 8px" }}>Допустимы только цифры и знак минус (для супергрупп).</p>
                  <p style={{ margin: 0 }}>Примеры: <code>123456789</code> или <code>-1001234567890</code>.</p>
                </HintDetails>
              </span>
              <input
                className="mw-input"
                type="text"
                inputMode="numeric"
                placeholder="123456789 или -100…"
                value={telegramChatId}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^\d-]/g, "");
                  setTelegramChatId(cleaned);
                }}
                required={useTelegram}
              />
            </label>
          )}

          {useMax && (
            <label className="mw-field" style={{ margin: 0 }}>
              <span className="mw-catalog-notify-inline" style={{ width: "100%" }}>
                <span className="mw-catalog-notify-fieldhead">Идентификатор в MAX</span>
                <HintDetails label="Подробнее: идентификатор MAX">
                  <p style={{ margin: 0 }}>
                    Поле очищается от пробелов и опасных символов. Когда будет финальный контракт MAX, подсказку и маску ввода можно уточнить без смены логики подписки.
                  </p>
                </HintDetails>
              </span>
              <input
                className="mw-input"
                type="text"
                placeholder="id получателя в MAX"
                value={maxRecipientId}
                onChange={(e) => {
                  const v = e.target.value.replace(/[\s<>"'`\\]/g, "");
                  if (v.length <= 256) setMaxRecipientId(v);
                }}
                required={useMax}
              />
            </label>
          )}

          <div className="mw-catalog-notify-consent">
            <label className="mw-catalog-notify-check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>Согласен на уведомления MyWave Travel по выбранной теме и каналам.</span>
            </label>
            <HintDetails label="Полный текст согласия">
              <p style={{ margin: "0 0 8px" }}>
                Для <strong>email</strong> сначала придёт письмо с подтверждением; для <strong>Telegram</strong> и <strong>MAX</strong> запись в каталоге подписок активируется сразу.
              </p>
              <p style={{ margin: 0 }}>
                Доставка в MAX заработает после настройки API на сервере (см. переменные окружения <code>MAX_MESSENGER_*</code>).
              </p>
            </HintDetails>
          </div>

          <div className="mw-catalog-notify-consent">
            <label className="mw-catalog-notify-check">
              <input type="checkbox" checked={alsoDateChanges} onChange={(e) => setAlsoDateChanges(e.target.checked)} />
              <span>Также сообщать об изменении дат у уже опубликованных программ.</span>
            </label>
            <HintDetails label="Подробнее: уведомления о смене дат">
              <p style={{ margin: 0 }}>
                Отдельная подписка типа «изменения дат»: если у программы из каталога сдвинутся даты старта/окончания, вы получите уведомление в выбранных каналах (с учётом лимитов и анти-дребезга на стороне сервера).
              </p>
            </HintDetails>
          </div>

          <button type="submit" className="mw-btn mw-btn--primary" disabled={!canSubmit || busy} style={{ justifySelf: "start" }}>
            {busy ? "Сохраняем…" : "Подписаться"}
          </button>
          {note && (
            <p style={{ margin: 0, color: note.kind === "ok" ? "#1d6f42" : "#b42318", fontSize: "0.9rem" }}>{note.text}</p>
          )}
        </form>
      )}
    </div>
  );
}
