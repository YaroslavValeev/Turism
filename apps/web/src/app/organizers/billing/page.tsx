import Link from "next/link";

export default function OrganizerBillingPage() {
  return (
    <main className="mw-container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <h1 className="mw-h2">Договор и реквизиты</h1>
      <p className="mw-lead" style={{ maxWidth: 760 }}>
        Данные договора, реквизиты и статусы подключения доступны только после защищённого входа.
        Вводить organizer ID на публичной странице больше не требуется.
      </p>
      <section className="mw-card" style={{ maxWidth: 760 }}>
        <h2 className="mw-h3">Как получить доступ</h2>
        <p>
          Пока личный кабинет организатора находится в закрытом пилоте. Оставьте запрос на верификацию —
          оператор сверит контакт и передаст безопасный способ доступа.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link className="mw-btn mw-btn--primary" href="/organizers/verification">
            Запросить доступ
          </Link>
          <Link className="mw-btn" href="/organizers/program">
            Подать программу
          </Link>
        </div>
      </section>
    </main>
  );
}
