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
        title="Пилот: shadow GMV / комиссия"
        description={data.note}
      />
      <AdminSectionCard title="API: PILOT_MODE_ENABLED">
        <p style={{ margin: 0, fontSize: 14 }}>
          Сервер: <code>PILOT_MODE_ENABLED</code> в <code>services/api/.env</code> ={" "}
          <strong>{data.pilotMode ? "true" : "false"}</strong>. Web/Admin баннер: <code>NEXT_PUBLIC_PILOT_MODE=1</code>.
        </p>
      </AdminSectionCard>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 12, marginTop: 16 }}>
        {(
          [
            ["Брони (всего)", data.shadow.bookingsTotal],
            ["Deals (строки)", data.shadow.dealsTotal],
            ["Σ GMV ₽", data.shadow.sumGmvRub],
            ["Σ net ₽", data.shadow.sumNetRub],
            ["Σ paid ₽", data.shadow.sumPaidRub],
            ["Σ deal amount ₽", data.shadow.dealAmountRub],
            ["Shadow commission ₽", data.shadow.shadowCommissionRub],
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
