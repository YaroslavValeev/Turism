"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../components/admin/AdminSectionCard";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";

type SourceOption = {
  id: string;
  name: string;
};

type RawItemListItem = {
  id: string;
  authorName: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  rawTitle: string | null;
  rawText: string | null;
  fetchedAt: string;
  source: {
    id: string;
    name: string;
    type: string;
    urlOrHandle: string;
  };
  normalizedItem: {
    id: string;
    title: string | null;
    discipline: string | null;
    startDate: string | null;
    confidenceScore: number;
  } | null;
};

type RawItemDetail = RawItemListItem & {
  rawMediaJson: unknown;
  rawPayloadJson: unknown;
  contentHash: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function shortText(value: string | null, max = 180) {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export default function RawItemsPage() {
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [items, setItems] = useState<RawItemListItem[]>([]);
  const [selected, setSelected] = useState<RawItemDetail | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [hasNormalized, setHasNormalized] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (sourceId) params.set("sourceId", sourceId);
    if (hasNormalized) params.set("hasNormalized", hasNormalized);
    const suffix = params.toString();
    return suffix ? `?${suffix}` : "";
  }, [hasNormalized, sourceId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sourcesData, itemsData] = await Promise.all([
        adminJson<SourceOption[]>("/sources"),
        adminJson<RawItemListItem[]>(`/raw-items${query}`),
      ]);
      setSources(sourcesData);
      setItems(itemsData);
      if (itemsData.length === 0) setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void loadData();
  }, [loadData]);

  async function openDetail(id: string) {
    try {
      const detail = await adminJson<RawItemDetail>(`/raw-items/${id}`);
      setSelected(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Сырые данные ingestion"
        description="Входящий материал как есть: публикация, текст, медиа и payload для нормализации и модерации."
      />

      {loading && <AdminLoadingState label="Загружаем список…" />}
      {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}

      {!loading && (
        <>
          <AdminFiltersBar title="Фильтры">
            <AdminFilterField label="Источник">
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Все источники</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </AdminFilterField>
            <AdminFilterField label="Нормализация">
              <select value={hasNormalized} onChange={(e) => setHasNormalized(e.target.value)}>
                <option value="">Любой статус</option>
                <option value="1">Только с normalized_item</option>
                <option value="0">Только без normalized_item</option>
              </select>
            </AdminFilterField>
            <div className="mw-admin-toolbar__actions" style={{ alignSelf: "flex-end", paddingTop: 0 }}>
              <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void loadData()}>
                Обновить
              </button>
            </div>
          </AdminFiltersBar>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: "clamp(16px, 2vw, 24px)",
              alignItems: "start",
            }}
          >
            <AdminSectionCard title="Материалы" style={{ marginBottom: 0 }}>
              {items.length === 0 ? (
                <AdminEmptyState
                  title="Нет записей"
                  description="По выбранным фильтрам raw items не найдены. Смените источник или статус нормализации."
                />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="mw-admin-table" style={{ margin: 0, minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th>Источник</th>
                        <th>Материал</th>
                        <th>Нормализация</th>
                        <th style={{ width: 120 }}>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td style={{ verticalAlign: "top" }}>
                            <strong>{item.source.name}</strong>
                            <div className="mw-admin-prose" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                              {item.source.type}
                            </div>
                            <div className="mw-admin-prose" style={{ fontSize: "0.85rem", marginTop: 2 }}>
                              {formatDate(item.publishedAt)}
                            </div>
                          </td>
                          <td style={{ verticalAlign: "top", minWidth: 220 }}>
                            <div>
                              <strong>{item.rawTitle || "Без заголовка"}</strong>
                            </div>
                            <div className="mw-admin-prose" style={{ marginTop: 6, fontSize: "0.9rem" }}>
                              {shortText(item.rawText)}
                            </div>
                            <div className="mw-admin-prose" style={{ fontSize: "0.8rem", marginTop: 6 }}>
                              автор: {item.authorName || "—"} · fetched: {formatDate(item.fetchedAt)}
                            </div>
                          </td>
                          <td style={{ verticalAlign: "top", minWidth: 200 }}>
                            {item.normalizedItem ? (
                              <>
                                <strong>{item.normalizedItem.title || "Без title"}</strong>
                                <div className="mw-admin-prose" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                                  {item.normalizedItem.discipline || "—"} · start {formatDate(item.normalizedItem.startDate)}
                                </div>
                                <div className="mw-admin-prose" style={{ fontSize: "0.85rem", marginTop: 2 }}>
                                  confidence {item.normalizedItem.confidenceScore.toFixed(2)}
                                </div>
                              </>
                            ) : (
                              <span className="mw-admin-prose">Ещё не нормализован</span>
                            )}
                          </td>
                          <td style={{ verticalAlign: "top" }}>
                            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void openDetail(item.id)}>
                              Открыть
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminSectionCard>

            <AdminSectionCard title="Детали raw item" style={{ marginBottom: 0 }}>
              {!selected ? (
                <p className="mw-admin-prose" style={{ margin: 0 }}>
                  Выберите строку слева и нажмите «Открыть».
                </p>
              ) : (
                <>
                  <p style={{ margin: "0 0 8px" }}>
                    <strong>{selected.rawTitle || "Без заголовка"}</strong>
                  </p>
                  <p className="mw-admin-prose" style={{ margin: "0 0 12px", fontSize: "0.9rem" }}>
                    {selected.source.name} · {selected.source.type} · {formatDate(selected.publishedAt)}
                  </p>
                  <p className="mw-admin-prose" style={{ whiteSpace: "pre-wrap", margin: "0 0 12px" }}>
                    {selected.rawText || "—"}
                  </p>
                  <p className="mw-admin-prose" style={{ margin: "0 0 6px", fontSize: "0.88rem" }}>
                    <strong>Source URL</strong>
                  </p>
                  <p className="mw-admin-prose" style={{ margin: "0 0 12px", wordBreak: "break-all" }}>
                    {selected.sourceUrl || "—"}
                  </p>
                  <p className="mw-admin-prose" style={{ margin: "0 0 6px", fontSize: "0.88rem" }}>
                    <strong>Content hash</strong>
                  </p>
                  <p className="mw-admin-code" style={{ margin: "0 0 16px", fontSize: "0.8rem", wordBreak: "break-all" }}>
                    {selected.contentHash}
                  </p>
                  <p className="mw-admin-prose" style={{ margin: "0 0 6px", fontWeight: 650 }}>
                    Raw media JSON
                  </p>
                  <pre
                    className="mw-admin-code"
                    style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 12, margin: "0 0 16px", maxHeight: 240, overflowY: "auto" }}
                  >
                    {JSON.stringify(selected.rawMediaJson, null, 2)}
                  </pre>
                  <p className="mw-admin-prose" style={{ margin: "0 0 6px", fontWeight: 650 }}>
                    Raw payload JSON
                  </p>
                  <pre
                    className="mw-admin-code"
                    style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 12, margin: 0, maxHeight: 280, overflowY: "auto" }}
                  >
                    {JSON.stringify(selected.rawPayloadJson, null, 2)}
                  </pre>
                </>
              )}
            </AdminSectionCard>
          </div>
        </>
      )}
    </main>
  );
}
