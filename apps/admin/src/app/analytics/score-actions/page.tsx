"use client";

import { useEffect, useState } from "react";
import { adminJson } from "../../../lib/admin";
import { AdminPageHeader } from "../../../components/admin/AdminPageHeader";
import { AdminSectionCard } from "../../../components/admin/AdminSectionCard";
import { AdminLoadingState } from "../../../components/admin/AdminLoadingState";

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
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Score-driven ops"
        description="Приоритизация follow-up по слабым сущностям: moderation/ops. Данные из снимков score."
      />
      {loading && <AdminLoadingState />}
      {error && <div className="mw-admin-alert mw-admin-alert--error">{error}</div>}
      {!loading && !error && data && (
        <>
          <p className="mw-admin-prose" style={{ marginBottom: 20 }}>
            Сформировано: {new Date(data.generatedAt).toLocaleString("ru-RU")}
          </p>
          <AdminSectionCard title="Weak organizers">
            {data.weakOrganizers.length === 0 ? (
              <p className="mw-admin-prose">Нет слабых организаторов в текущих снимках.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="mw-admin-table" style={{ margin: 0, minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th>Организатор</th>
                      <th>Score</th>
                      <th>Рекомендация</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weakOrganizers.map((row) => (
                      <tr key={row.organizerId}>
                        <td>
                          {row.displayName} <code className="mw-admin-code">{row.organizerId}</code>
                        </td>
                        <td>
                          {row.score.toFixed(1)} ({row.scoreBand})
                        </td>
                        <td>{row.recommendedAction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminSectionCard>
          <AdminSectionCard title="Weak programs" style={{ marginTop: 8 }}>
            {data.weakPrograms.length === 0 ? (
              <p className="mw-admin-prose">Нет слабых программ в текущих снимках.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="mw-admin-table" style={{ margin: 0, minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th>Программа</th>
                      <th>Score</th>
                      <th>Рекомендация</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weakPrograms.map((row) => (
                      <tr key={row.programId}>
                        <td>
                          {row.title} <code className="mw-admin-code">{row.programId}</code>
                        </td>
                        <td>
                          {row.score.toFixed(1)} ({row.scoreBand})
                        </td>
                        <td>{row.recommendedAction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminSectionCard>
        </>
      )}
    </main>
  );
}
