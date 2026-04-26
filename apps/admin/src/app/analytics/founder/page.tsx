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
        title="Analytics — Founder (daily)"
        description={
          <>
            Источник: <code className="mw-admin-code">mv_founder_daily</code>. Период: <strong>{from}</strong>…<strong>{to}</strong>{" "}
            (UTC даты).
          </>
        }
      />

      {summary && (
        <AdminSectionCard title="Качество данных и supply (internal)">
          <p className="mw-admin-prose" style={{ margin: "0 0 12px" }}>
            <strong>Рекомендуемые действия по умолчанию:</strong> при DQ critical — разбор ingestion и mart; при слабом организаторе —
            контакт и план supply; при слабой программе — чеклист карточки; при росте refund — billing. Runbook:{" "}
            <code className="mw-admin-code">docs/analytics/runtime/ACTIONS_BY_ROLE.md</code>.
          </p>

          <AdminStatGrid>
            <AdminStatCard
              label="DQ health"
              value={String(summary.dq_health_status ?? "—")}
              hint="статус пайплайна"
            />
            <AdminStatCard
              label="Freshness lag (s)"
              value={summary.data_freshness_lag_seconds != null ? summary.data_freshness_lag_seconds : "—"}
            />
            <AdminStatCard
              label="Critical warnings"
              value={summary.critical_analytics_warnings_count ?? 0}
            />
            <AdminStatCard
              label="Organizer score avg (n)"
              value={
                summary.organizer_score_summary?.average != null
                  ? `${summary.organizer_score_summary.average.toFixed(2)} (${summary.organizer_score_summary.sample_organizers ?? 0})`
                  : "—"
              }
            />
            <AdminStatCard
              label="Program score avg (n)"
              value={
                summary.program_score_summary?.average != null
                  ? `${summary.program_score_summary.average.toFixed(2)} (${summary.program_score_summary.sample_programs ?? 0})`
                  : "—"
              }
            />
            <AdminStatCard
              label="WoW Δ org / program"
              value={
                `org: ${
                  summary.score_movement_week_over_week?.organizer_score_delta != null
                    ? summary.score_movement_week_over_week.organizer_score_delta.toFixed(3)
                    : "—"
                } · prg: ${
                  summary.score_movement_week_over_week?.program_score_delta != null
                    ? summary.score_movement_week_over_week.program_score_delta.toFixed(3)
                    : "—"
                }`
              }
            />
          </AdminStatGrid>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16 }}>
            <div style={{ minWidth: 0, flex: "1 1 220px" }}>
              <strong>Top weak organizers</strong>
              <ol className="mw-admin-prose" style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 14 }}>
                {(summary.top_weak_organizers ?? []).map((o) => (
                  <li key={o.organizerId}>
                    <code className="mw-admin-code">{o.organizerId}</code> — {o.organizerScore.toFixed(1)} ({o.scoreBand})
                  </li>
                ))}
              </ol>
            </div>
            <div style={{ minWidth: 0, flex: "1 1 220px" }}>
              <strong>Top weak programs</strong>
              <ol className="mw-admin-prose" style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 14 }}>
                {(summary.top_weak_programs ?? []).map((p) => (
                  <li key={p.programId}>
                    <code className="mw-admin-code">{p.programId}</code> — {p.totalProgramScore.toFixed(1)} ({p.scoreBand})
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
        <AdminSectionCard title="Ежедневные метрики" style={summary ? { marginTop: 0 } : undefined}>
          <div style={{ overflowX: "auto" }}>
            <table className="mw-admin-table" style={{ margin: 0, minWidth: 1100 }}>
              <thead>
                <tr>
                  {[
                    "day",
                    "nsm_core",
                    "nsm_extended",
                    "leads_created",
                    "new_organizers_created",
                    "verified_organizers_updated_day",
                    "trusted_organizers_updated_day",
                    "bookings_booked",
                    "bookings_paid_any",
                    "bookings_completed",
                    "net_gmv_rub",
                    "commission_paid_rub",
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
