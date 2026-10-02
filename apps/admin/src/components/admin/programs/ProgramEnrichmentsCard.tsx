"use client";

import { useCallback, useEffect, useState } from "react";
import { adminJson } from "../../../lib/admin";

type Source = { url: string; title?: string; accessedAt: string };
type Hotel = {
  name: string;
  siteUrl?: string;
  aggregator?: { name: string; url: string; rating?: number; ratingScale?: number; reviewsCount?: number };
  distanceNote?: string;
};
type Enrichment = {
  id: string;
  field: "accommodation" | "transfer" | "equipment";
  status: "draft" | "approved" | "rejected" | "retired";
  contentJson: { summary?: string; hotels?: Hotel[]; text?: string };
  sourcesJson: Source[];
  batchId: string | null;
  createdBy: string;
  checkedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
};

const FIELD_LABELS: Record<Enrichment["field"], string> = {
  accommodation: "Проживание",
  transfer: "Трансфер",
  equipment: "Экипировка",
};

const STATUS_LABELS: Record<Enrichment["status"], { label: string; color: string }> = {
  draft: { label: "черновик — ждёт ревью", color: "#b54708" },
  approved: { label: "одобрено — на сайте, если поле организатора пустое", color: "#1f7a4d" },
  rejected: { label: "отклонено", color: "#b42318" },
  retired: { label: "заменено новым одобрением", color: "#6b7280" },
};

const AGGREGATOR_LABELS: Record<string, string> = { yandex_travel: "Яндекс Путешествия", ostrovok: "Островок" };

function day(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ru-RU", { timeZone: "UTC" });
}

function ContentPreview({ row }: { row: Enrichment }) {
  const c = row.contentJson ?? {};
  if (row.field !== "accommodation") return <span>{c.text}</span>;
  return (
    <div className="mw-admin-stack-6">
      {c.summary ? <span>{c.summary}</span> : null}
      {(c.hotels ?? []).map((h, i) => (
        <span key={`${i}-${h.name}`}>
          • <strong>{h.name}</strong>
          {h.distanceNote ? ` — ${h.distanceNote}` : ""}
          {h.siteUrl ? (
            <>
              {" · "}
              <a href={h.siteUrl} target="_blank" rel="noreferrer">сайт</a>
            </>
          ) : null}
          {h.aggregator ? (
            <>
              {" · "}
              <a href={h.aggregator.url} target="_blank" rel="noreferrer">
                {AGGREGATOR_LABELS[h.aggregator.name] ?? h.aggregator.name}
                {h.aggregator.rating != null && h.aggregator.ratingScale ? ` ${h.aggregator.rating}/${h.aggregator.ratingScale}` : ""}
                {h.aggregator.reviewsCount != null ? ` (${h.aggregator.reviewsCount} отз.)` : ""}
              </a>
            </>
          ) : null}
        </span>
      ))}
    </div>
  );
}

export function ProgramEnrichmentsCard({ programId }: { programId: string }) {
  const [rows, setRows] = useState<Enrichment[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await adminJson<Enrichment[]>(`/programs/${programId}/enrichments`));
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Не удалось загрузить OSINT-дополнения" });
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (row: Enrichment, action: "approve" | "reject") => {
    let body: string | undefined;
    if (action === "reject") {
      const reason = window.prompt("Причина отклонения (увидят только в админке):")?.trim();
      if (!reason) return;
      body = JSON.stringify({ reason });
    }
    setBusyId(row.id);
    try {
      await adminJson(`/programs/enrichments/${row.id}/${action}`, { method: "POST", body });
      setNotice({
        kind: "ok",
        text: action === "approve" ? `${FIELD_LABELS[row.field]}: дополнение одобрено.` : `${FIELD_LABELS[row.field]}: дополнение отклонено.`,
      });
      await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Не удалось выполнить действие" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mw-admin-stack-6" style={{ border: "1px solid #d9e2dc", borderRadius: 10, padding: "10px 12px", background: "#fafafa" }}>
      <span className="mw-admin-caption">
        <strong>OSINT-дополнения</strong> — данные из открытых источников. На сайте показываются только одобренные и только если
        организатор не заполнил соответствующее поле.
      </span>
      {rows === null ? (
        <span className="mw-admin-caption">Загружаем...</span>
      ) : rows.length === 0 ? (
        <span className="mw-admin-caption">Дополнений нет. Импорт: pnpm --filter api db:import:program-enrichments -- --file=… (сначала без --apply).</span>
      ) : (
        (Object.keys(FIELD_LABELS) as Enrichment["field"][]).map((field) => {
          const list = rows.filter((r) => r.field === field);
          if (list.length === 0) return null;
          return (
            <div key={field} className="mw-admin-stack-6">
              <span className="mw-admin-caption"><strong>{FIELD_LABELS[field]}</strong></span>
              {list.map((row) => (
                <div key={row.id} className="mw-admin-stack-6" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 6 }}>
                  <span className="mw-admin-caption" style={{ color: STATUS_LABELS[row.status].color }}>
                    {STATUS_LABELS[row.status].label} · проверено {day(row.checkedAt)}
                    {row.batchId ? ` · пакет ${row.batchId}` : ""}
                    {row.rejectionReason ? ` · причина: ${row.rejectionReason}` : ""}
                  </span>
                  <ContentPreview row={row} />
                  <span className="mw-admin-caption">
                    Источники:{" "}
                    {(row.sourcesJson ?? []).map((s, i) => (
                      <span key={`${i}-${s.url}`}>
                        {i > 0 ? ", " : null}
                        <a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>
                      </span>
                    ))}
                  </span>
                  {row.status === "draft" || row.status === "approved" ? (
                    <div className="mw-admin-inline-form">
                      {row.status === "draft" ? (
                        <button type="button" className="mw-admin-btn" disabled={busyId === row.id} onClick={() => void act(row, "approve")}>
                          Одобрить
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="mw-admin-btn mw-admin-btn--ghost"
                        disabled={busyId === row.id}
                        onClick={() => void act(row, "reject")}
                      >
                        Отклонить
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          );
        })
      )}
      {notice ? (
        <span className="mw-admin-caption" style={{ color: notice.kind === "error" ? "#b42318" : "#1f7a4d" }}>
          {notice.text}
        </span>
      ) : null}
    </div>
  );
}
