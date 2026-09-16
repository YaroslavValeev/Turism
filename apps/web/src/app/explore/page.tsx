import type { Metadata } from "next";
import Link from "next/link";
import { fetchPublicExploreList } from "../../lib/exploreApi";
import type { ExploreHubType } from "../../lib/exploreApi";

export const metadata: Metadata = {
  title: "Темы и направления — программы, подборки, статьи | MyWave",
  description:
    "Тематические страницы MyWaveTour: дисциплины, регионы, сезоны — актуальные программы, материалы и подборки.",
  alternates: { canonical: "/explore" },
};

const hubHeroStyle = {
  padding: "clamp(1.25rem, 4vw, 2rem)",
  borderRadius: "var(--mw-radius-lg)",
  background: "linear-gradient(135deg, rgba(210, 250, 243, 0.98), rgba(255, 255, 255, 0.98))",
  border: "1px solid rgba(13, 105, 94, 0.22)",
  boxShadow: "0 18px 40px rgba(16, 44, 40, 0.1)",
  marginBottom: "2rem",
} as const;

const hubCardStyle = {
  height: "100%",
  padding: "1.1rem 1.15rem",
  borderRadius: "var(--mw-radius)",
  background: "#fff",
  border: "1px solid rgba(13, 105, 94, 0.18)",
  boxShadow: "0 12px 30px rgba(16, 44, 40, 0.08)",
  display: "grid",
  gap: "0.85rem",
} as const;

function typeLabelRu(t: ExploreHubType): string {
  switch (t) {
    case "discipline":
      return "Дисциплина";
    case "region":
      return "Регион";
    case "season":
      return "Сезон";
    default:
      return t;
  }
}

function typeHintRu(t: ExploreHubType): string {
  switch (t) {
    case "discipline":
      return "Выберите спорт и сразу перейдите к программам, статьям и подборкам по направлению.";
    case "region":
      return "Смотрите выезды и материалы по месту проведения, не смешивая регионы в выдаче.";
    case "season":
      return "Подбирайте поездки по времени старта: зима, весна, лето или осень.";
    default:
      return "";
  }
}

function materialWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "материал";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "материала";
  return "материалов";
}

function catalogHref(item: { type: ExploreHubType; slug: string; label: string }): string {
  const p = new URLSearchParams();
  if (item.type === "discipline") p.set("discipline", item.label);
  if (item.type === "region") p.set("region", item.label);
  if (item.type === "season") p.set("season", item.slug);
  const q = p.toString();
  return `/${q ? `?${q}` : ""}#programs`;
}

export default async function ExploreIndexPage() {
  const items = await fetchPublicExploreList();

  const byType: Record<ExploreHubType, typeof items> = { discipline: [], region: [], season: [] };
  for (const it of items) {
    byType[it.type].push(it);
  }

  return (
    <div className="mw-container" style={{ paddingBottom: "3rem" }}>
      <nav aria-label="Хлебные крошки" style={{ fontSize: "0.95rem", color: "var(--mw-muted)", marginBottom: "1.25rem" }}>
        <Link href="/" style={{ color: "var(--mw-accent)" }}>
          Главная
        </Link>
        <span style={{ margin: "0 0.4rem", color: "var(--mw-muted2)" }}>/</span>
        <span style={{ color: "var(--mw-text)" }}>Темы</span>
      </nav>
      <section
        style={hubHeroStyle}
      >
        <p style={{ margin: "0 0 0.55rem", color: "#3f625e", fontWeight: 800 }}>
          Навигация по каталогу
        </p>
        <h1 className="mw-h1" style={{ marginTop: 0, marginBottom: "1rem", fontSize: "clamp(1.65rem, 4vw, 2.35rem)" }}>
          Темы и направления
        </h1>
        <p style={{ color: "#385a56", maxWidth: "72ch", lineHeight: 1.65, margin: "0 0 1.25rem" }}>
          Выберите дисциплину, регион или сезон — внутри будут только связанные программы, подборки и статьи. Если нужна поездка без чтения материалов, переходите сразу в каталог.
        </p>
        <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <Link href="/#programs" className="mw-btn mw-btn--primary">
            Смотреть все выезды
          </Link>
          <Link href="/collections" className="mw-btn mw-btn--ghost">
            Открыть подборки
          </Link>
        </p>
      </section>

      {items.length === 0 ? (
        <div className="mw-empty-state">
          <h2>Темы скоро появятся</h2>
          <p>Пока нет опубликованных тематических страниц. Можно открыть общий каталог и выбрать программу вручную.</p>
          <Link href="/#programs" className="mw-btn mw-btn--primary">
            Перейти в каталог
          </Link>
        </div>
      ) : (
        (["discipline", "region", "season"] as const).map((t) => {
          const list = byType[t];
          if (list.length === 0) return null;
          return (
            <section key={t} style={{ marginBottom: "2.5rem" }}>
              <div style={{ marginBottom: "1rem" }}>
                <h2 className="mw-h2" style={{ fontSize: "1.25rem", margin: "0 0 0.35rem" }}>
                  {typeLabelRu(t)}
                </h2>
                <p style={{ margin: 0, color: "#4a625f", lineHeight: 1.55 }}>{typeHintRu(t)}</p>
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gap: "1rem",
                  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
                }}
              >
                {list.map((it) => (
                  <li key={`${it.type}-${it.slug}`}>
                    <article style={hubCardStyle}>
                      <div>
                        <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.08rem", lineHeight: 1.3 }}>
                          <Link
                            href={`/explore/${it.type}/${encodeURIComponent(it.slug)}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                          >
                            {it.label}
                          </Link>
                        </h3>
                        <p style={{ margin: 0, color: "#58706d", fontSize: "0.92rem" }}>
                          {it.counts.total} {materialWord(it.counts.total)}
                        </p>
                      </div>
                      <dl
                        style={{
                          margin: 0,
                          display: "grid",
                          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                          gap: "0.5rem",
                          color: "#58706d",
                        }}
                      >
                        <div>
                          <dt style={{ fontSize: "0.75rem", color: "#58706d" }}>Программы</dt>
                          <dd style={{ margin: 0, fontWeight: 700, color: "var(--mw-text)" }}>{it.counts.programs}</dd>
                        </div>
                        <div>
                          <dt style={{ fontSize: "0.75rem", color: "#58706d" }}>Подборки</dt>
                          <dd style={{ margin: 0, fontWeight: 700, color: "var(--mw-text)" }}>{it.counts.collections}</dd>
                        </div>
                        <div>
                          <dt style={{ fontSize: "0.75rem", color: "#58706d" }}>Статьи</dt>
                          <dd style={{ margin: 0, fontWeight: 700, color: "var(--mw-text)" }}>{it.counts.blogPosts}</dd>
                        </div>
                      </dl>
                      <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "0.55rem" }}>
                        <Link href={`/explore/${it.type}/${encodeURIComponent(it.slug)}`} className="mw-btn mw-btn--primary" style={{ fontSize: "0.92rem" }}>
                          Открыть тему
                        </Link>
                        {it.counts.programs > 0 ? (
                          <Link href={catalogHref(it)} className="mw-btn mw-btn--ghost" style={{ fontSize: "0.92rem" }}>
                            В каталог
                          </Link>
                        ) : null}
                      </p>
                    </article>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
