"use client";

import { useEffect, useState } from "react";
import { AdminNav } from "../../components/AdminNav";
import { adminJson, getAdminToken } from "../../lib/admin";

type OrganizerOption = {
  id: string;
  displayName: string;
};

type SourceRun = {
  id: string;
  status: string;
  runType: string;
  startedAt: string;
  finishedAt: string | null;
  itemsFound: number;
  itemsCreated: number;
  errorMessage: string | null;
};

type SourceRecord = {
  id: string;
  type: string;
  name: string;
  urlOrHandle: string;
  discipline: string | null;
  country: string | null;
  region: string | null;
  language: string | null;
  priority: number;
  trustScore: number;
  parserProfile: string | null;
  fetchIntervalMinutes: number;
  isActive: boolean;
  organizerId: string | null;
  metaJson?: {
    autoPublish?: boolean;
    fallbackImageUrl?: string;
  } | null;
  organizer: OrganizerOption | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  runs: SourceRun[];
  _count: { rawItems: number };
};

type SourceDraft = {
  type: string;
  name: string;
  urlOrHandle: string;
  discipline: string;
  country: string;
  region: string;
  language: string;
  priority: string;
  trustScore: string;
  parserProfile: string;
  fetchIntervalMinutes: string;
  organizerId: string;
  isActive: boolean;
  autoPublish: boolean;
  fallbackImageUrl: string;
};

