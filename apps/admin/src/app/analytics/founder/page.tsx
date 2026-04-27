"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminJson } from "../../../lib/admin";
import { AdminPageHeader } from "../../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../../components/admin/AdminSectionCard";
import { AdminStatCard, AdminStatGrid } from "../../../components/admin/AdminStatCard";
import { AdminLoadingState } from "../../../components/admin/AdminLoadingState";

type FounderRow = Record<string, unknown>;

type FounderSummary = {
  dq_health_status?: string;
  data_freshness_lag_seconds?: number;
  critical_analytics_warnings_count?: number;
  organizer_score_summary?: { average?: number; sample_organizers?: number };
  program_score_summary?: { average?: number; sample_programs?: number };
  score_movement_week_over_week?: { organizer_score_delta?: number; program_score_delta?: number };
  top_weak_organizers?: { organizerId: string; organizerScore: number; scoreBand: string }[];
  top_weak_programs?: { programId: string; totalProgramScore: number; scoreBand: string }[];
};

export default function FounderAnalyticsPage() {
  const [rows, setRows] = useState<FounderRow[]>([]);
  const [summary, setSummary] = useState<FounderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const from = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 29);
    return d.toISOString().slice(0, 10);
  }, []);
  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      adminJson<{ rows: FounderRow[] }>(`/metrics/founder/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      adminJson<FounderSummary>("/metrics/founder/summary").catch(() => null),
    ])
      .then(([daily, sum]) => {
        if (cancelled) return;
        setRows(Array.isArray(daily.rows) ? daily.rows : []);
        setSummary(sum);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Founder: сводка здоровья проекта"
        description={
          <>
            Период: <strong>{from}</strong>…<strong>{to}</strong> (UTC). Ниже — ключевые показатели, которые помогают быстро понять
            состояние контента и продаж.
          </>
        }
      />

      {summary && (
        <AdminSectionCard title="Качество данных и контента">
          <p className="mw-admin-prose" style={{ margin: "0 0 12px" }}>
            Это верхнеуровневая страница для управленческого контроля: есть ли проблемы в данных, падает ли качество программ и где
            нужна ручная проверка.
          </p>

          <AdminStatGrid>
            <AdminStatCard
              label="Состояние данных"
              value={humanDqStatus(summary.dq_health_status)}
              hint="общий статус"
            />
            <AdminStatCard
              label="Задержка обновления"
              value={formatSeconds(summary.data_freshness_lag_seconds)}
              hint="чем меньше, тем лучше"
            />
            <AdminStatCard
              label="Критические предупреждения"
              value={summary.critical_analytics_warnings_count ?? 0}
            />
            <AdminStatCard
              label="Средняя оценка организаторов"
              value={
                summary.organizer_score_summary?.average != null
                  ? `${summary.organizer_score_summary.average.toFixed(2)} (${summary.organizer_score_summary.sample_organizers ?? 0} шт.)`
                  : "—"
              }
            />
            <AdminStatCard
              label="Средняя оценка программ"
              value={
                summary.program_score_summary?.average != null
                  ? `${summary.program_score_summary.average.toFixed(2)} (${summary.program_score_summary.sample_programs ?? 0} шт.)`
                  : "—"
              }
            />
            <AdminStatCard
              label="Динамика за неделю"
              value={
                `орг.: ${
                  summary.score_movement_week_over_week?.organizer_score_delta != null
                    ? summary.score_movement_week_over_week.organizer_score_delta.toFixed(3)
                    : "—"
                } · прогр.: ${
                  summary.score_movement_week_over_week?.program_score_delta != null
                    ? summary.score_movement_week_over_week.program_score_delta.toFixed(3)
                    : "—"
                }`
              }
            />
          </AdminStatGrid>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16 }}>
            <div style={{ minWidth: 0, flex: "1 1 220px" }}>
              <strong>Организаторы с низкой оценкой</strong>
              <ol className="mw-admin-prose" style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 14 }}>
                {(summary.top_weak_organizers ?? []).map((o) => (
                  <li key={o.organizerId}>
                    <code className="mw-admin-code">{o.organizerId}</code> — {o.organizerScore.toFixed(1)} ({scoreBandRu(o.scoreBand)})
                  </li>
                ))}
              </ol>
            </div>
            <div style={{ minWidth: 0, flex: "1 1 220px" }}>
              <strong>Программы с низкой оценкой</strong>
              <ol className="mw-admin-prose" style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 14 }}>
                {(summary.top_weak_programs ?? []).map((p) => (
                  <li key={p.programId}>
                    <code className="mw-admin-code">{p.programId}</code> — {p.totalProgramScore.toFixed(1)} ({scoreBandRu(p.scoreBand)})
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <p className="mw-admin-prose" style={{ marginTop: 12, marginBottom: 0 }}>
            <Link href="/analytics/dq">DQ dashboard</Link>
          </p>
        </AdminSectionCard>
      )}

      {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}
      {loading && <AdminLoadingState />}

      {!loading && !error && (
        <AdminSectionCard title="Ежедневные метрики (последние 30 дней)" style={summary ? { marginTop: 0 } : undefined}>
          <div className="mw-admin-table-outer mw-admin-table-outer--always-scroll">
            <table className="mw-admin-table" style={{ margin: 0, minWidth: 1100 }}>
              <thead>
                <tr>
                  {[
                    "Дата",
                    "Ключевой NSM",
                    "Расширенный NSM",
                    "Новые лиды",
                    "Новые организаторы",
                    "Проверено организаторов",
                    "Доверенных организаторов",
                    "Забронировано",
                    "Оплачено",
                    "Завершено",
                    "Чистый GMV, ₽",
                    "Комиссия, ₽",
                  ].map((c) => (
                    <th key={c} style={{ whiteSpace: "nowrap" }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="mw-admin-prose">
                      Пока нет строк (mart пустой или БД без активности).
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => (
                    <tr key={idx}>
                      <td style={{ whiteSpace: "nowrap" }}>{String(r.day ?? "")}</td>
                      <td>{String(r.nsm_core ?? "")}</td>
                      <td>{String(r.nsm_extended ?? "")}</td>
                      <td>{String(r.leads_created ?? "")}</td>
                      <td>{String(r.new_organizers_created ?? "")}</td>
                      <td>{String(r.verified_organizers_updated_day ?? "")}</td>
                      <td>{String(r.trusted_organizers_updated_day ?? "")}</td>
                      <td>{String(r.bookings_booked ?? "")}</td>
                      <td>{String(r.bookings_paid_any ?? "")}</td>
                      <td>{String(r.bookings_completed ?? "")}</td>
                      <td>{String(r.net_gmv_rub ?? "")}</td>
                      <td>{String(r.commission_paid_rub ?? "")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AdminSectionCard>
      )}
    </main>
  );
}

function humanDqStatus(status?: string): string {
  const v = String(status ?? "").toLowerCase();
  if (v === "green") return "Норма";
  if (v === "warning") return "Есть предупреждения";
  if (v === "critical") return "Критично";
  return "—";
}

function formatSeconds(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${seconds} с`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} мин`;
  const hours = Math.round(mins / 60);
  return `${hours} ч`;
}

function scoreBandRu(scoreBand?: string): string {
  const v = String(scoreBand ?? "").toLowerCase();
  if (v === "low") return "низкий";
  if (v === "medium") return "средний";
  if (v === "high") return "высокий";
  return scoreBand ?? "—";
}
