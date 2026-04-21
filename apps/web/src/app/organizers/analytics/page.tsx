"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type LeadAttribution = {
  bySource: Array<{ source: string; sourceChannel: string | null; count: number }>;
  topProgramsByLeads: Array<{ programId: string; leads: number }>;
};

type ConversionProgress = {
  programId: string;
  programTitle: string;
  funnelEnabled: boolean;
  serviceCommsOptIn: boolean;
  discussUrl: string;
  firstPublishedAt: string | null;
  metrics: { views: number; clicks: number; leads: number; deals: number };
  checklist: {
    hasViews: boolean;
    hasClicks: boolean;
    hasLeads: boolean;
    hasDeals: boolean;
    modelDiscussed: boolean;
  };
  stagesSent: {
    stage0: boolean;
    stage1: boolean;
    stage2: boolean;
    stage3: boolean;
    stage4: boolean;
    stage5: boolean;
    followUp: boolean;
  };
  maxStageReached: number;
  rollout: {
    allowedMaxStage: number;
    enableStage4: boolean;
    enableStage5: boolean;
    enableFollowup: boolean;
    organizerMinIntervalHours: number;
  };
  platformMode: string;
  launchMode: boolean;
};

type AnalyticsOverview = {
  organizer: {
    id: string;
    displayName: string;
    verificationStatus: string;
    onboardingStatus: string;
    billingStatus: string;
    privilegeStatus: string;
  };
  platformMode: string;
  launchMode: boolean;
  windowDays: number;
  funnel: {
    views: number;
    clicks: number;
    leads: number;
    booked: number;
    paid: number;
    completed: number;
    reviewsApproved: number;
  };
  leadAttribution: LeadAttribution;
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
  const [programId, setProgramId] = useState("");
  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [convLoading, setConvLoading] = useState(false);
  const [convError, setConvError] = useState("");
  const [conversion, setConversion] = useState<ConversionProgress | null>(null);

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

  const loadConversion = async () => {
    setConvLoading(true);
    setConvError("");
    setConversion(null);
    try {
      const res = await fetch(
        `${API_URL}/organizers/${encodeURIComponent(organizerId)}/programs/${encodeURIComponent(programId)}/conversion-progress`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Не удалось загрузить прогресс воронки");
      setConversion(body as ConversionProgress);
    } catch (e) {
      setConvError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setConvLoading(false);
    }
  };

  return (
    <main className="mw-container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <h1 className="mw-h2">Аналитика организатора</h1>
      <p className="mw-lead" style={{ maxWidth: 760 }}>
        Просмотры, переходы, лиды и воронка бронирований. В режиме запуска платформа фиксирует ценность (трафик и лиды) для последующих договоров; комиссия рассчитывается внутри системы, но к оплате не выставляется.
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
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "end",
          flexWrap: "wrap",
          marginBottom: 20,
          padding: 16,
          background: "rgba(0,0,0,0.03)",
          borderRadius: 8,
        }}
      >
        <label>
          Program ID (для «Твой прогресс»)
          <input
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            style={{ display: "block", minWidth: 320, padding: 8 }}
            placeholder="programId опубликованной программы"
          />
        </label>
        <button
          onClick={loadConversion}
          disabled={!organizerId || !programId || convLoading}
          className="mw-btn"
          type="button"
        >
          {convLoading ? "Загрузка..." : "Загрузить прогресс"}
        </button>
      </div>
      {convError && <p style={{ color: "crimson" }}>{convError}</p>}
      {conversion && (
        <section className="mw-card" style={{ marginBottom: 20 }}>
          <h2 className="mw-h3" style={{ marginTop: 0 }}>
            Твой прогресс по программе
          </h2>
          <p style={{ margin: "0 0 12px", color: "#555" }}>
            <strong>{conversion.programTitle}</strong>
            {conversion.firstPublishedAt && (
              <span style={{ marginLeft: 8, fontSize: 14 }}>
                · с {new Date(conversion.firstPublishedAt).toLocaleDateString("ru-RU")}
              </span>
            )}
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#666" }}>
            Воронка на сервере: {conversion.funnelEnabled ? "включена" : "выключена (CONVERSION_FUNNEL_ENABLED)"}.
            Сервисные сообщения: {conversion.serviceCommsOptIn ? "вкл." : "отписались"}.
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#666", lineHeight: 1.5 }}>
            Режим платформы: <strong>{conversion.platformMode}</strong>
            {conversion.launchMode ? " (launch — автосообщения не обещают выставление комиссии)" : ""}. Rollout: этапы до{" "}
            <strong>{conversion.rollout.allowedMaxStage}</strong>, этап 4 — {conversion.rollout.enableStage4 ? "вкл." : "выкл."}
            , этап 5 — {conversion.rollout.enableStage5 ? "вкл." : "выкл."}, follow-up —{" "}
            {conversion.rollout.enableFollowup ? "вкл." : "выкл."}, интервал на организатора — {conversion.rollout.organizerMinIntervalHours}{" "}
            ч.
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, lineHeight: 1.7 }}>
            <li>{conversion.checklist.hasViews ? "✓" : "○"} Есть просмотры</li>
            <li>{conversion.checklist.hasClicks ? "✓" : "○"} Есть переходы</li>
            <li>{conversion.checklist.hasLeads ? "✓" : "○"} Есть заявки (лиды)</li>
            <li>{conversion.checklist.hasDeals ? "✓" : "○"} Есть подтверждённые брони</li>
            <li>{conversion.checklist.modelDiscussed ? "✓" : "○"} Обсуждение модели (этапы 4–5)</li>
          </ul>
          <p style={{ margin: "0 0 8px", fontSize: 14 }}>
            Метрики с даты публикации: просмотры {conversion.metrics.views}, переходы {conversion.metrics.clicks}, лиды{" "}
            {conversion.metrics.leads}, брони {conversion.metrics.deals}.
          </p>
          <a href={conversion.discussUrl} className="mw-btn mw-btn--primary" style={{ display: "inline-block", marginTop: 8 }}>
            Обсудить условия
          </a>
        </section>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {data && (
        <div style={{ display: "grid", gap: 16 }}>
          {data.launchMode && (
            <section
              className="mw-card"
              style={{
                borderLeft: "4px solid var(--mw-accent, #2563eb)",
                background: "rgba(37, 99, 235, 0.06)",
              }}
            >
              <h2 className="mw-h3" style={{ marginTop: 0 }}>
                Режим запуска (Launch)
              </h2>
              <p style={{ margin: 0, lineHeight: 1.6 }}>
                Первые месяцы размещение и работа через платформу для вас бесплатны. Мы собираем аналитику просмотров, переходов и лидов — эти данные помогут при заключении договора. Комиссия в системе считается для прозрачности, но счета и оплата комиссии пока не выставляются.
              </p>
            </section>
          )}
          <section className="mw-card">
            <h2 className="mw-h3">{data.organizer.displayName}</h2>
            <p style={{ margin: 0, color: "#555" }}>
              Режим платформы: <strong>{data.platformMode}</strong>
              {data.launchMode ? " (launch)" : " (monetization)"}
            </p>
            <p style={{ margin: "8px 0 0", color: "#555" }}>
              Статусы: verification={data.organizer.verificationStatus}, onboarding={data.organizer.onboardingStatus},
              billing={data.organizer.billingStatus}, privilege={data.organizer.privilegeStatus}
            </p>
          </section>
          <section className="mw-card">
            <h3 className="mw-h3">Воронка ({data.windowDays} дн.)</h3>
            <p style={{ margin: 0 }}>
              <strong>views</strong>={data.funnel.views} · <strong>clicks</strong>={data.funnel.clicks} ·{" "}
              <strong>leads</strong>={data.funnel.leads} · booked={data.funnel.booked} · paid={data.funnel.paid} ·
              completed={data.funnel.completed} · reviews={data.funnel.reviewsApproved}
            </p>
            <p style={{ margin: "12px 0 0", fontSize: 14, color: "#666" }}>
              Clicks — события вовлечения (выбор программы, поиск, шаринг и т.д.); views — просмотры страниц и карточек.
            </p>
          </section>
          <section className="mw-card">
            <h3 className="mw-h3">Атрибуция лидов</h3>
            {data.leadAttribution.bySource.length === 0 ? (
              <p style={{ margin: 0 }}>За окно нет лидов или нет разбивки по источнику.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                    <th style={{ padding: "6px 8px" }}>Источник</th>
                    <th style={{ padding: "6px 8px" }}>Канал</th>
                    <th style={{ padding: "6px 8px" }}>Лидов</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leadAttribution.bySource.map((row, i) => (
                    <tr key={`${row.source}-${row.sourceChannel ?? ""}-${i}`} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "6px 8px" }}>{row.source}</td>
                      <td style={{ padding: "6px 8px" }}>{row.sourceChannel ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.leadAttribution.topProgramsByLeads.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 className="mw-h3" style={{ fontSize: 16 }}>
                  Топ программ по лидам
                </h4>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.leadAttribution.topProgramsByLeads.map((r) => (
                    <li key={r.programId}>
                      program <code>{r.programId}</code> — {r.leads}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
            <h3 className="mw-h3">Рекомендации</h3>
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
