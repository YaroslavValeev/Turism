"use client";

export function PilotModeBanner() {
  if (process.env.NEXT_PUBLIC_PILOT_MODE !== "1") return null;
  return (
    <div
      style={{
        background: "var(--mw-surface-2, #1a1a2e)",
        color: "var(--mw-muted, #94a3b8)",
        padding: "6px 16px",
        fontSize: 12,
        textAlign: "center",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      Пилот MyWave: размещение и заявки работают; списаний с организаторов в пилоте нет. Подробности в разделе для партнёров.
    </div>
  );
}
