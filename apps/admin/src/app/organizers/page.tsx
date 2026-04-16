"use client";

import { useEffect, useState } from "react";
import { adminJson } from "../../lib/admin";
import {
  ORGANIZER_VERIFICATION_STATUSES,
  getOrganizerBillingStatusLabel,
  getOrganizerOnboardingStatusLabel,
  getOrganizerPrivilegeStatusLabel,
  getOrganizerVerificationStatusLabel,
} from "@mywave/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Organizer = {
  id: string;
  displayName: string;
  legalStatus: string | null;
  contactEmail: string;
  contactPhone: string | null;
  responseScore: number | null;
  verificationStatus: string;
  onboardingStatus: string;
  billingStatus: string;
  privilegeStatus: string;
  createdAt: string;
};

type OrganizerScoreRow = {
  organizerId: string;
  organizerScore: number;
  scoreBand: string;
  sampleBookings?: number;
  componentsJson?: Record<string, number | null>;
};

type ScoreVisualMeta = {
  label: string;
  bg: string;
  color: string;
};

function scoreBandMeta(scoreBand: string): ScoreVisualMeta {
  if (scoreBand === "low") return { label: "weak organizer", bg: "#ffe8e8", color: "#9f1d1d" };
  if (scoreBand === "medium") return { label: "watchlist", bg: "#fff3dd", color: "#8a5800" };
  if (scoreBand === "unknown") return { label: "insufficient data", bg: "#eef1ff", color: "#364fc7" };
  return { label: "stable", bg: "#eaf7ee", color: "#1d6f42" };
}

function organizerBreakdown(score: OrganizerScoreRow | undefined): string {
  if (!score) return "Нет snapshot score.";
  const c = score.componentsJson ?? {};
  const profile = Number(c.profile_completeness_score ?? 0);
  const l2b = Number(c.lead_to_booked_score ?? 0);
  const b2p = Number(c.booked_to_paid_score ?? 0);
  const paid2done = Number(c.paid_to_completed_score ?? 0);
  const refundPenalty = Number(c.refund_penalty ?? 0);
  const complaintPenalty = Number(c.complaint_penalty ?? 0);
  return `Profile ${profile.toFixed(0)} · lead→booked ${l2b.toFixed(0)} · booked→paid ${b2p.toFixed(0)} · paid→completed ${paid2done.toFixed(0)} · penalties: refund -${refundPenalty.toFixed(1)}, complaints -${complaintPenalty.toFixed(1)}`;
}

function organizerHints(o: Organizer, score: OrganizerScoreRow | undefined): string[] {
  if (!score) return ["Снимок score ещё не создан — запустить recalculate."];
  const hints: string[] = [];
  const c = score.componentsJson ?? {};
  if (score.scoreBand === "unknown") hints.push("Мало данных: нужен минимум по бронированиям для устойчивого band.");
  if (Number(c.profile_completeness_score ?? 100) < 75) hints.push("Профиль неполный: проверить legal/contact fields.");
  if (Number(c.lead_to_booked_score ?? 100) < 45) hints.push("Провал lead→booked: проверить скорость ответа и квалификацию лидов.");
  if (Number(c.booked_to_paid_score ?? 100) < 50) hints.push("Провал booked→paid: проверить договор/оплату и clear payment next step.");
  if (Number(c.paid_to_completed_score ?? 100) < 60) hints.push("Провал paid→completed: проверить post-booking коммуникацию и completion ops.");
  if (Number(c.refund_penalty ?? 0) > 12) hints.push("Высокий refund penalty: сверить причины отмен и billing policy.");
  if (Number(c.complaint_penalty ?? 0) > 10) hints.push("Высокий complaint penalty: вынести в trust/moderation разбор.");
  if (o.verificationStatus !== "verified" && o.verificationStatus !== "trusted") hints.push("Довести verification до verified/trusted для снижения операционных рисков.");
  return hints.slice(0, 3);
}

function moderationPriority(o: Organizer, score: OrganizerScoreRow | undefined): { label: string; color: string } {
  if (!score) return { label: "P3 · ждём snapshot", color: "#666" };
  if (score.scoreBand === "low") return { label: "P1 · manual moderation", color: "#9f1d1d" };
  if (score.scoreBand === "unknown") return { label: "P2 · data follow-up", color: "#364fc7" };
  if (o.verificationStatus !== "trusted") return { label: "P2 · verify before scale", color: "#8a5800" };
  return { label: "P3 · monitor", color: "#1d6f42" };
}

