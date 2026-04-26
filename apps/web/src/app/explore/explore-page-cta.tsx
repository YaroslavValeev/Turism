import Link from "next/link";
import { StartAlertsSignup } from "../../components/StartAlertsSignup";
import { buildInternalContentQuery } from "../../lib/internalContentUtm";

export function ExplorePageCta({ exploreType, exploreSlug }: { exploreType: string; exploreSlug: string }) {
  const q = buildInternalContentQuery("explore", `${exploreType}:${exploreSlug}`, {
    explore_type: exploreType,
    explore_slug: exploreSlug,
  });
  return (
    <section
      className="mw-container"
      style={{
        marginTop: "2.5rem",
        padding: "clamp(1.25rem, 3vw, 1.75rem)",
        borderRadius: "var(--mw-radius-lg)",
        background: "var(--mw-surface)",
        boxShadow: "var(--mw-shadow)",
        border: "1px solid var(--mw-border)",
      }}
    >
      <h2 className="mw-h2" style={{ marginTop: 0, fontSize: "1.25rem" }}>
        Не знаешь, что выбрать?
      </h2>
      <p style={{ margin: "0 0 1rem", color: "var(--mw-muted)", maxWidth: "62ch" }}>
        Подберём под тебя.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 14px", marginBottom: "1.5rem" }}>
        <Link href={`/organizers/program?${q}`} className="mw-btn mw-btn--primary" prefetch={false}>
          Подобрать программу
        </Link>
        <Link href={`/?${q}#programs`} className="mw-btn mw-btn--ghost" prefetch={false}>
          Смотреть все программы
        </Link>
      </div>
      <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--mw-muted2)" }}>Ответим в течение дня • без обязательств</p>
      <div style={{ borderTop: "1px solid var(--mw-border)", paddingTop: "1.25rem" }}>
        <p style={{ fontWeight: 600, margin: "0 0 0.5rem" }}>Подписка на обновления</p>
        <StartAlertsSignup />
      </div>
    </section>
  );
}
