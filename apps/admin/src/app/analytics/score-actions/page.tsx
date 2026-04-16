"use client";

import { useEffect, useState } from "react";
import { AdminNav } from "../../../components/AdminNav";
import { adminJson } from "../../../lib/admin";

type ScoreActionPayload = {
  generatedAt: string;
  weakOrganizers: Array<{
    organizerId: string;
    displayName: string;
    score: number;
    scoreBand: string;
    recommendedAction: string;
  }>;
  weakPrograms: Array<{
    programId: string;
    title: string;
    organizerId: string;
    score: number;
    scoreBand: string;
    recommendedAction: string;
  }>;
};

export default function ScoreActionsPage() {
  const [data, setData] = useState<ScoreActionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminJson<ScoreActionPayload>("/metrics/ops/score-actions")
      .then((payload) => setData(payload))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <AdminNav current="/analytics/score-actions" />
      <h1>Analytics — Score-driven Ops Actions</h1>
      <p style={{ color: "#666", maxWidth: 900 }}>
        Приоритизация follow-up по weak/watchlist сущностям: кого и что разбирать в moderation/ops в первую очередь.
      </p>
      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && data && (
        <>
          <p style={{ fontSize: 13, color: "#555" }}>Сформировано: {new Date(data.generatedAt).toLocaleString("ru-RU")}</p>
          <section style={{ marginTop: 20 }}>
            <h2 style={{ marginBottom: 10 }}>Weak organizers</h2>
            {data.weakOrganizers.length === 0 ? (
              <p>Нет слабых организаторов в текущих snapshot.</p>
            ) : (
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #333" }}>
                    <th style={{ textAlign: "left", padding: 8 }}>Organizer</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Score</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weakOrganizers.map((row) => (
                    <tr key={row.organizerId} style={{ borderBottom: "1px solid #ddd" }}>
                      <td style={{ padding: 8 }}>{row.displayName} <code>{row.organizerId}</code></td>
                      <td style={{ padding: 8 }}>{row.score.toFixed(1)} ({row.scoreBand})</td>
                      <td style={{ padding: 8 }}>{row.recommendedAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 10 }}>Weak programs</h2>
            {data.weakPrograms.length === 0 ? (
              <p>Нет слабых программ в текущих snapshot.</p>
            ) : (
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #333" }}>
                    <th style={{ textAlign: "left", padding: 8 }}>Program</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Score</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weakPrograms.map((row) => (
                    <tr key={row.programId} style={{ borderBottom: "1px solid #ddd" }}>
                      <td style={{ padding: 8 }}>{row.title} <code>{row.programId}</code></td>
                      <td style={{ padding: 8 }}>{row.score.toFixed(1)} ({row.scoreBand})</td>
                      <td style={{ padding: 8 }}>{row.recommendedAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}
