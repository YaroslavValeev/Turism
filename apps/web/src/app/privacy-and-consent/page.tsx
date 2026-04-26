export default function PrivacyAndConsentPage() {
  return (
    <main className="mw-container" style={{ padding: "32px 0 56px", maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 14px", fontSize: "2rem" }}>Конфиденциальность и согласие</h1>
      <p style={{ margin: "0 0 16px", color: "var(--mw-muted)", lineHeight: 1.65 }}>
        Мы используем cookies и обезличенную аналитику, чтобы понимать, какие разделы сайта полезны пользователям,
        улучшать стабильность и быстрее исправлять ошибки.
      </p>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem" }}>Что собираем</h2>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.65 }}>
          <li>Технические события сайта (открытие страниц, клики по ключевым действиям).</li>
          <li>Обезличенные параметры сессии и устройства.</li>
          <li>Данные, нужные для диагностики ошибок и качества сервиса.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem" }}>Что не делаем</h2>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.65 }}>
          <li>Не продаем персональные данные.</li>
          <li>Не используем аналитику для персонализированной рекламы.</li>
          <li>Не передаем контактные данные третьим лицам для маркетинга.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem" }}>Управление согласием (cookies / аналитика)</h2>
        <p style={{ margin: 0, lineHeight: 1.65, color: "var(--mw-muted)" }}>
          Вы можете принять аналитику или оставить только необходимые cookies через баннер внизу сайта.
          Выбор сохраняется локально в браузере.
        </p>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem" }}>Заявки на программы</h2>
        <p style={{ margin: 0, lineHeight: 1.65, color: "var(--mw-muted)" }}>
          Когда вы отправляете заявку, вы соглашаетесь, что контакт, который вы укажете (телефон, мессенджер или
          email), будет передан организатору выбранной программы для ответа по сделке. Оплата с пользователя
          в пилотном режиме не взимается; условия поездки согласуются напрямую с организатором. Отдельно отмечается
          согласие с настоящей страницей в форме заявки.
        </p>
      </section>

      <p style={{ marginTop: 20, color: "var(--mw-muted)", lineHeight: 1.65 }}>
        Расширенные юридические формулировки (оферта, обработка ПДн по 152-ФЗ) — по запросу к команде MyWave; этот
        раздел — рабочая публичная оболочка для пилота.
      </p>
    </main>
  );
}
