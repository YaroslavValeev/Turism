"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type AnalyticsOverview = {
  organizer: {
    id: string;
    displayName: string;
    verificationStatus: string;
    onboardingStatus: string;
    billingStatus: string;
    privilegeStatus: string;
  };
  windowDays: number;
  funnel: {
    views: number;
    leads: number;
    booked: number;
    paid: number;
    completed: number;
    reviewsApproved: number;
  };
  reviews: {
    approvedCount: number;
    averageRating: number | null;
  };
  score: {
    organizerScore: number;
    scoreBand: string;
    sampleBookings: number;
    recalculatedAt: string;
  } | null;
  weakSignals: Array<{
    programId: string;
    totalProgramScore: number;
    scoreBand: string;
  }>;
  nextActions: string[];
};

export default function OrganizerAnalyticsPage() {
  const [organizerId, setOrganizerId] = useState("");
  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AnalyticsOverview | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch(
        `${API_URL}/organizers/${encodeURIComponent(organizerId)}/analytics/overview?days=${encodeURIComponent(days)}`
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Не удалось загрузить аналитику");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mw-container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <h1 className="mw-h2">Organizer analytics (read-only MVP)</h1>
      <p className="mw-lead" style={{ maxWidth: 760 }}>
        Просмотры, лиды, бронирования, оплата/завершение, отзывы, score и weak signals по вашему organizerId.
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 20 }}>
        <label>
          Organizer ID
          <input
            value={organizerId}
            onChange={(e) => setOrganizerId(e.target.value)}
            style={{ display: "block", minWidth: 320, padding: 8 }}
            placeholder="Введите organizerId"
          />
        </label>
        <label>
          Окно (дни)
          <input
            value={days}
            onChange={(e) => setDays(e.target.value)}
            style={{ display: "block", width: 120, padding: 8 }}
            placeholder="30"
          />
        </label>
        <button onClick={load} disabled={!organizerId || loading} className="mw-btn mw-btn--primary" type="button">
          {loading ? "Загрузка..." : "Показать"}
        </button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {data && (
        <div style={{ display: "grid", gap: 16 }}>
          <section className="mw-card">
            <h2 className="mw-h3">{data.organizer.displayName}</h2>
            <p style={{ margin: 0, color: "#555" }}>
              Статусы: verification={data.organizer.verificationStatus}, onboarding={data.organizer.onboardingStatus},
              billing={data.organizer.billingStatus}, privilege={data.organizer.privilegeStatus}
            </p>
          </section>
          <section className="mw-card">
            <h3 className="mw-h3">Funnel ({data.windowDays}d)</h3>
            <p style={{ margin: 0 }}>
              views={data.funnel.views} · leads={data.funnel.leads} · booked={data.funnel.booked} · paid={data.funnel.paid} · completed={data.funnel.completed} · reviews={data.funnel.reviewsApproved}
            </p>
          </section>
          <section className="mw-card">
            <h3 className="mw-h3">Score</h3>
            <p style={{ margin: 0 }}>
              {data.score
                ? `${data.score.organizerScore.toFixed(1)} (${data.score.scoreBand}), sample=${data.score.sampleBookings}`
                : "snapshot пока нет"}
            </p>
          </section>
          <section className="mw-card">
            <h3 className="mw-h3">Weak signals</h3>
            {data.weakSignals.length === 0 ? (
              <p style={{ margin: 0 }}>Нет слабых сигналов в последних snapshot.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {data.weakSignals.map((s) => (
                  <li key={s.programId}>
                    {s.programId} — {s.totalProgramScore.toFixed(1)} ({s.scoreBand})
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="mw-card">
            <h3 className="mw-h3">Next actions</h3>
            {data.nextActions.length === 0 ? (
              <p style={{ margin: 0 }}>Критичных действий не требуется, продолжайте мониторинг.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {data.nextActions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
