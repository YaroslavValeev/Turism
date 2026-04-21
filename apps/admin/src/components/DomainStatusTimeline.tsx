"use client";

export type DomainStatusEventRow = {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  fromStatus: string | null;
  toStatus: string | null;
  triggerMode: string;
  actorId: string | null;
  actorMarker: string | null;
  reason: string | null;
  source: string | null;
  occurredAt: string;
};

type Props = {
  title?: string;
  events: DomainStatusEventRow[];
  loading?: boolean;
  error?: string | null;
};

export function DomainStatusTimeline({ title = "Статусная хронология", events, loading, error }: Props) {
  if (loading) {
    return <p style={{ fontSize: 13, color: "#666" }}>Загрузка событий…</p>;
  }
  if (error) {
    return <p style={{ fontSize: 13, color: "#b00020" }}>{error}</p>;
  }
  if (events.length === 0) {
    return <p style={{ fontSize: 13, color: "#666" }}>Пока нет записей в доменном журнале.</p>;
  }
  return (
    <section style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>{title}</h3>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.45 }}>
        {events.map((ev) => (
          <li key={ev.id} style={{ marginBottom: 10 }}>
            <div>
              <strong>{ev.eventType}</strong>
              <span style={{ color: "#666" }}>
                {" "}
                · {new Date(ev.occurredAt).toLocaleString("ru-RU")}
              </span>
            </div>
            <div style={{ color: "#444" }}>
              {ev.fromStatus ?? "—"} → {ev.toStatus ?? "—"} · {ev.triggerMode}
              {ev.actorId ? ` · actor: ${ev.actorId}` : ""}
              {ev.actorMarker ? ` · ${ev.actorMarker}` : ""}
            </div>
            {ev.source && (
              <div style={{ color: "#666", fontSize: 12 }}>
                Источник: {ev.source}
              </div>
            )}
            {ev.reason && (
              <div style={{ color: "#555", fontSize: 12, whiteSpace: "pre-wrap" }}>
                Причина: {ev.reason}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
