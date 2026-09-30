import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { fetchSpotsMethodology } from "../../../lib/spotsApi";

export const metadata: Metadata = {
  title: "Методика рейтинга вейксерф-спотов | MyWaveTour",
  description:
    "Как MyWave оценивает вейксерф-споты: шесть категорий с весами, восемь обязательных требований, срок действия оценки и принципы независимости.",
  alternates: { canonical: "/spots/methodology" },
};

export default async function SpotsMethodologyPage() {
  // API недоступен во время docker build: пререндер «запёк» бы пустую страницу до первой ревалидации.
  await connection();
  const m = await fetchSpotsMethodology();

  return (
    <div className="mw-container" style={{ paddingBottom: "3rem", maxWidth: 900 }}>
      <nav aria-label="Хлебные крошки" style={{ fontSize: "0.95rem", color: "var(--mw-muted)", marginBottom: "1.25rem" }}>
        <Link href="/" style={{ color: "var(--mw-accent)" }}>Главная</Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <Link href="/spots" style={{ color: "var(--mw-accent)" }}>Споты</Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <span style={{ color: "var(--mw-text)" }}>Методика</span>
      </nav>

      <h1 className="mw-h1" style={{ marginTop: 0, fontSize: "clamp(1.6rem, 4vw, 2.2rem)" }}>Методика рейтинга вейксерф-спотов</h1>

      {!m ? (
        <div className="mw-empty-state">
          <h2>Методика временно недоступна</h2>
          <p>Попробуйте обновить страницу через минуту.</p>
        </div>
      ) : (
        <>
          <p style={{ color: "#4a625f" }}>Версия методики: {m.methodologyVersion}. Оценка действует {m.validityMonths} месяцев с даты теста.</p>

          <h2 className="mw-h2" style={{ fontSize: "1.25rem" }}>Принципы</h2>
          <ul style={{ lineHeight: 1.65 }}>
            {m.principles.map((p) => <li key={p}>{p}</li>)}
          </ul>

          <h2 className="mw-h2" style={{ fontSize: "1.25rem" }}>Категории и веса</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.5rem" }}>
            <tbody>
              {m.categories.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(13, 105, 94, 0.15)" }}>
                  <td style={{ padding: "0.5rem 0" }}>{c.label}</td>
                  <td style={{ padding: "0.5rem 0", textAlign: "right", fontWeight: 700 }}>{c.weight}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mw-h2" style={{ fontSize: "1.25rem" }}>Обязательные требования</h2>
          <p style={{ color: "#4a625f" }}>Если хотя бы одно не выполнено или не проверено, рейтинг не публикуется.</p>
          <ul style={{ lineHeight: 1.65 }}>
            {m.mandatoryGates.map((g) => <li key={g.id}>{g.label}</li>)}
          </ul>

          <h2 className="mw-h2" style={{ fontSize: "1.25rem" }}>Шкала</h2>
          <ul style={{ lineHeight: 1.65 }}>
            {m.bands.map((b) => (
              <li key={b.band}>
                <strong>{b.label}</strong> — от {b.minScore.toFixed(1).replace(".", ",")}
              </li>
            ))}
          </ul>
        </>
      )}

      <p style={{ marginTop: "2rem" }}>
        <Link href="/spots" style={{ color: "var(--mw-accent)" }}>← К списку спотов</Link>
      </p>
    </div>
  );
}
