"use client";

import { useEffect, useState } from "react";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../components/admin/AdminSectionCard";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";

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
    contentDrafts?: number;
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

  if (loading) {
    return (
      <main className="mw-admin-page">
        <AdminPageHeader
          title="Задачи и загрузка данных"
          description="Счётчики витрины и последние source runs. Триггеры — вручную, для срезов v1 / контент-черновиков."
        />
        <AdminLoadingState label="Загружаем дашборд…" />
      </main>
    );
  }
  if (!dashboard) {
    return (
      <main className="mw-admin-page">
        <p className="mw-admin-prose">Нет данных. Проверьте токен и API.</p>
        {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}
      </main>
    );
  }

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Задачи и загрузка данных"
        description="Ручные запуски этапов: сбор, нормализация, дедупликация и черновики контента."
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="mw-admin-btn"
              onClick={() => void runJob("/jobs/run-daily-sync", "run-daily-sync")}
              disabled={busy !== ""}
            >
              {busy === "run-daily-sync" ? "…" : "Дневная синхронизация"}
            </button>
            <button
              type="button"
              className="mw-admin-btn"
              onClick={() => void runJob("/jobs/run-ingestion", "run-ingestion")}
              disabled={busy !== ""}
            >
              {busy === "run-ingestion" ? "…" : "Загрузка данных"}
            </button>
            <button
              type="button"
              className="mw-admin-btn"
              onClick={() => void runJob("/jobs/run-normalization", "run-normalization")}
              disabled={busy !== ""}
            >
              {busy === "run-normalization" ? "…" : "Нормализация"}
            </button>
            <button
              type="button"
              className="mw-admin-btn"
              onClick={() => void runJob("/jobs/run-dedup", "run-dedup")}
              disabled={busy !== ""}
            >
              {busy === "run-dedup" ? "…" : "Дедупликация"}
            </button>
            <button
              type="button"
              className="mw-admin-btn"
              onClick={() => void runJob("/jobs/run-content-drafts", "run-content-drafts")}
              disabled={busy !== ""}
            >
              {busy === "run-content-drafts" ? "…" : "Черновики контента"}
            </button>
            <button type="button" className="mw-admin-btn mw-admin-btn--ghost" onClick={() => void loadData()}>
              Обновить
            </button>
          </div>
        }
      />
      {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}
      {message && <div className="mw-admin-alert mw-admin-alert--success">{message}</div>}

      <AdminSectionCard title="Счётчики" style={{ marginBottom: 0 }}>
        <AdminStatGrid>
          <AdminStatCard label="Источники" value={dashboard.counters.sources} />
          <AdminStatCard label="Сырые записи" value={dashboard.counters.rawItems} />
          <AdminStatCard label="Нормализованные" value={dashboard.counters.normalizedItems} />
          <AdminStatCard label="Кандидаты" value={dashboard.counters.candidates} />
          <AdminStatCard label="Требуют проверки" value={dashboard.counters.needsReview} />
          <AdminStatCard label="Одобрены" value={dashboard.counters.approved} />
          <AdminStatCard label="Опубликованы" value={dashboard.counters.published} />
          <AdminStatCard
            label="Черновики контента"
            value={dashboard.counters.contentDrafts ?? "—"}
          />
        </AdminStatGrid>
      </AdminSectionCard>

      <AdminSectionCard title="Последние запуски по источникам">
        {dashboard.recentRuns.length === 0 ? (
          <AdminEmptyState
            title="Пока нет запусков"
            description="После запуска этапов здесь появятся последние прогоны по источникам."
          />
        ) : (
          <div className="mw-admin-table-outer mw-admin-table-outer--always-scroll">
            <table className="mw-admin-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Источник</th>
                  <th>Запуск</th>
                  <th>Результат</th>
                  <th>Ошибка</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <strong>{run.source.name}</strong>
                      <div className="mw-admin-prose" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                        {run.source.type}
                      </div>
                    </td>
                    <td>
                      {run.runType} · {run.status}
                      <div className="mw-admin-prose" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                        {formatDate(run.startedAt)} → {formatDate(run.finishedAt)}
                      </div>
                    </td>
                    <td>
                      найдено {run.itemsFound} · создано {run.itemsCreated}
                    </td>
                    <td style={{ color: run.errorMessage ? "#991b1b" : "var(--mw-muted2)" }}>
                      {run.errorMessage || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSectionCard>
    </main>
  );
}
