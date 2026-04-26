"use client";

import { useEffect, useMemo, useState } from "react";
import { adminJson } from "../../../lib/admin";
import { AdminPageHeader } from "../../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../../components/admin/AdminSectionCard";
import { AdminStatCard, AdminStatGrid } from "../../../components/admin/AdminStatCard";
import { AdminLoadingState } from "../../../components/admin/AdminLoadingState";

type Totals = {
  bookingsInRange: number;
  withEntryPair: number;
  entryIncomplete: number;
  noEntryTracking: number;
};

type Row = {
  entryType: string;
  entryId: string;
  bookingCount: number;
  firstCreatedAt: string;
  lastCreatedAt: string;
  exploreType: string | null;
  exploreSlug: string | null;
};

type ApiPayload = {
  from: string;
  toInclusive: string;
  note?: string;
  totals: Totals;
  rows: Row[];
  truncated?: boolean;
};

export default function ContentEntriesAnalyticsPage() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const from = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 29);
    return d.toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    adminJson<ApiPayload>(`/metrics/content-entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((d) => setData(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) {
    return (
      <main className="mw-admin-page">
        <AdminPageHeader title="Входы по контенту (G4.1)" description="Связь заявок с entry_type / entry_id в URL." />
        <AdminLoadingState />
      </main>
    );
  }

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Входы по контенту (G4.1)"
        description={
          <>
            Пара <code className="mw-admin-code">entry_type</code> +{" "}
            <code className="mw-admin-code">entry_id</code> (blog / collection / explore / program). Период:{" "}
            <strong>{from}</strong>—<strong>{to}</strong> (UTC). Источник: <code className="mw-admin-code">bookings.sourceCampaign</code> +{" "}
            <code className="mw-admin-code">[tracking]</code> в <code className="mw-admin-code">notes</code>.
          </>
        }
      />
      {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}
      {data && !error && (
        <>
          {data.truncated && (
            <div className="mw-admin-alert" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
              Показаны первые 20 000 заявок — уточните период при необходимости.
            </div>
          )}
          {data.note && <p className="mw-admin-prose">{data.note}</p>}

          <AdminSectionCard title="Сводка" style={{ marginTop: 12 }}>
            <AdminStatGrid>
              <AdminStatCard label="Все заявки" value={data.totals.bookingsInRange} />
              <AdminStatCard label="С полным entry" value={data.totals.withEntryPair} />
              <AdminStatCard label="Неполный entry" value={data.totals.entryIncomplete} />
              <AdminStatCard label="Без трекинга" value={data.totals.noEntryTracking} />
            </AdminStatGrid>
          </AdminSectionCard>

          <AdminSectionCard title="Детализация" style={{ marginTop: 8 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="mw-admin-table" style={{ margin: 0, minWidth: 900 }}>
                <thead>
                  <tr>
                    {["entry_type", "entry_id", "заявок", "первый", "последний", "explore", "explore slug"].map((c) => (
                      <th key={c} style={{ whiteSpace: "nowrap" }}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="mw-admin-prose">
                        Пока нет заявок с полным <code className="mw-admin-code">entry</code> за период.
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((r) => (
                      <tr key={`${r.entryType}:${r.entryId}`}>
                        <td>{r.entryType}</td>
                        <td className="mw-admin-code" style={{ wordBreak: "break-all", maxWidth: 360 }}>
                          {r.entryId}
                        </td>
                        <td>{r.bookingCount}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtIso(r.firstCreatedAt)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtIso(r.lastCreatedAt)}</td>
                        <td>{r.exploreType ?? "—"}</td>
                        <td>{r.exploreSlug ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </AdminSectionCard>
        </>
      )}
    </main>
  );
}

function fmtIso(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.valueOf())) return s;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}
