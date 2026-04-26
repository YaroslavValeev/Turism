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

const METRIC_ROWS: Array<{ key: keyof DqPayload; label: string; hint?: string }> = [
  { key: "ingestionSuccessCount", label: "Ingestion OK (события)" },
  { key: "ingestionErrorCount", label: "Ошибки ingestion" },
  { key: "invalidPayloadCount", label: "Invalid payload" },
  { key: "missingRequiredParamsCount", label: "Missing required params" },
  { key: "duplicateEventCount", label: "Дубликаты (idempotency)" },
  { key: "lateEventCount", label: "События с опозданием" },
  { key: "orphanBookingEventCount", label: "Orphan: booking" },
  { key: "orphanPaymentEventCount", label: "Orphan: payment" },
  { key: "orphanRefundEventCount", label: "Orphan: refund" },
  { key: "martRefreshSuccessCount", label: "Mart refresh OK" },
  { key: "martRefreshFailureCount", label: "Mart refresh fail" },
  { key: "dataFreshnessLagSeconds", label: "Лаг pipeline (с)" },
  { key: "martFreshnessLagSeconds", label: "Лаг mart (с)" },
  { key: "criticalBackendEventCount", label: "Критичные backend-события" },
];

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
        title="Data Quality (24h)"
        description={
          <>
            Окно: последние 24 часа. Playbook: <code className="mw-admin-code">docs/analytics/runtime/DQ_PLAYBOOK.md</code>
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
              <AdminStatusBadge tone={gradeTone(data.overallGrade)}>{data.overallGrade}</AdminStatusBadge>
              <span className="mw-admin-prose" style={{ fontSize: "0.9rem" }}>
                windowHours = {data.windowHours}
              </span>
            </div>
            {data.issues.length > 0 ? (
              <div className="mw-admin-alert" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
                <strong style={{ display: "block", marginBottom: 8 }}>Issues</strong>
                <ul className="mw-admin-prose" style={{ margin: 0, paddingLeft: 20, color: "#7f1d1d" }}>
                  {data.issues.map((i) => (
                    <li key={i}>{i}</li>
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
                label="Ingestion OK / ошибки"
                value={`${data.ingestionSuccessCount} / ${data.ingestionErrorCount}`}
              />
              <AdminStatCard label="Лаг pipeline (с)" value={data.dataFreshnessLagSeconds} />
              <AdminStatCard label="Лаг mart (с)" value={data.martFreshnessLagSeconds} />
              <AdminStatCard label="Mart fail" value={data.martRefreshFailureCount} hint="за окно" />
            </AdminStatGrid>
          </AdminSectionCard>

          <AdminSectionCard title="Детализация" style={{ marginTop: 8 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="mw-admin-table" style={{ margin: 0, minWidth: 480 }}>
                <thead>
                  <tr>
                    <th>Метрика</th>
                    <th>Значение</th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_ROWS.map(({ key, label }) => (
                    <tr key={key}>
                      <td className="mw-admin-prose">{label}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{String(data[key] as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminSectionCard>
        </>
      )}

      {!loading && !error && !data && (
        <AdminEmptyState title="Нет данных" description="Ответ API пуст. Проверьте бэкенд /metrics/analytics/dq." />
      )}
    </main>
  );
}
