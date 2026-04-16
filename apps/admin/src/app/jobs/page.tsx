"use client";

import { useEffect, useState } from "react";
import { AdminNav } from "../../components/AdminNav";
import { adminJson, getAdminToken } from "../../lib/admin";

type Dashboard = {
  jobs: Array<{ key: string; label: string; description: string }>;
  counters: {
    sources: number;
    rawItems: number;
    normalizedItems: number;
    candidates: number;
    needsReview: number;
    approved: number;
    published: number;
  };
  recentRuns: Array<{
    id: string;
    status: string;
    runType: string;
    startedAt: string;
    finishedAt: string | null;
    itemsFound: number;
    itemsCreated: number;
    errorMessage: string | null;
    source: {
      id: string;
      name: string;
      type: string;
    };
  }>;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

export default function JobsPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const data = await adminJson<Dashboard>("/jobs");
      setDashboard(data);
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

  async function runJob(path: string, label: string) {
    setBusy(label);
    setMessage("");
    setError("");
    try {
      await adminJson(path, { method: "POST", body: JSON.stringify({}) });
      setMessage(`Запуск завершён: ${label}`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (loading) return <p>Загрузка…</p>;
  if (!dashboard) return <p>Нет данных</p>;

  return (
    <main style={{ padding: 24 }}>
      <AdminNav current="/jobs" />
      <h1>Jobs и ingestion dashboard</h1>
      <p style={{ fontSize: 14, color: "#555", maxWidth: 900 }}>
        Ручные триггеры для вертикального среза ingestion v1. Здесь запускаются collect, normalize и dedup, а также
        видно текущее состояние очереди модерации.
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {message && <p style={{ color: "green" }}>{message}</p>}

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <button type="button" onClick={() => void runJob("/jobs/run-daily-sync", "run-daily-sync")} disabled={busy !== ""} style={{ padding: "8px 16px" }}>
          {busy === "run-daily-sync" ? "Выполняется..." : "Run daily sync"}
        </button>
        <button type="button" onClick={() => void runJob("/jobs/run-ingestion", "run-ingestion")} disabled={busy !== ""} style={{ padding: "8px 16px" }}>
          {busy === "run-ingestion" ? "Выполняется..." : "Run ingestion"}
        </button>
        <button type="button" onClick={() => void runJob("/jobs/run-normalization", "run-normalization")} disabled={busy !== ""} style={{ padding: "8px 16px" }}>
          {busy === "run-normalization" ? "Выполняется..." : "Run normalization"}
        </button>
        <button type="button" onClick={() => void runJob("/jobs/run-dedup", "run-dedup")} disabled={busy !== ""} style={{ padding: "8px 16px" }}>
          {busy === "run-dedup" ? "Выполняется..." : "Run dedup"}
        </button>
        <button type="button" onClick={() => void loadData()} style={{ padding: "8px 16px" }}>
          Обновить
        </button>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <strong>Источники</strong>
          <div style={{ fontSize: 28 }}>{dashboard.counters.sources}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <strong>Raw items</strong>
          <div style={{ fontSize: 28 }}>{dashboard.counters.rawItems}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <strong>Normalized</strong>
          <div style={{ fontSize: 28 }}>{dashboard.counters.normalizedItems}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <strong>Candidates</strong>
          <div style={{ fontSize: 28 }}>{dashboard.counters.candidates}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <strong>Needs review</strong>
          <div style={{ fontSize: 28 }}>{dashboard.counters.needsReview}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <strong>Approved</strong>
          <div style={{ fontSize: 28 }}>{dashboard.counters.approved}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <strong>Published</strong>
          <div style={{ fontSize: 28 }}>{dashboard.counters.published}</div>
        </div>
      </section>

      <h2>Последние source runs</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Источник</th>
            <th align="left">Run</th>
            <th align="left">Результат</th>
            <th align="left">Ошибка</th>
          </tr>
        </thead>
        <tbody>
          {dashboard.recentRuns.map((run) => (
            <tr key={run.id} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ padding: "10px 8px" }}>
                <strong>{run.source.name}</strong>
                <br />
                <span style={{ fontSize: 12, color: "#666" }}>{run.source.type}</span>
              </td>
              <td style={{ padding: "10px 8px" }}>
                {run.runType} · {run.status}
                <br />
                <span style={{ fontSize: 12, color: "#666" }}>
                  {formatDate(run.startedAt)} → {formatDate(run.finishedAt)}
                </span>
              </td>
              <td style={{ padding: "10px 8px" }}>
                found {run.itemsFound}
                <br />
                created {run.itemsCreated}
              </td>
              <td style={{ padding: "10px 8px", color: run.errorMessage ? "red" : "#666" }}>
                {run.errorMessage || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
