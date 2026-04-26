"use client";

/**
 * Показывается, если в .env задано NEXT_PUBLIC_PILOT_MODE=1
 * (серверный флаг PILOT_MODE_ENABLED — в API для /metrics/pilot-kpi).
 */
export function PilotModeBanner() {
  if (process.env.NEXT_PUBLIC_PILOT_MODE !== "1") return null;
  return (
    <div
      className="mw-admin-pilot-banner"
      style={{
        background: "linear-gradient(90deg, #1e3a5f, #0f172a)",
        color: "#e2e8f0",
        padding: "8px 16px",
        fontSize: 13,
        textAlign: "center",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      Пилотный режим: первые ~60 дней без списаний с организаторов; метрики и shadow GMV/комиссия — для аналитики.
    </div>
  );
}
