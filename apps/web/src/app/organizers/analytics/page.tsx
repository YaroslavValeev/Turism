import Link from "next/link";

export default function OrganizerAnalyticsPage() {
  return (
    <main className="mw-container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <h1 className="mw-h2">Аналитика организатора</h1>
      <p className="mw-lead" style={{ maxWidth: 760 }}>
        Воронка, бронирования, отзывы и внутренние оценки доступны только авторизованному оператору.
        Публичный просмотр по organizer ID отключён для защиты данных.
      </p>
      <section className="mw-card" style={{ maxWidth: 760 }}>
        <h2 className="mw-h3">Закрытый пилот</h2>
        <p>
          Если вы участвуете в пилоте, запросите доступ через верификацию. До запуска кабинета отчёт можно
          получить у оператора после подтверждения контакта.
        </p>
        <Link className="mw-btn mw-btn--primary" href="/organizers/verification">
          Запросить доступ
        </Link>
      </section>
    </main>
  );
}
