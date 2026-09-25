"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../components/admin/AdminSectionCard";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";

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
    runningSourceRuns?: number;
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

const JOB_LABELS: Record<string, string> = {
  "run-daily-sync": "Дневная синхронизация",
  "run-ingestion": "Загрузка данных (сбор)",
  "run-normalization": "Нормализация",
  "run-dedup": "Дедупликация",
  "run-content-drafts": "Черновики контента",
  "archive-past": "В архив (прошедшие даты)",
};

const PAGE_SIZE = 10;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function runTone(status: string): "ok" | "warn" | "danger" | "muted" {
  if (status === "success") return "ok";
  if (status === "running") return "warn";
  if (status === "failed") return "danger";
  return "muted";
}

export default function JobsPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [busyStartedAt, setBusyStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [runsPage, setRunsPage] = useState(0);

  async function loadData(opts?: { soft?: boolean }) {
    const soft = opts?.soft === true && dashboard != null;
    if (!soft) setLoading(true);
    if (!soft) setError("");
    try {
      const data = await adminJson<Dashboard>("/jobs");
      setDashboard(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!soft) setLoading(false);
    }
  }

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    void loadData();
  }, []);

  // Таймер «сколько идёт задача»
  useEffect(() => {
    if (!busy || busyStartedAt == null) {
      setElapsedSec(0);
      return;
    }
    const tick = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - busyStartedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [busy, busyStartedAt]);

  // Пока задача в браузере «busy» — мягко обновляем дашборд (видны running-строки)
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => {
      void loadData({ soft: true });
    }, 3000);
    return () => window.clearInterval(id);
  }, [busy]);

  // Даже без busy: если на сервере есть running — подтягиваем
  useEffect(() => {
    const running = dashboard?.counters.runningSourceRuns ?? 0;
    if (busy || running <= 0) return;
    const id = window.setInterval(() => {
      void loadData({ soft: true });
    }, 4000);
    return () => window.clearInterval(id);
  }, [busy, dashboard?.counters.runningSourceRuns]);

  async function runJob(path: string, label: string) {
    setBusy(label);
    setBusyStartedAt(Date.now());
    setMessage("");
    setError("");
    setRunsPage(0);
    try {
      await adminJson(path, { method: "POST", body: JSON.stringify({}) });
      setMessage(`Запуск завершён: ${JOB_LABELS[label] ?? label}`);
      await loadData({ soft: true });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const looksLikeTimeout =
        /failed to fetch|networkerror|timeout|aborted|load failed/i.test(raw) || raw === "Failed to fetch";
      if (looksLikeTimeout) {
        setError(
          "Связь с API оборвалась (часто таймаут прокси при длинном сборе). Задача могла продолжить работать на сервере. Смотрите таблицу ниже и кнопку «Обновить»; не запускайте вторую копию, пока есть статусы running.",
        );
        await loadData({ soft: true });
      } else {
        setError(raw === "Job failed" ? "Job failed — смотрите ошибки в таблице запусков и логи API." : raw);
      }
    } finally {
      setBusy("");
      setBusyStartedAt(null);
    }
  }

  const runs = dashboard?.recentRuns ?? [];
  const pageCount = Math.max(1, Math.ceil(runs.length / PAGE_SIZE));
  const pageSafe = Math.min(runsPage, pageCount - 1);
  const pageRuns = useMemo(() => {
    const start = pageSafe * PAGE_SIZE;
    return runs.slice(start, start + PAGE_SIZE);
  }, [runs, pageSafe]);

  const serverRunning = dashboard?.counters.runningSourceRuns ?? 0;
  const isCollecting = Boolean(busy) || serverRunning > 0;

  if (loading && !dashboard) {
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
        description="Ручные запуски этапов: сбор, нормализация, дедупликация и черновики контента. Пока идёт задача — меню слева остаётся кликабельным."
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="mw-admin-btn"
              onClick={() => void runJob("/jobs/run-daily-sync", "run-daily-sync")}
              disabled={busy !== ""}
            >
              {busy === "run-daily-sync" ? "Идёт…" : "Дневная синхронизация"}
            </button>
            <button
              type="button"
              className="mw-admin-btn"
              onClick={() => void runJob("/jobs/run-ingestion", "run-ingestion")}
              disabled={busy !== ""}
            >
              {busy === "run-ingestion" ? "Идёт…" : "Загрузка данных"}
            </button>
            <button
              type="button"
              className="mw-admin-btn"
              onClick={() => void runJob("/jobs/run-normalization", "run-normalization")}
              disabled={busy !== ""}
            >
              {busy === "run-normalization" ? "Идёт…" : "Нормализация"}
            </button>
            <button
              type="button"
              className="mw-admin-btn"
              onClick={() => void runJob("/jobs/run-dedup", "run-dedup")}
              disabled={busy !== ""}
            >
              {busy === "run-dedup" ? "Идёт…" : "Дедупликация"}
            </button>
            <button
              type="button"
              className="mw-admin-btn"
              onClick={() => void runJob("/jobs/run-content-drafts", "run-content-drafts")}
              disabled={busy !== ""}
            >
              {busy === "run-content-drafts" ? "Идёт…" : "Черновики контента"}
            </button>
            <button
              type="button"
              className="mw-admin-btn"
              onClick={() => void runJob("/jobs/archive-past", "archive-past")}
              disabled={busy !== ""}
            >
              {busy === "archive-past" ? "Идёт…" : "В архив (прошедшие даты)"}
            </button>
            <button
              type="button"
              className="mw-admin-btn mw-admin-btn--ghost"
              onClick={() => void loadData({ soft: true })}
              disabled={loading && !dashboard}
            >
              Обновить
            </button>
          </div>
        }
      />

      {isCollecting ? (
        <div className="mw-admin-alert" style={{ borderColor: "#b45309", background: "#fffbeb", color: "#92400e" }}>
          <strong>
            {busy
              ? `Сейчас выполняется: ${JOB_LABELS[busy] ?? busy}`
              : `На сервере активных сборов: ${serverRunning}`}
          </strong>
          <div style={{ marginTop: 6 }}>
            {busy ? `Таймер в этом окне: ${elapsedSec} сек. ` : null}
            Список запусков обновляется автоматически. Можно открыть{" "}
            <Link href="/event-candidates">Кандидаты</Link> или <Link href="/programs">Программы</Link> — меню не
            блокируется.
          </div>
        </div>
      ) : null}

      {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}
      {message && <div className="mw-admin-alert mw-admin-alert--success">{message}</div>}

      <AdminSectionCard title="Счётчики" style={{ marginBottom: 0 }}>
        <AdminStatGrid>
          <AdminStatCard label="Источники" value={dashboard.counters.sources} />
          <AdminStatCard label="Сырые записи" value={dashboard.counters.rawItems} />
          <AdminStatCard label="Нормализованные" value={dashboard.counters.normalizedItems} />
          <AdminStatCard label="Кандидаты" value={dashboard.counters.candidates} />
          <AdminStatCard
            label="Требуют проверки"
            value={dashboard.counters.needsReview}
            hint="Смотреть: Кандидаты"
          />
          <AdminStatCard label="Одобрены (кандидаты)" value={dashboard.counters.approved} />
          <AdminStatCard label="Опубликованы (программы)" value={dashboard.counters.published} />
          <AdminStatCard label="Сейчас running" value={serverRunning} hint="source runs на сервере" />
        </AdminStatGrid>
      </AdminSectionCard>

      <AdminSectionCard title="Последние запуски по источникам">
        {runs.length > PAGE_SIZE ? (
          <div className="mw-admin-inline-form" style={{ gap: 8, alignItems: "center", marginBottom: 12 }}>
            <span className="mw-admin-caption">
              {pageSafe * PAGE_SIZE + 1}–{Math.min((pageSafe + 1) * PAGE_SIZE, runs.length)} из {runs.length}
            </span>
            <button
              type="button"
              className="mw-admin-btn mw-admin-btn--ghost"
              disabled={pageSafe <= 0}
              onClick={() => setRunsPage((p) => Math.max(0, p - 1))}
              aria-label="Предыдущая страница"
            >
              ← Назад
            </button>
            <button
              type="button"
              className="mw-admin-btn mw-admin-btn--ghost"
              disabled={pageSafe >= pageCount - 1}
              onClick={() => setRunsPage((p) => Math.min(pageCount - 1, p + 1))}
              aria-label="Следующая страница"
            >
              Вперёд →
            </button>
          </div>
        ) : null}
        {runs.length === 0 ? (
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
                {pageRuns.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <strong>{run.source.name}</strong>
                      <div className="mw-admin-prose" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                        {run.source.type}
                      </div>
                    </td>
                    <td>
                      <div className="mw-admin-mb-4">
                        <AdminStatusBadge tone={runTone(run.status)}>
                          {run.runType} · {run.status}
                        </AdminStatusBadge>
                      </div>
                      <div className="mw-admin-prose" style={{ fontSize: "0.85rem" }}>
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
        <p className="mw-admin-caption" style={{ marginTop: 12 }}>
          Новые программы для ручной проверки: меню <Link href="/event-candidates">Кандидаты</Link> (счётчик «Требуют
          проверки»), затем <Link href="/programs">Программы</Link>.
        </p>
      </AdminSectionCard>
    </main>
  );
}
