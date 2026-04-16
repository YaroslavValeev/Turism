"use client";

import { useEffect, useState } from "react";
import { AdminNav } from "../../../components/AdminNav";
import { adminJson } from "../../../lib/admin";

type DqPayload = Record<string, unknown>;

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
    <main style={{ padding: 24 }}>
      <AdminNav current="/analytics/dq" />
      <h1>Analytics — Data Quality (24h)</h1>
      <p style={{ color: "#555", maxWidth: 900 }}>
        Метрики ingestion / orphan / mart refresh. Playbook:{" "}
        <code>docs/analytics/runtime/DQ_PLAYBOOK.md</code>
      </p>
      {loading && <p>Загрузка…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && data && (
        <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
          <p>
            <strong>Статус:</strong>{" "}
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                background:
                  data.overallGrade === "green"
                    ? "#d4edda"
                    : data.overallGrade === "warning"
                      ? "#fff3cd"
                      : "#f8d7da",
              }}
            >
              {String(data.overallGrade ?? "")}
            </span>
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#333" }}>
            {Object.entries(data)
              .filter(([k]) => k !== "issues")
              .map(([k, v]) => (
                <li key={k}>
                  <code>{k}</code>: {JSON.stringify(v)}
                </li>
              ))}
          </ul>
          {Array.isArray(data.issues) && data.issues.length > 0 && (
            <div>
              <strong>Issues</strong>
              <ul style={{ color: "#a94442" }}>
                {(data.issues as string[]).map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
