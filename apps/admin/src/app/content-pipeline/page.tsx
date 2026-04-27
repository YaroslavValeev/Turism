"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";

type ContentItemRow = {
  id: string;
  workflowStatus: string;
  programId: string | null;
  lastError: string | null;
  updatedAt: string;
  rawItem: { sourceUrl: string | null; rawTitle: string | null; sourceType: string } | null;
  drafts: { id: string; status: string; draftType: string; version: number }[];
};

type PerfRow = {
  contentItemId: string;
  workflowStatus?: string;
  views: number;
  clicks: number;
  leads: number;
  revenueRub: number;
  bookingCount?: number;
};

function wfTone(s: string): "ok" | "warn" | "danger" | "muted" {
  if (s === "published") return "ok";
  if (s === "failed" || s === "rejected") return "danger";
  if (s === "pending_owner_review" || s === "approved") return "warn";
  return "muted";
}

function pubStateLabel(state: string): string {
  if (state === "publishing") return "публикуется (в процессе)";
  return state;
}

export default function ContentPipelineAdminPage() {
  const [tab, setTab] = useState<"items" | "publications" | "metrics">("items");
  const [statusFilter, setStatusFilter] = useState("");
  const [minRevenue, setMinRevenue] = useState("");
  const [minLeads, setMinLeads] = useState("");
  const [pubStateFilter, setPubStateFilter] = useState("");
  const [items, setItems] = useState<ContentItemRow[]>([]);
  const [pubs, setPubs] = useState<
    { id: string; channel: string; state: string; retryCount: number; errorDetail: string | null; contentDraftId: string }[]
  >([]);
  const [perf, setPerf] = useState<PerfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedDrafts, setSelectedDrafts] = useState<Set<string>>(() => new Set());

  const perfByItem = useMemo(() => {
    const m = new Map<string, PerfRow>();
    for (const p of perf) m.set(p.contentItemId, p);
    return m;
  }, [perf]);

  const loadItems = useCallback(async () => {
    if (!getAdminToken()) return;
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (minRevenue.trim() !== "") {
      const n = parseInt(minRevenue, 10);
      if (!Number.isNaN(n) && n > 0) params.set("minRevenue", String(n));
    }
    if (minLeads.trim() !== "") {
      const n = parseInt(minLeads, 10);
      if (!Number.isNaN(n) && n > 0) params.set("minLeads", String(n));
    }
    const q = params.toString() ? `?${params.toString()}` : "";
    const data = await adminJson<ContentItemRow[]>(`/api/content-pipeline/items${q}`);
    setItems(Array.isArray(data) ? data : []);
  }, [statusFilter, minRevenue, minLeads]);

  const loadPubs = useCallback(async () => {
    const u = pubStateFilter ? `?state=${encodeURIComponent(pubStateFilter)}` : "";
    const data = await adminJson<
      { id: string; channel: string; state: string; retryCount: number; errorDetail: string | null; contentDraftId: string }[]
    >(`/api/content-pipeline/publications${u}`);
    setPubs(Array.isArray(data) ? data : []);
  }, [pubStateFilter]);

  const loadPerf = useCallback(async () => {
    const res = await adminJson<{ items: PerfRow[] }>("/metrics/content-performance?limit=80");
    setPerf(Array.isArray(res.items) ? res.items : []);
  }, []);

  const loadAll = useCallback(async () => {
    if (!getAdminToken()) return;
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadItems(), loadPubs(), loadPerf()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [loadItems, loadPubs, loadPerf]);

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void loadAll();
  }, [loadAll, statusFilter, pubStateFilter]);

  async function runJob(path: string, label: string, body: unknown = {}) {
    setBusy(label);
    setMessage("");
    setError("");
    try {
      await adminJson(path, { method: "POST", body: JSON.stringify(body) });
      setMessage(`Готово: ${label}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  function toggleDraft(draftId: string) {
    setSelectedDrafts((prev) => {
      const n = new Set(prev);
      if (n.has(draftId)) n.delete(draftId);
      else n.add(draftId);
      return n;
    });
  }

  async function bulkApprove() {
    const draftIds = Array.from(selectedDrafts);
    if (!draftIds.length) {
      setError("Отметьте черновики в строках с pending owner review");
      return;
    }
    setBusy("bulk-approve");
    setError("");
    setMessage("");
    try {
      const res = await adminJson<{ results: { draftId: string; ok: boolean; error?: string }[] }>(
        "/api/content-pipeline/drafts/bulk-decision",
        { method: "POST", body: JSON.stringify({ draftIds, decision: "approved" }) },
      );
      const failed = res.results?.filter((r) => !r.ok) ?? [];
      if (failed.length) {
        setError(`Не применено: ${failed.map((f) => f.draftId).join(", ")}`);
      } else {
        setMessage(`Одобрено черновиков: ${draftIds.length}`);
        setSelectedDrafts(new Set());
      }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function retryPublication(id: string) {
    setBusy(`retry-${id}`);
    setError("");
    setMessage("");
    try {
      await adminJson(`/api/content-pipeline/publications/${id}/retry`, { method: "POST", body: JSON.stringify({}) });
      setMessage("Retry отправлен");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (loading && !items.length && !pubs.length) {
    return (
      <main className="mw-admin-page">
        <AdminLoadingState label="Контент-конвейер…" />
      </main>
    );
  }

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Контент-конвейер"
        description="Сбор → нормализация → черновики → согласование → публикация."
      />
      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}
      {message ? <AdminMessage type="success">{message}</AdminMessage> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {(["items", "publications", "metrics"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={t === tab ? "mw-btn mw-btn--primary" : "mw-btn"}
            onClick={() => setTab(t)}
          >
            {t === "items" ? "Материалы" : t === "publications" ? "Публикации" : "Метрики + ₽"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button
          type="button"
          className="mw-btn mw-btn--primary"
          disabled={busy !== ""}
          onClick={() => void runJob("/api/jobs/run-content-pipeline", "run-content-pipeline")}
        >
          {busy === "run-content-pipeline" ? "…" : "Запустить конвейер"}
        </button>
        <button
          type="button"
          className="mw-btn"
          disabled={busy !== ""}
          onClick={() => void runJob("/api/jobs/run-content-drafts", "run-content-drafts")}
        >
          {busy === "run-content-drafts" ? "…" : "Только черновики"}
        </button>
        {tab === "publications" ? (
          <button
            type="button"
            className="mw-btn"
            disabled={busy !== ""}
            onClick={() => void runJob("/api/content-pipeline/publications/retry-failed", "retry-failed", { limit: 20 })}
          >
            {busy === "retry-failed" ? "…" : "Повторить все ошибки (до 20)"}
          </button>
        ) : null}
        {tab === "items" && selectedDrafts.size > 0 ? (
          <button type="button" className="mw-btn mw-btn--primary" disabled={busy !== ""} onClick={() => void bulkApprove()}>
            {busy === "bulk-approve" ? "…" : `Одобрить выбранные (${selectedDrafts.size})`}
          </button>
        ) : null}
        <button type="button" className="mw-btn" onClick={() => void loadAll()}>
          Обновить
        </button>
      </div>

      {tab === "items" && (
        <>
          <AdminFiltersBar>
            <AdminFilterField label="Статус конвейера">
              <select
                className="mw-admin-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ minWidth: 200 }}
              >
                <option value="">Все</option>
                <option value="ingest_collected">ingest_collected</option>
                <option value="draft">draft</option>
                <option value="pending_owner_review">pending_owner_review</option>
                <option value="approved">approved</option>
                <option value="published">published</option>
                <option value="failed">failed</option>
              </select>
            </AdminFilterField>
            <AdminFilterField label="min ₽ (по content_metrics)">
              <input
                className="mw-admin-input"
                style={{ width: 100 }}
                value={minRevenue}
                onChange={(e) => setMinRevenue(e.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </AdminFilterField>
            <AdminFilterField label="мин. лидов">
              <input
                className="mw-admin-input"
                style={{ width: 100 }}
                value={minLeads}
                onChange={(e) => setMinLeads(e.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </AdminFilterField>
          </AdminFiltersBar>
          {items.length === 0 ? (
            <AdminEmptyState title="Нет материалов" description="Запустите конвейер или измените фильтр." />
          ) : (
            <div className="mw-admin-table-outer mw-admin-table-outer--always-scroll">
              <table className="mw-admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>✓</th>
                    <th>Статус</th>
                    <th>Заголовок</th>
                    <th>₽ / лиды</th>
                    <th>Ошибка</th>
                    <th>Черновики</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => {
                    const p = perfByItem.get(c.id);
                    const d0 = c.drafts?.[0];
                    const canSelect =
                      c.workflowStatus === "pending_owner_review" && d0 && ["ready", "pending_owner_review"].includes(d0.status);
                    return (
                      <tr key={c.id}>
                        <td>
                          {canSelect && d0 ? (
                            <input
                              type="checkbox"
                              checked={selectedDrafts.has(d0.id)}
                              onChange={() => toggleDraft(d0.id)}
                              title={d0.id}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <AdminStatusBadge tone={wfTone(c.workflowStatus)}>{c.workflowStatus}</AdminStatusBadge>
                        </td>
                        <td>{c.rawItem?.rawTitle || c.id}</td>
                        <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                          {p ? `₽${p.revenueRub} / ${p.leads}L` : "—"}
                        </td>
                        <td style={{ color: c.lastError ? "#a00" : undefined, maxWidth: 240, fontSize: 12 }}>
                          {c.lastError || "—"}
                        </td>
                        <td style={{ fontSize: 12 }}>{c.drafts?.map((d) => d.draftType).join(", ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "publications" && (
        <>
          <AdminFiltersBar>
            <AdminFilterField label="Состояние">
              <select
                className="mw-admin-input"
                value={pubStateFilter}
                onChange={(e) => setPubStateFilter(e.target.value)}
                style={{ minWidth: 160 }}
              >
                <option value="">Все</option>
                <option value="pending">pending</option>
                <option value="publishing">publishing</option>
                <option value="published">published</option>
                <option value="failed">failed</option>
              </select>
            </AdminFilterField>
          </AdminFiltersBar>
          {pubs.length === 0 ? (
            <AdminEmptyState title="Нет публикаций" />
          ) : (
            <div className="mw-admin-table-outer mw-admin-table-outer--always-scroll">
              <table className="mw-admin-table">
                <thead>
                  <tr>
                    <th>Канал</th>
                    <th>Состояние</th>
                    <th>Повторы</th>
                    <th>Ошибка</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {pubs.map((p) => (
                    <tr key={p.id}>
                      <td>{p.channel}</td>
                      <td>{pubStateLabel(p.state)}</td>
                      <td>{p.retryCount}</td>
                      <td style={{ fontSize: 12, maxWidth: 280 }}>{p.errorDetail || "—"}</td>
                      <td>
                        {p.state === "failed" ? (
                          <button
                            type="button"
                            className="mw-btn"
                            style={{ fontSize: 12, padding: "4px 8px" }}
                            disabled={busy !== ""}
                            onClick={() => void retryPublication(p.id)}
                          >
                            Повторить
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "metrics" && (
        <>
          {perf.length === 0 ? (
            <AdminEmptyState title="Нет агрегатов" description="После броней с contentItemId появятся цифры." />
          ) : (
            <div className="mw-admin-table-outer mw-admin-table-outer--always-scroll">
              <table className="mw-admin-table">
                <thead>
                  <tr>
                    <th>Материал</th>
                    <th>Статус</th>
                    <th>Просмотры</th>
                    <th>Клики</th>
                    <th>Лиды</th>
                    <th>Брони (агр.)</th>
                    <th>Выручка ₽</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.map((r) => (
                    <tr key={r.contentItemId}>
                      <td style={{ fontSize: 12 }}>{r.contentItemId}</td>
                      <td>{r.workflowStatus}</td>
                      <td>{r.views}</td>
                      <td>{r.clicks}</td>
                      <td>{r.leads}</td>
                      <td>{r.bookingCount ?? 0}</td>
                      <td>{r.revenueRub}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
