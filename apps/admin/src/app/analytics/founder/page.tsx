"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../../../components/AdminNav";
import { adminJson } from "../../../lib/admin";

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
    <main style={{ padding: 24 }}>
      <AdminNav current="/analytics/founder" />
      <h1>Analytics — Founder (daily)</h1>

      {summary && (
        <section
          style={{
            marginBottom: 24,
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 8,
            background: "#fafafa",
            maxWidth: 960,
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Качество данных и supply (internal)</h2>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#333", lineHeight: 1.5 }}>
            <strong>Рекомендуемые действия по умолчанию:</strong> при DQ critical — разбор ingestion и mart (см. DQ playbook); при
            слабом организаторе — контакт и план улучшений supply; при слабой программе — чеклист карточки и медиа; при росте
            refund — billing alerts. Полный runbook по ролям: <code>docs/analytics/runtime/ACTIONS_BY_ROLE.md</code>.
          </p>
          <p style={{ margin: "6px 0", color: "#444" }}>
            <strong>DQ health:</strong> {String(summary.dq_health_status ?? "—")} ·{" "}
            <strong>Freshness lag (s):</strong> {summary.data_freshness_lag_seconds ?? "—"} ·{" "}
            <strong>Critical warnings:</strong> {summary.critical_analytics_warnings_count ?? 0}
          </p>
          <p style={{ margin: "6px 0", color: "#444" }}>
            <strong>Organizer score avg:</strong>{" "}
            {summary.organizer_score_summary?.average != null
              ? summary.organizer_score_summary.average.toFixed(2)
              : "—"}{" "}
            <span style={{ color: "#666" }}>
              (n={summary.organizer_score_summary?.sample_organizers ?? 0})
            </span>
            {" · "}
            <strong>Program score avg:</strong>{" "}
            {summary.program_score_summary?.average != null
              ? summary.program_score_summary.average.toFixed(2)
              : "—"}{" "}
            <span style={{ color: "#666" }}>
              (n={summary.program_score_summary?.sample_programs ?? 0})
            </span>
          </p>
          <p style={{ margin: "6px 0", color: "#444" }}>
            <strong>WoW Δ organizer:</strong>{" "}
            {summary.score_movement_week_over_week?.organizer_score_delta != null
              ? summary.score_movement_week_over_week.organizer_score_delta.toFixed(3)
              : "—"}{" "}
            · <strong>WoW Δ program:</strong>{" "}
            {summary.score_movement_week_over_week?.program_score_delta != null
              ? summary.score_movement_week_over_week.program_score_delta.toFixed(3)
              : "—"}
          </p>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 12 }}>
            <div>
              <strong>Top weak organizers</strong>
              <ol style={{ margin: "6px 0", paddingLeft: 18, fontSize: 14 }}>
                {(summary.top_weak_organizers ?? []).map((o) => (
                  <li key={o.organizerId}>
                    <code>{o.organizerId}</code> — {o.organizerScore.toFixed(1)} ({o.scoreBand})
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <strong>Top weak programs</strong>
              <ol style={{ margin: "6px 0", paddingLeft: 18, fontSize: 14 }}>
                {(summary.top_weak_programs ?? []).map((p) => (
                  <li key={p.programId}>
                    <code>{p.programId}</code> — {p.totalProgramScore.toFixed(1)} ({p.scoreBand})
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <p style={{ marginTop: 12 }}>
            <Link href="/analytics/dq">Открыть DQ dashboard</Link>
          </p>
        </section>
      )}

      <p style={{ color: "#555", maxWidth: 900 }}>
        Источник: <code>mv_founder_daily</code>. Период: <strong>{from}</strong>…<strong>{to}</strong> (UTC даты).
      </p>
      {loading && <p>Загрузка…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #333" }}>
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
                  <th key={c} style={{ textAlign: "left", padding: 8, whiteSpace: "nowrap" }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: 12, color: "#666" }}>
                    Пока нет строк (mart пустой или БД без активности).
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8, whiteSpace: "nowrap" }}>{String(r.day ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.nsm_core ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.nsm_extended ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.leads_created ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.new_organizers_created ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.verified_organizers_updated_day ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.trusted_organizers_updated_day ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.bookings_booked ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.bookings_paid_any ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.bookings_completed ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.net_gmv_rub ?? "")}</td>
                    <td style={{ padding: 8 }}>{String(r.commission_paid_rub ?? "")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