export default function OrganizersQueuePage() {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [scoreByOrganizerId, setScoreByOrganizerId] = useState<Record<string, OrganizerScoreRow>>({});
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("admin_token") : null;
    if (!token) {
      window.location.href = "/login";
      return;
    }
    const q = filter ? `?verification_status=${encodeURIComponent(filter)}` : "";
    fetch(`${API_URL}/organizers${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          window.localStorage.removeItem("admin_token");
          window.location.href = "/login";
          return [];
        }
        return res.json();
      })
      .then((data) => {
        setOrganizers(Array.isArray(data) ? data : []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    if (loading || organizers.length === 0) return;
    let cancelled = false;
    adminJson<{ rows: OrganizerScoreRow[] }>("/metrics/organizers/scores/latest")
      .then((data) => {
        if (cancelled || !Array.isArray(data.rows)) return;
        const m: Record<string, OrganizerScoreRow> = {};
        for (const r of data.rows) {
          m[r.organizerId] = r;
        }
        setScoreByOrganizerId(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loading, organizers]);

  if (loading) return <p>Загрузка…</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <main style={{ padding: 24 }}>
      <p><strong>Организаторы</strong> | <a href="/programs">Программы</a> | <a href="/bookings">Заявки</a> | <a href="/incidents">Инциденты</a> | <a href="/reviews">Отзывы</a> | <a href="/commissions">Комиссии</a></p>
      <h1>Очередь организаторов</h1>
      <p style={{ fontSize: 14, color: "#555" }}>Верификация ведётся по внутренним runbook команды. Базовый порядок статусов: evidence → listed → checked → verified → trusted.</p>
      <p>
        Фильтр по верификации:{" "}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: 6 }}
        >
          <option value="">Все</option>
          {ORGANIZER_VERIFICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {getOrganizerVerificationStatusLabel(s)}
            </option>
          ))}
        </select>
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #333" }}>
            <th style={{ textAlign: "left", padding: 8 }}>Название</th>
            <th style={{ textAlign: "left", padding: 8 }}>Email</th>
            <th style={{ textAlign: "left", padding: 8 }}>Верификация</th>
            <th style={{ textAlign: "left", padding: 8 }}>Onboarding</th>
            <th style={{ textAlign: "left", padding: 8 }}>Billing</th>
            <th style={{ textAlign: "left", padding: 8 }}>Privilege</th>
            <th style={{ textAlign: "left", padding: 8 }}>Score (internal)</th>
            <th style={{ textAlign: "left", padding: 8 }}>Moderation priority</th>
            <th style={{ textAlign: "left", padding: 8 }}>Создан</th>
          </tr>
        </thead>
        <tbody>
          {organizers.map((o) => {
            const score = scoreByOrganizerId[o.id];
            const scoreMeta = scoreBandMeta(score?.scoreBand ?? "unknown");
            const priority = moderationPriority(o, score);
            const hints = organizerHints(o, score);
            return (
            <tr key={o.id} style={{ borderBottom: "1px solid #ccc" }}>
              <td style={{ padding: 8 }}>{o.displayName}</td>
              <td style={{ padding: 8 }}>{o.contactEmail}</td>
              <td style={{ padding: 8 }}>{getOrganizerVerificationStatusLabel(o.verificationStatus)}</td>
              <td style={{ padding: 8 }}>{getOrganizerOnboardingStatusLabel(o.onboardingStatus)}</td>
              <td style={{ padding: 8 }}>{getOrganizerBillingStatusLabel(o.billingStatus)}</td>
              <td style={{ padding: 8 }}>{getOrganizerPrivilegeStatusLabel(o.privilegeStatus)}</td>
              <td style={{ padding: 8, fontSize: 13, color: "#444", maxWidth: 420 }}>
                {score
                  ? `${score.organizerScore.toFixed(1)} (${score.scoreBand})`
                  : "—"}
                <div style={{ marginTop: 4 }}>
                  <span style={{ background: scoreMeta.bg, color: scoreMeta.color, borderRadius: 999, padding: "2px 8px", fontSize: 12 }}>
                    {scoreMeta.label}
                  </span>
                </div>
                <div style={{ marginTop: 6, color: "#666", fontSize: 12 }}>
                  {organizerBreakdown(score)}
                </div>
                {hints.length > 0 && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#555", fontSize: 12 }}>
                    {hints.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                )}
              </td>
              <td style={{ padding: 8 }}>
                <span style={{ color: priority.color, fontWeight: 600 }}>{priority.label}</span>
              </td>
              <td style={{ padding: 8 }}>{new Date(o.createdAt).toLocaleDateString()}</td>
            </tr>
          )})}
        </tbody>
      </table>
      {organizers.length === 0 && <p>Нет организаторов.</p>}
    </main>
  );
}