const EMPTY_DRAFT: SourceDraft = {
  type: "rss",
  name: "",
  urlOrHandle: "",
  discipline: "",
  country: "",
  region: "",
  language: "ru",
  priority: "100",
  trustScore: "0.5",
  parserProfile: "",
  fetchIntervalMinutes: "1440",
  organizerId: "",
  isActive: true,
  autoPublish: false,
  fallbackImageUrl: "",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function toDraft(source: SourceRecord): SourceDraft {
  return {
    type: source.type,
    name: source.name,
    urlOrHandle: source.urlOrHandle,
    discipline: source.discipline ?? "",
    country: source.country ?? "",
    region: source.region ?? "",
    language: source.language ?? "",
    priority: String(source.priority),
    trustScore: String(source.trustScore),
    parserProfile: source.parserProfile ?? "",
    fetchIntervalMinutes: String(source.fetchIntervalMinutes),
    organizerId: source.organizerId ?? "",
    isActive: source.isActive,
    autoPublish: Boolean(source.metaJson?.autoPublish),
    fallbackImageUrl: source.metaJson?.fallbackImageUrl ?? "",
  };
}

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [organizers, setOrganizers] = useState<OrganizerOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, SourceDraft>>({});
  const [createDraft, setCreateDraft] = useState<SourceDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string>("");
  const [runningId, setRunningId] = useState<string>("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [sourcesData, organizersData] = await Promise.all([
        adminJson<SourceRecord[]>("/sources"),
        adminJson<OrganizerOption[]>("/organizers"),
      ]);
      setSources(sourcesData);
      setOrganizers(organizersData);
      setDrafts(Object.fromEntries(sourcesData.map((source) => [source.id, toDraft(source)])));
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
  }, []);

  async function handleCreate() {
    setMessage("");
    setError("");
    setSavingId("create");
    try {
      await adminJson<SourceRecord>("/sources", {
        method: "POST",
        body: JSON.stringify({
          ...createDraft,
          priority: Number(createDraft.priority),
          trustScore: Number(createDraft.trustScore),
          fetchIntervalMinutes: Number(createDraft.fetchIntervalMinutes),
          organizerId: createDraft.organizerId || null,
          metaJson: {
            autoPublish: createDraft.autoPublish,
            fallbackImageUrl: createDraft.fallbackImageUrl || null,
          },
        }),
      });
      setCreateDraft(EMPTY_DRAFT);
      setMessage("Источник создан");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId("");
    }
  }

  async function handleSave(sourceId: string) {
    const draft = drafts[sourceId];
    if (!draft) return;
    setMessage("");
    setError("");
    setSavingId(sourceId);
    try {
      await adminJson<SourceRecord>(`/sources/${sourceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...draft,
          priority: Number(draft.priority),
          trustScore: Number(draft.trustScore),
          fetchIntervalMinutes: Number(draft.fetchIntervalMinutes),
          organizerId: draft.organizerId || null,
          metaJson: {
            autoPublish: draft.autoPublish,
            fallbackImageUrl: draft.fallbackImageUrl || null,
          },
        }),
      });
      setMessage("Источник обновлён");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId("");
    }
  }

  async function handleRun(sourceId: string) {
    setMessage("");
    setError("");
    setRunningId(sourceId);
    try {
      await adminJson(`/sources/${sourceId}/run`, { method: "POST" });
      setMessage("Источник прогнан: collect → normalize → dedup");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunningId("");
    }
  }

  function updateDraft(sourceId: string, patch: Partial<SourceDraft>) {
    setDrafts((current) => ({
      ...current,
      [sourceId]: { ...current[sourceId], ...patch },
    }));
  }

  if (loading) return <p>Загрузка…</p>;

  return (
    <main style={{ padding: 24 }}>
      <AdminNav current="/sources" />
      <h1>Реестр источников ingestion</h1>
      <p style={{ fontSize: 14, color: "#555", maxWidth: 960 }}>
        Здесь задаются источники discovery-слоя. Публикация в каталог автоматически не происходит: каждый найденный
        анонс всё равно должен пройти очередь модерации и стать draft-карточкой только после approve.
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {message && <p style={{ color: "green" }}>{message}</p>}

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <h2>Добавить источник</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
            gap: 12,
            alignItems: "center",
          }}
        >
          <select value={createDraft.type} onChange={(e) => setCreateDraft((v) => ({ ...v, type: e.target.value }))} style={{ padding: 8 }}>
            <option value="rss">RSS</option>
            <option value="telegram">Telegram</option>
            <option value="instagram">Instagram</option>
            <option value="site">Site</option>
          </select>
          <input placeholder="Название" value={createDraft.name} onChange={(e) => setCreateDraft((v) => ({ ...v, name: e.target.value }))} style={{ padding: 8 }} />
          <input
            placeholder="URL / handle"
            value={createDraft.urlOrHandle}
            onChange={(e) => setCreateDraft((v) => ({ ...v, urlOrHandle: e.target.value }))}
            style={{ padding: 8 }}
          />
          <select value={createDraft.organizerId} onChange={(e) => setCreateDraft((v) => ({ ...v, organizerId: e.target.value }))} style={{ padding: 8 }}>
            <option value="">Без привязки к организатору</option>
            {organizers.map((organizer) => (
              <option key={organizer.id} value={organizer.id}>
                {organizer.displayName}
              </option>
            ))}
          </select>
          <input placeholder="Дисциплина" value={createDraft.discipline} onChange={(e) => setCreateDraft((v) => ({ ...v, discipline: e.target.value }))} style={{ padding: 8 }} />
          <input placeholder="Страна" value={createDraft.country} onChange={(e) => setCreateDraft((v) => ({ ...v, country: e.target.value }))} style={{ padding: 8 }} />
          <input placeholder="Регион" value={createDraft.region} onChange={(e) => setCreateDraft((v) => ({ ...v, region: e.target.value }))} style={{ padding: 8 }} />
          <input placeholder="Язык" value={createDraft.language} onChange={(e) => setCreateDraft((v) => ({ ...v, language: e.target.value }))} style={{ padding: 8 }} />
          <input placeholder="Priority" value={createDraft.priority} onChange={(e) => setCreateDraft((v) => ({ ...v, priority: e.target.value }))} style={{ padding: 8 }} />
          <input placeholder="Trust score" value={createDraft.trustScore} onChange={(e) => setCreateDraft((v) => ({ ...v, trustScore: e.target.value }))} style={{ padding: 8 }} />
          <input
            placeholder="Parser profile"
            value={createDraft.parserProfile}
            onChange={(e) => setCreateDraft((v) => ({ ...v, parserProfile: e.target.value }))}
            style={{ padding: 8 }}
          />
          <input
            placeholder="Fetch interval, min"
            value={createDraft.fetchIntervalMinutes}
            onChange={(e) => setCreateDraft((v) => ({ ...v, fetchIntervalMinutes: e.target.value }))}
            style={{ padding: 8 }}
          />
          <input
            placeholder="Fallback image URL"
            value={createDraft.fallbackImageUrl}
            onChange={(e) => setCreateDraft((v) => ({ ...v, fallbackImageUrl: e.target.value }))}
            style={{ padding: 8, gridColumn: "span 2" }}
          />
        </div>
        <label style={{ display: "block", marginTop: 12 }}>
          <input
            type="checkbox"
            checked={createDraft.isActive}
            onChange={(e) => setCreateDraft((v) => ({ ...v, isActive: e.target.checked }))}
            style={{ marginRight: 8 }}
          />
          Источник активен
        </label>
        <label style={{ display: "block", marginTop: 8 }}>
          <input
            type="checkbox"
            checked={createDraft.autoPublish}
            onChange={(e) => setCreateDraft((v) => ({ ...v, autoPublish: e.target.checked }))}
            style={{ marginRight: 8 }}
          />
          Автопубликация для доверенного источника
        </label>
        <button type="button" onClick={() => void handleCreate()} disabled={savingId === "create"} style={{ marginTop: 12, padding: "8px 16px" }}>
          {savingId === "create" ? "Создаём..." : "Создать источник"}
        </button>
      </section>

      <h2>Активные источники</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Источник</th>
            <th align="left">Параметры</th>
            <th align="left">Организатор</th>
            <th align="left">Состояние</th>
            <th align="left">Последние запуски</th>
            <th align="left">Действия</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => {
            const draft = drafts[source.id];
            return (
              <tr key={source.id} style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}>
                <td style={{ padding: "12px 8px", minWidth: 260 }}>
                  <div><strong>{source.name}</strong></div>
                  <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{source.urlOrHandle}</div>
                  <div style={{ marginTop: 8 }}>
                    <select value={draft?.type ?? source.type} onChange={(e) => updateDraft(source.id, { type: e.target.value })} style={{ padding: 6, width: "100%" }}>
                      <option value="rss">RSS</option>
                      <option value="telegram">Telegram</option>
                      <option value="instagram">Instagram</option>
                      <option value="site">Site</option>
                    </select>
                  </div>
                  <input value={draft?.name ?? source.name} onChange={(e) => updateDraft(source.id, { name: e.target.value })} style={{ padding: 6, width: "100%", marginTop: 8 }} />
                  <input
                    value={draft?.urlOrHandle ?? source.urlOrHandle}
                    onChange={(e) => updateDraft(source.id, { urlOrHandle: e.target.value })}
                    style={{ padding: 6, width: "100%", marginTop: 8 }}
                  />
                </td>
                <td style={{ padding: "12px 8px", minWidth: 280 }}>
                  <input placeholder="Дисциплина" value={draft?.discipline ?? ""} onChange={(e) => updateDraft(source.id, { discipline: e.target.value })} style={{ padding: 6, width: "100%", marginBottom: 8 }} />
                  <input placeholder="Страна" value={draft?.country ?? ""} onChange={(e) => updateDraft(source.id, { country: e.target.value })} style={{ padding: 6, width: "100%", marginBottom: 8 }} />
                  <input placeholder="Регион" value={draft?.region ?? ""} onChange={(e) => updateDraft(source.id, { region: e.target.value })} style={{ padding: 6, width: "100%", marginBottom: 8 }} />
                  <input placeholder="Язык" value={draft?.language ?? ""} onChange={(e) => updateDraft(source.id, { language: e.target.value })} style={{ padding: 6, width: "100%", marginBottom: 8 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input placeholder="Priority" value={draft?.priority ?? ""} onChange={(e) => updateDraft(source.id, { priority: e.target.value })} style={{ padding: 6 }} />
                    <input placeholder="Trust" value={draft?.trustScore ?? ""} onChange={(e) => updateDraft(source.id, { trustScore: e.target.value })} style={{ padding: 6 }} />
                    <input
                      placeholder="Parser profile"
                      value={draft?.parserProfile ?? ""}
                      onChange={(e) => updateDraft(source.id, { parserProfile: e.target.value })}
                      style={{ padding: 6 }}
                    />
                    <input
                      placeholder="Интервал, мин"
                      value={draft?.fetchIntervalMinutes ?? ""}
                      onChange={(e) => updateDraft(source.id, { fetchIntervalMinutes: e.target.value })}
                      style={{ padding: 6 }}
                    />
                  </div>
                  <input
                    placeholder="Fallback image URL"
                    value={draft?.fallbackImageUrl ?? ""}
                    onChange={(e) => updateDraft(source.id, { fallbackImageUrl: e.target.value })}
                    style={{ padding: 6, width: "100%", marginTop: 8 }}
                  />
                </td>
                <td style={{ padding: "12px 8px", minWidth: 220 }}>
                  <select value={draft?.organizerId ?? ""} onChange={(e) => updateDraft(source.id, { organizerId: e.target.value })} style={{ padding: 6, width: "100%", marginBottom: 8 }}>
                    <option value="">Без привязки</option>
                    {organizers.map((organizer) => (
                      <option key={organizer.id} value={organizer.id}>
                        {organizer.displayName}
                      </option>
                    ))}
                  </select>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft?.isActive ?? source.isActive}
                      onChange={(e) => updateDraft(source.id, { isActive: e.target.checked })}
                      style={{ marginRight: 8 }}
                    />
                    Активен
                  </label>
                  <br />
                  <label>
                    <input
                      type="checkbox"
                      checked={draft?.autoPublish ?? false}
                      onChange={(e) => updateDraft(source.id, { autoPublish: e.target.checked })}
                      style={{ marginRight: 8, marginTop: 8 }}
                    />
                    Автопубликация
                  </label>
                  <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
                    raw items: {source._count.rawItems}
                    <br />
                    last checked: {formatDate(source.lastCheckedAt)}
                    <br />
                    last success: {formatDate(source.lastSuccessAt)}
                  </div>
                </td>
                <td style={{ padding: "12px 8px", minWidth: 260 }}>
                  {source.runs.length === 0 ? (
                    <span style={{ color: "#666" }}>Запусков ещё не было</span>
                  ) : (
                    source.runs.map((run) => (
                      <div key={run.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px dashed #ddd" }}>
                        <strong>{run.runType}</strong> · {run.status}
                        <br />
                        <span style={{ fontSize: 13, color: "#666" }}>
                          {formatDate(run.startedAt)} → {formatDate(run.finishedAt)}
                        </span>
                        <br />
                        <span style={{ fontSize: 13 }}>
                          found {run.itemsFound} / created {run.itemsCreated}
                        </span>
                        {run.errorMessage && <div style={{ color: "red", fontSize: 13 }}>{run.errorMessage}</div>}
                      </div>
                    ))
                  )}
                </td>
                <td style={{ padding: "12px 8px", minWidth: 180 }}>
                  <button type="button" onClick={() => void handleSave(source.id)} disabled={savingId === source.id} style={{ padding: "8px 12px", marginBottom: 8, width: "100%" }}>
                    {savingId === source.id ? "Сохраняем..." : "Сохранить"}
                  </button>
                  <button type="button" onClick={() => void handleRun(source.id)} disabled={runningId === source.id} style={{ padding: "8px 12px", width: "100%" }}>
                    {runningId === source.id ? "Запускаем..." : "Прогнать источник"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
