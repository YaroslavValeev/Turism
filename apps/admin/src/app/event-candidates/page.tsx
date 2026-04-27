"use client";

import { useEffect, useMemo, useState } from "react";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";

type SourceOption = {
  id: string;
  name: string;
};

type EventCandidateListItem = {
  id: string;
  status: string;
  reviewPriority: number;
  trustScore: number;
  fitScore: number;
  futureEventScore: number;
  duplicateScore: number;
  finalScore: number;
  normalizedItem: {
    id: string;
    title: string | null;
    discipline: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    startDate: string | null;
    endDate: string | null;
    organizerName: string | null;
    rawItem: {
      source: {
        id: string;
        name: string;
        type: string;
        trustScore: number;
      };
    };
  };
  dedupGroup: {
    id: string;
    groupKey: string;
    mergeStatus: string;
  } | null;
  publishedProgram: {
    id: string;
    publishStatus: string;
    program: {
      id: string;
      title: string;
      publishStatus: string;
    };
  } | null;
};

type CandidateDetail = EventCandidateListItem & {
  decisionNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  normalizedItem: EventCandidateListItem["normalizedItem"] & {
    eventType: string | null;
    descriptionShort: string | null;
    descriptionFull: string | null;
    venue: string | null;
    durationDays: number | null;
    level: string | null;
    priceFrom: number | null;
    currency: string | null;
    bookingUrl: string | null;
    imageUrl: string | null;
    confidenceScore: number;
    rawItem: {
      id: string;
      rawTitle: string | null;
      rawText: string | null;
      source: {
        id: string;
        name: string;
        type: string;
        trustScore: number;
      };
    };
  };
  dedupGroup: {
    id: string;
    groupKey: string;
    mergeStatus: string;
    candidates: Array<{
      id: string;
      status: string;
      finalScore: number;
      normalizedItem: {
        title: string | null;
        organizerName: string | null;
        rawItem: {
          source: {
            name: string;
            type: string;
          };
        };
      };
    }>;
  } | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function statusLabelRu(status: string): string {
  if (status === "new") return "новый";
  if (status === "needs_review") return "требует проверки";
  if (status === "approved") return "одобрен";
  if (status === "rejected") return "отклонён";
  if (status === "merged") return "объединён";
  if (status === "published") return "опубликован";
  if (status === "archived") return "в архиве";
  return status;
}

export default function EventCandidatesPage() {
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [items, setItems] = useState<EventCandidateListItem[]>([]);
  const [selected, setSelected] = useState<CandidateDetail | null>(null);
  const [status, setStatus] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (sourceId) params.set("sourceId", sourceId);
    const suffix = params.toString();
    return suffix ? `?${suffix}` : "";
  }, [sourceId, status]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of items) {
      counts[it.status] = (counts[it.status] ?? 0) + 1;
    }
    return {
      total: items.length,
      counts,
      needsReview: counts.needs_review ?? 0,
      approved: counts.approved ?? 0,
      published: counts.published ?? 0,
    };
  }, [items]);

  function candidateStatusTone(s: string): "ok" | "warn" | "danger" | "muted" {
    if (s === "approved" || s === "published") return "ok";
    if (s === "rejected" || s === "archived") return "danger";
    if (s === "needs_review" || s === "new") return "warn";
    return "muted";
  }

  async function loadList() {
    setLoading(true);
    setError("");
    try {
      const [sourcesData, candidatesData] = await Promise.all([
        adminJson<SourceOption[]>("/sources"),
        adminJson<EventCandidateListItem[]>(`/event-candidates${query}`),
      ]);
      setSources(sourcesData);
      setItems(candidatesData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void loadList();
  }, [query]);

  async function openDetail(id: string) {
    try {
      const detail = await adminJson<CandidateDetail>(`/event-candidates/${id}`);
      setSelected(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runAction(label: string, path: string, body?: Record<string, unknown>) {
    setBusyAction(label);
    setMessage("");
    setError("");
    try {
      await adminJson(path, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
      setMessage(`Действие выполнено: ${label}`);
      if (selected) {
        await openDetail(selected.id);
      }
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction("");
    }
  }

  async function handleApprove() {
    if (!selected) return;
    const notes = window.prompt("Комментарий к одобрению", "");
    await runAction("approve", `/event-candidates/${selected.id}/approve`, { notes });
  }

  async function handleReject() {
    if (!selected) return;
    const notes = window.prompt("Причина отклонения", "");
    await runAction("reject", `/event-candidates/${selected.id}/reject`, { notes });
  }

  async function handleMerge() {
    if (!selected?.dedupGroup) return;
    const options = selected.dedupGroup.candidates.filter((candidate) => candidate.id !== selected.id);
    const suggested = options[0]?.id ?? "";
    const canonicalCandidateId = window.prompt("ID канонического кандидата", suggested);
    if (!canonicalCandidateId) return;
    const notes = window.prompt("Комментарий к объединению", "") ?? null;
    await runAction("merge", `/event-candidates/${selected.id}/merge`, { canonicalCandidateId, notes });
  }

  async function handlePublish() {
    if (!selected) return;
    const editorNotes = window.prompt("Комментарий редактора для черновика", "");
    await runAction("publish", `/event-candidates/${selected.id}/publish`, { editorNotes });
  }

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Кандидаты на публикацию"
        description="Нормализованные анонсы после оценки и дедупликации. Автопубликация отключена: решение принимается вручную."
      />
      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}
      {message ? <AdminMessage type="success">{message}</AdminMessage> : null}

      {loading ? (
        <AdminLoadingState />
      ) : (
        <>
          <AdminStatGrid>
            <AdminStatCard label="В выборке" value={stats.total} hint="С учётом фильтров ниже" />
            <AdminStatCard label="Требуют проверки" value={stats.needsReview} />
            <AdminStatCard label="Одобрены" value={stats.approved} />
            <AdminStatCard label="Опубликованы" value={stats.published} />
          </AdminStatGrid>

          <AdminFiltersBar title="Фильтры">
            <AdminFilterField label="Статус кандидата">
              <select className="mw-admin-input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ minWidth: 200 }}>
                <option value="">Все статусы</option>
                <option value="new">новый</option>
                <option value="needs_review">требует проверки</option>
                <option value="approved">одобрен</option>
                <option value="rejected">отклонён</option>
                <option value="merged">объединён</option>
                <option value="published">опубликован</option>
                <option value="archived">в архиве</option>
              </select>
            </AdminFilterField>
            <AdminFilterField label="Источник">
              <select className="mw-admin-input" value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={{ minWidth: 220 }}>
                <option value="">Все источники</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </AdminFilterField>
            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void loadList()}>
              Обновить
            </button>
          </AdminFiltersBar>

          <div className="mw-admin-split">
            <section>
              {items.length === 0 ? (
                <AdminEmptyState
                  title="Нет кандидатов"
                  description="По текущим фильтрам список пуст. Измените статус или источник либо дождитесь нового ingestion-run."
                />
              ) : (
                <div className="mw-admin-table-outer mw-admin-table-outer--always-scroll">
                  <table className="mw-admin-table">
                    <thead>
                      <tr>
                        <th>Кандидат</th>
                        <th>Источник</th>
                        <th>Оценки</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td style={{ minWidth: 260 }}>
                            <strong>{item.normalizedItem.title || "Без названия"}</strong>
                            <div className="mw-admin-muted" style={{ fontSize: "0.82rem", marginTop: 4 }}>
                              {item.normalizedItem.discipline || "—"} · {item.normalizedItem.region || item.normalizedItem.country || "—"} · {formatDate(item.normalizedItem.startDate)}
                            </div>
                            <div className="mw-admin-muted" style={{ fontSize: "0.82rem", marginTop: 4 }}>
                              {item.normalizedItem.organizerName || "—"}
                            </div>
                            <div style={{ marginTop: 8 }}>
                              <AdminStatusBadge tone={candidateStatusTone(item.status)}>{statusLabelRu(item.status)}</AdminStatusBadge>
                              {item.publishedProgram ? (
                                <span className="mw-admin-muted" style={{ marginLeft: 8, fontSize: "0.82rem" }}>
                                  · черновик: <a href="/programs">{item.publishedProgram.program.title}</a>
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td style={{ minWidth: 160 }}>
                            <strong>{item.normalizedItem.rawItem.source.name}</strong>
                            <div className="mw-admin-muted" style={{ fontSize: "0.82rem", marginTop: 4 }}>
                              {item.normalizedItem.rawItem.source.type} · доверие {item.normalizedItem.rawItem.source.trustScore.toFixed(2)}
                            </div>
                            {item.dedupGroup ? (
                              <div className="mw-admin-muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>
                                группа: {item.dedupGroup.mergeStatus}
                              </div>
                            ) : null}
                          </td>
                          <td className="mw-admin-muted" style={{ minWidth: 120, fontSize: "0.86rem", whiteSpace: "nowrap" }}>
                            итог {item.finalScore.toFixed(2)}
                            <br />
                            будущее {item.futureEventScore.toFixed(2)}
                            <br />
                            релевантность {item.fitScore.toFixed(2)}
                            <br />
                            доверие {item.trustScore.toFixed(2)}
                          </td>
                          <td>
                            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void openDetail(item.id)} style={{ fontSize: "0.82rem", padding: "6px 12px" }}>
                              Открыть
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <aside className="mw-admin-aside-panel">
          <h2 style={{ marginTop: 0 }}>Детали кандидата</h2>
          {!selected ? (
            <AdminEmptyState title="Ничего не выбрано" description="Выберите строку слева и нажмите «Открыть», чтобы увидеть полный контекст и действия." />
          ) : (
            <>
              <p><strong>{selected.normalizedItem.title || "Без названия"}</strong></p>
              <p style={{ fontSize: 13, color: "#666" }}>
                {selected.normalizedItem.eventType || "—"} · {selected.normalizedItem.discipline || "—"} · уверенность {selected.normalizedItem.confidenceScore.toFixed(2)}
              </p>
              <p>
                <strong>Локация:</strong> {selected.normalizedItem.country || "—"} / {selected.normalizedItem.region || "—"} / {selected.normalizedItem.city || "—"} / {selected.normalizedItem.venue || "—"}
              </p>
              <p>
                <strong>Даты:</strong> {formatDate(selected.normalizedItem.startDate)} → {formatDate(selected.normalizedItem.endDate)} · {selected.normalizedItem.durationDays ?? "—"} дней
              </p>
              <p>
                <strong>Уровень:</strong> {selected.normalizedItem.level || "—"} · <strong>Цена:</strong> {selected.normalizedItem.priceFrom ?? "—"} {selected.normalizedItem.currency || ""}
              </p>
              <p>
                <strong>Организатор:</strong> {selected.normalizedItem.organizerName || "—"}
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{selected.normalizedItem.descriptionShort || selected.normalizedItem.descriptionFull || "—"}</p>
              <p>
                <strong>Ссылка бронирования:</strong><br />
                {selected.normalizedItem.bookingUrl || "—"}
              </p>
              <p>
                <strong>Изображение:</strong><br />
                {selected.normalizedItem.imageUrl || "—"}
              </p>
              <p>
                <strong>Комментарий решения:</strong> {selected.decisionNotes || "—"}
                <br />
                <strong>Проверено:</strong> {formatDate(selected.reviewedAt)}
              </p>

              {selected.dedupGroup && (
                <>
                  <p><strong>Группа дедупликации</strong>: {selected.dedupGroup.groupKey}</p>
                  <ul>
                    {selected.dedupGroup.candidates.map((candidate) => (
                      <li key={candidate.id}>
                        {candidate.id} · {statusLabelRu(candidate.status)} · {candidate.finalScore.toFixed(2)} · {candidate.normalizedItem.title || "Без названия"} · {candidate.normalizedItem.rawItem.source.name}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {selected.publishedProgram && (
                <p>
                  <strong>Связанный черновик:</strong> {selected.publishedProgram.program.title} · {selected.publishedProgram.publishStatus}
                </p>
              )}

              <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                <button type="button" className="mw-admin-btn" onClick={() => void handleApprove()} disabled={busyAction !== ""}>
                  {busyAction === "approve" ? "Одобряем…" : "Одобрить"}
                </button>
                <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void handleReject()} disabled={busyAction !== ""}>
                  {busyAction === "reject" ? "Отклоняем…" : "Отклонить"}
                </button>
                <button
                  type="button"
                  className="mw-admin-btn mw-admin-btn--ghost"
                  onClick={() => void handleMerge()}
                  disabled={busyAction !== "" || !selected.dedupGroup}
                >
                  {busyAction === "merge" ? "Объединяем…" : "Объединить в канон"}
                </button>
                <button type="button" className="mw-admin-btn" onClick={() => void handlePublish()} disabled={busyAction !== ""}>
                  {busyAction === "publish" ? "Создаём…" : "Создать черновик"}
                </button>
              </div>
            </>
          )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
