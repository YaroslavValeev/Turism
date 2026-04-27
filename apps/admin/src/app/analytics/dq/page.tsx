"use client";

import { useEffect, useState } from "react";
import { adminJson } from "../../../lib/admin";
import { AdminPageHeader } from "../../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../../components/admin/AdminSectionCard";
import { AdminLoadingState } from "../../../components/admin/AdminLoadingState";
import { AdminStatusBadge, type AdminStatusBadgeTone } from "../../../components/admin/AdminStatusBadge";
import { AdminStatCard, AdminStatGrid } from "../../../components/admin/AdminStatCard";
import { AdminEmptyState } from "../../../components/admin/AdminEmptyState";

type DqPayload = {
  windowHours: number;
  ingestionSuccessCount: number;
  ingestionErrorCount: number;
  invalidPayloadCount: number;
  missingRequiredParamsCount: number;
  duplicateEventCount: number;
  lateEventCount: number;
  orphanBookingEventCount: number;
  orphanPaymentEventCount: number;
  orphanRefundEventCount: number;
  martRefreshSuccessCount: number;
  martRefreshFailureCount: number;
  dataFreshnessLagSeconds: number;
  martFreshnessLagSeconds: number;
  criticalBackendEventCount: number;
  overallGrade: "green" | "warning" | "critical";
  issues: string[];
};

function gradeTone(grade: DqPayload["overallGrade"]): AdminStatusBadgeTone {
  if (grade === "green") return "ok";
  if (grade === "warning") return "warn";
  return "danger";
}

export default function AnalyticsDqPage() {
  const [data, setData] = useState<DqPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminJson<DqPayload>("/metrics/analytics/dq?hours=24")
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Качество данных (24 часа)"
        description={
          <>
            Короткая проверка стабильности данных за последние 24 часа.
          </>
        }
      />
      {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}
      {loading && <AdminLoadingState label="Считаем метрики DQ…" />}

      {!loading && !error && data && (
        <>
          <AdminSectionCard title="Статус" style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span className="mw-admin-prose">Оценка:</span>
              <AdminStatusBadge tone={gradeTone(data.overallGrade)}>{gradeRu(data.overallGrade)}</AdminStatusBadge>
              <span className="mw-admin-prose" style={{ fontSize: "0.9rem" }}>
                окно: {data.windowHours} ч
              </span>
            </div>
            {data.issues.length > 0 ? (
              <div className="mw-admin-alert" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
                <strong style={{ display: "block", marginBottom: 8 }}>Что требует внимания</strong>
                <ul className="mw-admin-prose" style={{ margin: 0, paddingLeft: 20, color: "#7f1d1d" }}>
                  {data.issues.map((i) => (
                    <li key={i}>{humanizeIssue(i)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mw-admin-prose" style={{ margin: 0 }}>
                Нет зарегистрированных issues за окно.
              </p>
            )}
          </AdminSectionCard>

          <AdminSectionCard title="Краткая сводка" style={{ marginTop: 8 }}>
            <AdminStatGrid>
              <AdminStatCard
                label="Успешные события / ошибки"
                value={`${data.ingestionSuccessCount} / ${data.ingestionErrorCount}`}
              />
              <AdminStatCard label="Задержка пайплайна" value={formatSeconds(data.dataFreshnessLagSeconds)} />
              <AdminStatCard label="Задержка витрины" value={formatSeconds(data.martFreshnessLagSeconds)} />
              <AdminStatCard label="Сбоев обновления витрины" value={data.martRefreshFailureCount} hint="за 24 часа" />
              <AdminStatCard
                label="Критичных backend-событий"
                value={data.criticalBackendEventCount}
                hint="должно быть 0"
              />
            </AdminStatGrid>
          </AdminSectionCard>
        </>
      )}

      {!loading && !error && !data && (
        <AdminEmptyState title="Нет данных" description="Ответ API пуст. Проверьте бэкенд /metrics/analytics/dq." />
      )}
    </main>
  );
}

function gradeRu(grade: DqPayload["overallGrade"]): string {
  if (grade === "green") return "Норма";
  if (grade === "warning") return "Предупреждение";
  return "Критично";
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} с`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} мин`;
  const hours = Math.round(mins / 60);
  return `${hours} ч`;
}

function humanizeIssue(issue: string): string {
  const compact = issue.replace(/^warning:/i, "").trim();
  return compact
    .replace(/orphan_events/gi, "потерянные события")
    .replace(/booking/gi, "бронирование")
    .replace(/payment/gi, "оплата")
    .replace(/refund/gi, "возврат");
}
