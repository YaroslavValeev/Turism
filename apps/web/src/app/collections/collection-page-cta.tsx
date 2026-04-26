import Link from "next/link";
import { StartAlertsSignup } from "../../components/StartAlertsSignup";
import { buildCollectionUtmQuery } from "../../lib/utm";

export function CollectionPageCta({ collectionSlug, collectionId }: { collectionSlug: string; collectionId: string }) {
  const qLegacy = buildCollectionUtmQuery(collectionSlug, collectionId);
  const p = new URLSearchParams(qLegacy);
  p.set("utm_source", "internal");
  p.set("utm_medium", "content");
  p.set("entry_type", "collection");
  p.set("entry_id", collectionId);
  const q = p.toString();
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
        Не уверен, какой выбрать?
      </h2>
      <p style={{ margin: "0 0 1rem", color: "var(--mw-muted)", maxWidth: "62ch" }}>
        Поможем подобрать под тебя.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 14px", marginBottom: "1.5rem" }}>
        <Link href={`/?${q}#programs`} className="mw-btn mw-btn--primary" prefetch={false}>
          Подобрать из этой подборки
        </Link>
        <Link href={`/organizers/program?${q}`} className="mw-btn mw-btn--ghost" prefetch={false}>
          Получить рекомендации
        </Link>
      </div>
      <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "var(--mw-muted2)" }}>
        Учитываем уровень, даты и бюджет • без обязательств
      </p>
      <div style={{ borderTop: "1px solid var(--mw-border)", paddingTop: "1.25rem" }}>
        <p style={{ fontWeight: 600, margin: "0 0 0.5rem" }}>Подписка на обновления</p>
        <StartAlertsSignup />
      </div>
    </section>
  );
}
