"use client";

import { useEffect, useState } from "react";
import { adminJson, getAdminToken } from "../../lib/admin";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../components/admin/AdminSectionCard";

type PilotKpi = {
  pilotMode: boolean;
  note: string;
  privacy?: { publicEndpoint: boolean; containsBookingContactData: boolean };
  shadow: {
    bookingsTotal: number;
    dealsTotal: number;
    sumGmvRub: number;
    sumNetRub: number;
    sumPaidRub: number;
    dealAmountRub: number;
    shadowCommissionRub: number;
  };
};

export default function PilotKpiPage() {
  const [data, setData] = useState<PilotKpi | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAdminToken()) {
      window.location.href = "/login";
      return;
    }
    adminJson<PilotKpi>("/metrics/pilot-kpi")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <AdminMessage type="error">{error}</AdminMessage>;
  if (!data) {
    return (
      <main className="mw-admin-page">
        <AdminLoadingState label="Загружаем пилот-KPI…" />
      </main>
    );
  }

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Пилот KPI: деньги и заявки"
        description="Простая сводка по заявкам, обороту и комиссии за текущий период."
      />
      <AdminSectionCard title="Статус режима пилота">
        <p style={{ margin: 0, fontSize: 14 }}>
          Режим пилота на сервере: <strong>{data.pilotMode ? "включён" : "выключен"}</strong>.
        </p>
        {data.privacy ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--mw-text-muted, #666)" }}>
            Контакты клиентов не показываются в этой аналитике:{" "}
            <code>{String(data.privacy.containsBookingContactData)}</code>
          </p>
        ) : null}
        {data.note ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--mw-text-muted, #666)" }}>{data.note}</p>
        ) : null}
      </AdminSectionCard>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 12, marginTop: 16 }}>
        {(
          [
            ["Заявок всего", formatInt(data.shadow.bookingsTotal)],
            ["Оплачено заявок", formatInt(data.shadow.dealsTotal)],
            ["Оборот (GMV)", formatRub(data.shadow.sumGmvRub)],
            ["Чистая сумма (net)", formatRub(data.shadow.sumNetRub)],
            ["Фактически оплачено", formatRub(data.shadow.sumPaidRub)],
            ["Сумма сделок", formatRub(data.shadow.dealAmountRub)],
            ["Комиссия", formatRub(data.shadow.shadowCommissionRub)],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="mw-admin-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: "var(--mw-text-muted, #666)" }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>
    </main>
  );
}

function formatInt(value: number): string {
  return Number(value || 0).toLocaleString("ru-RU");
}

function formatRub(value: number): string {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}
