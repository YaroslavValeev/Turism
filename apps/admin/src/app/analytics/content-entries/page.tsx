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
        <AdminPageHeader title="Входы по контенту" description="Показывает, откуда пришли заявки: статья, подборка или карточка." />
        <AdminLoadingState />
      </main>
    );
  }

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Входы по контенту"
        description={
          <>
            Период: <strong>{from}</strong>—<strong>{to}</strong> (UTC). Здесь видно, какие материалы реально приводят заявки.
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
          {data.note ? <p className="mw-admin-prose">{data.note}</p> : null}

          <AdminSectionCard title="Сводка" style={{ marginTop: 12 }}>
            <AdminStatGrid>
              <AdminStatCard label="Все заявки" value={data.totals.bookingsInRange} />
              <AdminStatCard label="С понятным источником" value={data.totals.withEntryPair} />
              <AdminStatCard label="Источник указан частично" value={data.totals.entryIncomplete} />
              <AdminStatCard label="Без трекинга" value={data.totals.noEntryTracking} />
            </AdminStatGrid>
          </AdminSectionCard>

          <AdminSectionCard title="Топ источников по заявкам" style={{ marginTop: 8 }}>
            <div className="mw-admin-table-outer mw-admin-table-outer--always-scroll">
              <table className="mw-admin-table" style={{ margin: 0, minWidth: 760 }}>
                <thead>
                  <tr>
                    {["Тип источника", "ID источника", "Заявок", "Первый лид", "Последний лид"].map((c) => (
                      <th key={c} style={{ whiteSpace: "nowrap" }}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="mw-admin-prose">
                        За выбранный период пока нет заявок с распознанным источником.
                      </td>
                    </tr>
                  ) : (
                    data.rows.slice(0, 200).map((r) => (
                      <tr key={`${r.entryType}:${r.entryId}`}>
                        <td>{humanEntryType(r.entryType)}</td>
                        <td className="mw-admin-code" style={{ wordBreak: "break-all", maxWidth: 360 }}>
                          {r.entryId}
                        </td>
                        <td>{r.bookingCount}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtIso(r.firstCreatedAt)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtIso(r.lastCreatedAt)}</td>
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

function humanEntryType(entryType: string): string {
  const v = entryType.toLowerCase();
  if (v === "blog") return "Блог";
  if (v === "collection") return "Подборка";
  if (v === "explore") return "Раздел Explore";
  if (v === "program") return "Карточка программы";
  return entryType;
}
