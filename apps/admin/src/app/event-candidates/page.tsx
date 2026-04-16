"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminNav } from "../../components/AdminNav";
import { adminJson, getAdminToken } from "../../lib/admin";

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
    const notes = window.prompt("Комментарий к approve", "");
    await runAction("approve", `/event-candidates/${selected.id}/approve`, { notes });
  }

  async function handleReject() {
    if (!selected) return;
    const notes = window.prompt("Причина reject", "");
    await runAction("reject", `/event-candidates/${selected.id}/reject`, { notes });
  }

  async function handleMerge() {
    if (!selected?.dedupGroup) return;
    const options = selected.dedupGroup.candidates.filter((candidate) => candidate.id !== selected.id);
    const suggested = options[0]?.id ?? "";
    const canonicalCandidateId = window.prompt("ID канонического кандидата", suggested);
    if (!canonicalCandidateId) return;
    const notes = window.prompt("Комментарий к merge", "") ?? null;
    await runAction("merge", `/event-candidates/${selected.id}/merge`, { canonicalCandidateId, notes });
  }

  async function handlePublish() {
    if (!selected) return;
    const editorNotes = window.prompt("Editor notes для draft card", "");
    await runAction("publish", `/event-candidates/${selected.id}/publish`, { editorNotes });
  }

  if (loading) return <p>Загрузка…</p>;

  return (
    <main style={{ padding: 24 }}>
      <AdminNav current="/event-candidates" />
      <h1>Очередь кандидатов на публикацию</h1>
      <p style={{ fontSize: 14, color: "#555", maxWidth: 980 }}>
        Здесь живут нормализованные анонсы после scoring и dedup. Auto-publish отключён: оператор вручную принимает
        решение approve / reject / merge, а затем при необходимости создаёт draft-карточку программы.
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {message && <p style={{ color: "green" }}>{message}</p>}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8 }}>
          <option value="">Все статусы</option>
          <option value="new">new</option>
          <option value="needs_review">needs_review</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="merged">merged</option>
          <option value="published">published</option>
          <option value="archived">archived</option>
        </select>
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={{ padding: 8 }}>
          <option value="">Все источники</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void loadList()} style={{ padding: "8px 16px" }}>
          Обновить
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(360px, 1fr)", gap: 24 }}>
        <section>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Candidate</th>
                <th align="left">Источник</th>
                <th align="left">Scores</th>
                <th align="left">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}>
                  <td style={{ padding: "10px 8px", minWidth: 320 }}>
                    <strong>{item.normalizedItem.title || "Без title"}</strong>
                    <br />
                    <span style={{ fontSize: 13, color: "#666" }}>
                      {item.normalizedItem.discipline || "—"} · {item.normalizedItem.region || item.normalizedItem.country || "—"} · {formatDate(item.normalizedItem.startDate)}
                    </span>
                    <br />
                    <span style={{ fontSize: 13, color: "#666" }}>
                      organizer: {item.normalizedItem.organizerName || "—"}
                    </span>
                    <br />
                    <span style={{ fontSize: 13 }}>
                      status: <strong>{item.status}</strong>
                      {item.publishedProgram && <> · draft: <a href="/programs">{item.publishedProgram.program.title}</a></>}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px", minWidth: 180 }}>
                    <strong>{item.normalizedItem.rawItem.source.name}</strong>
                    <br />
                    <span style={{ fontSize: 13, color: "#666" }}>
                      {item.normalizedItem.rawItem.source.type} · trust {item.normalizedItem.rawItem.source.trustScore.toFixed(2)}
                    </span>
                    {item.dedupGroup && (
                      <>
                        <br />
                        <span style={{ fontSize: 12, color: "#666" }}>
                          group: {item.dedupGroup.mergeStatus}
                        </span>
                      </>
                    )}
                  </td>
                  <td style={{ padding: "10px 8px", minWidth: 160 }}>
                    final {item.finalScore.toFixed(2)}
                    <br />
                    future {item.futureEventScore.toFixed(2)}
                    <br />
                    fit {item.fitScore.toFixed(2)}
                    <br />
                    trust {item.trustScore.toFixed(2)}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <button type="button" onClick={() => void openDetail(item.id)} style={{ padding: "8px 12px" }}>
                      Открыть
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, alignSelf: "start", background: "#fafafa" }}>
          <h2>Детали кандидата</h2>
          {!selected ? (
            <p style={{ color: "#666" }}>Выберите кандидата слева.</p>
          ) : (
            <>
              <p><strong>{selected.normalizedItem.title || "Без title"}</strong></p>
              <p style={{ fontSize: 13, color: "#666" }}>
                {selected.normalizedItem.eventType || "—"} · {selected.normalizedItem.discipline || "—"} · confidence {selected.normalizedItem.confidenceScore.toFixed(2)}
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
                <strong>Booking URL:</strong><br />
                {selected.normalizedItem.bookingUrl || "—"}
              </p>
              <p>
                <strong>Изображение:</strong><br />
                {selected.normalizedItem.imageUrl || "—"}
              </p>
              <p>
                <strong>Decision notes:</strong> {selected.decisionNotes || "—"}
                <br />
                <strong>Reviewed at:</strong> {formatDate(selected.reviewedAt)}
              </p>

              {selected.dedupGroup && (
                <>
                  <p><strong>Dedup group</strong>: {selected.dedupGroup.groupKey}</p>
                  <ul>
                    {selected.dedupGroup.candidates.map((candidate) => (
                      <li key={candidate.id}>
                        {candidate.id} · {candidate.status} · {candidate.finalScore.toFixed(2)} · {candidate.normalizedItem.title || "Без title"} · {candidate.normalizedItem.rawItem.source.name}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {selected.publishedProgram && (
                <p>
                  <strong>Связанная draft card:</strong> {selected.publishedProgram.program.title} · {selected.publishedProgram.publishStatus}
                </p>
              )}

              <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
                <button type="button" onClick={() => void handleApprove()} disabled={busyAction !== ""} style={{ padding: "8px 12px" }}>
                  {busyAction === "approve" ? "Approve..." : "Approve"}
                </button>
                <button type="button" onClick={() => void handleReject()} disabled={busyAction !== ""} style={{ padding: "8px 12px" }}>
                  {busyAction === "reject" ? "Reject..." : "Reject"}
                </button>
                <button type="button" onClick={() => void handleMerge()} disabled={busyAction !== "" || !selected.dedupGroup} style={{ padding: "8px 12px" }}>
                  {busyAction === "merge" ? "Merge..." : "Merge в canonical"}
                </button>
                <button type="button" onClick={() => void handlePublish()} disabled={busyAction !== ""} style={{ padding: "8px 12px" }}>
                  {busyAction === "publish" ? "Publish..." : "Создать draft card"}
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
