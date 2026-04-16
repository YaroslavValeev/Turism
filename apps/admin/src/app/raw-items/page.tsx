"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminNav } from "../../components/AdminNav";
import { adminJson, getAdminToken } from "../../lib/admin";

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

  async function loadData() {
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
  }

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void loadData();
  }, [query]);

  async function openDetail(id: string) {
    try {
      const detail = await adminJson<RawItemDetail>(`/raw-items/${id}`);
      setSelected(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <p>Загрузка…</p>;

  return (
    <main style={{ padding: 24 }}>
      <AdminNav current="/raw-items" />
      <h1>Сырые данные ingestion</h1>
      <p style={{ fontSize: 14, color: "#555", maxWidth: 920 }}>
        Здесь сохраняется входящий материал как есть. Этот слой ничего не “понимает”, а только хранит публикацию,
        текст, медиа и payload для последующей нормализации и модерации.
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={{ padding: 8 }}>
          <option value="">Все источники</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
        <select value={hasNormalized} onChange={(e) => setHasNormalized(e.target.value)} style={{ padding: 8 }}>
          <option value="">Любой статус нормализации</option>
          <option value="1">Только с normalized_item</option>
          <option value="0">Только без normalized_item</option>
        </select>
        <button type="button" onClick={() => void loadData()} style={{ padding: "8px 16px" }}>
          Обновить
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(360px, 1fr)", gap: 24 }}>
        <section>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Источник</th>
                <th align="left">Материал</th>
                <th align="left">Нормализация</th>
                <th align="left">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}>
                  <td style={{ padding: "10px 8px", minWidth: 180 }}>
                    <strong>{item.source.name}</strong>
                    <br />
                    <span style={{ fontSize: 12, color: "#666" }}>{item.source.type}</span>
                    <br />
                    <span style={{ fontSize: 12, color: "#666" }}>{formatDate(item.publishedAt)}</span>
                  </td>
                  <td style={{ padding: "10px 8px", minWidth: 280 }}>
                    <div><strong>{item.rawTitle || "Без заголовка"}</strong></div>
                    <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>{shortText(item.rawText)}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      автор: {item.authorName || "—"} · fetched: {formatDate(item.fetchedAt)}
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px", minWidth: 220 }}>
                    {item.normalizedItem ? (
                      <>
                        <strong>{item.normalizedItem.title || "Без title"}</strong>
                        <br />
                        <span style={{ fontSize: 12, color: "#666" }}>
                          {item.normalizedItem.discipline || "—"} · start {formatDate(item.normalizedItem.startDate)}
                        </span>
                        <br />
                        <span style={{ fontSize: 12, color: "#666" }}>
                          confidence {item.normalizedItem.confidenceScore.toFixed(2)}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: "#666" }}>Ещё не нормализован</span>
                    )}
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
          <h2>Детали raw item</h2>
          {!selected ? (
            <p style={{ color: "#666" }}>Выберите материал слева.</p>
          ) : (
            <>
              <p><strong>{selected.rawTitle || "Без заголовка"}</strong></p>
              <p style={{ fontSize: 13, color: "#666" }}>
                {selected.source.name} · {selected.source.type} · {formatDate(selected.publishedAt)}
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{selected.rawText || "—"}</p>
              <p><strong>Source URL:</strong><br />{selected.sourceUrl || "—"}</p>
              <p><strong>Content hash:</strong><br />{selected.contentHash}</p>
              <p><strong>Raw media JSON</strong></p>
              <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 12 }}>
                {JSON.stringify(selected.rawMediaJson, null, 2)}
              </pre>
              <p><strong>Raw payload JSON</strong></p>
              <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 12 }}>
                {JSON.stringify(selected.rawPayloadJson, null, 2)}
              </pre>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
