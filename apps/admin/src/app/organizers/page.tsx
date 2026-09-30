"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminJson } from "../../lib/admin";
import { verificationTone } from "../../components/admin/organizers/organizerModel";
import { AdminEmptyState } from "../../components/admin/AdminEmptyState";
import { AdminFilterField, AdminFiltersBar } from "../../components/admin/AdminFiltersBar";
import { AdminLoadingState } from "../../components/admin/AdminLoadingState";
import { AdminMessage } from "../../components/admin/AdminMessage";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminStatCard, AdminStatGrid } from "../../components/admin/AdminStatCard";
import { AdminStatusBadge } from "../../components/admin/AdminStatusBadge";
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
  autoPublishApprovedAt?: string | null;
  isIngestionStub?: boolean;
  publishedProgramCount?: number;
  _count?: { programs: number; sources: number; verificationEvidence: number };
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
  if (o.verificationStatus !== "verified" && o.verificationStatus !== "trusted_by_platform") {
    hints.push("Довести верификацию до «Верифицирован»/«Доверенный» для снижения операционных рисков.");
  }
  return hints.slice(0, 3);
}

function moderationPriority(o: Organizer, score: OrganizerScoreRow | undefined): { label: string; color: string } {
  if (!score) return { label: "P3 · ждём snapshot", color: "#666" };
  if (score.scoreBand === "low") return { label: "P1 · manual moderation", color: "#9f1d1d" };
  if (score.scoreBand === "unknown") return { label: "P2 · data follow-up", color: "#364fc7" };
  if (o.verificationStatus !== "trusted_by_platform") return { label: "P2 · verify before scale", color: "#8a5800" };
  return { label: "P3 · monitor", color: "#1d6f42" };
}

export default function OrganizersQueuePage() {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [scoreByOrganizerId, setScoreByOrganizerId] = useState<Record<string, OrganizerScoreRow>>({});
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [stubsOnly, setStubsOnly] = useState(false);
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

  const visibleOrganizers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const scoped = stubsOnly ? organizers.filter((o) => o.isIngestionStub) : organizers;
    if (!needle) return scoped;
    return scoped.filter((organizer) =>
      [organizer.displayName, organizer.contactEmail, organizer.contactPhone, organizer.legalStatus]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(needle)),
    );
  }, [organizers, search, stubsOnly]);

  const stats = useMemo(() => {
    const withScore = visibleOrganizers.filter((o) => scoreByOrganizerId[o.id]).length;
    const trustedVerified = visibleOrganizers.filter(
      (o) => o.verificationStatus === "verified" || o.verificationStatus === "trusted_by_platform",
    ).length;
    return { total: visibleOrganizers.length, withScore, trustedVerified };
  }, [visibleOrganizers, scoreByOrganizerId]);

  return (
    <main className="mw-admin-page">
      <AdminPageHeader
        title="Организаторы"
        description="Откройте организатора, чтобы проверить, отредактировать, привязать источники, управлять автопубликацией и объединить дубли. Ступени: В листинге → Проверен → Верифицирован → Доверенный."
      />
      {error ? <AdminMessage type="error">{error}</AdminMessage> : null}
      {loading ? (
        <AdminLoadingState />
      ) : (
        <>
          <AdminStatGrid>
            <AdminStatCard label="В списке" value={stats.total} hint="С учётом выбранного фильтра по верификации" />
            <AdminStatCard label="Verified / trusted" value={stats.trustedVerified} hint="В текущей выборке" />
            <AdminStatCard label="Со snapshot score" value={stats.withScore} hint="Метрики подтянулись с API" />
          </AdminStatGrid>

          <AdminFiltersBar title="Фильтры">
            <AdminFilterField label="Поиск организатора">
              <input
                className="mw-admin-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Название, e-mail или телефон"
                style={{ minWidth: 280 }}
              />
            </AdminFilterField>
            <AdminFilterField label="Статус верификации">
              <select
                className="mw-admin-input"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ minWidth: 220 }}
              >
                <option value="">Все</option>
                {ORGANIZER_VERIFICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {getOrganizerVerificationStatusLabel(s)}
                  </option>
                ))}
              </select>
            </AdminFilterField>
            <AdminFilterField label="Дубли">
              <label className="mw-admin-inline-form">
                <input type="checkbox" checked={stubsOnly} onChange={(e) => setStubsOnly(e.target.checked)} />
                Только созданные автосбором
              </label>
            </AdminFilterField>
          </AdminFiltersBar>

          {visibleOrganizers.length === 0 ? (
            <AdminEmptyState
              title="Нет организаторов"
              description="По текущему поиску или фильтру записей нет. Сбросьте их или проверьте импорт данных."
            />
          ) : (
            <div className="mw-admin-table-outer mw-admin-table-outer--always-scroll">
              <table className="mw-admin-table" style={{ minWidth: 1440 }}>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Статус верификации</th>
                    <th>Программы (на сайте / всего)</th>
                    <th>Источники</th>
                    <th>Автопубликация</th>
                    <th>Email</th>
                    <th>Onboarding</th>
                    <th>Billing</th>
                    <th>Privilege</th>
                    <th>Score (internal)</th>
                    <th>Moderation</th>
                    <th>Создан</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrganizers.map((o) => {
                    const score = scoreByOrganizerId[o.id];
                    const scoreMeta = scoreBandMeta(score?.scoreBand ?? "unknown");
                    const priority = moderationPriority(o, score);
                    const hints = organizerHints(o, score);
                    return (
                      <tr key={o.id}>
                        <td>
                          <Link href={`/organizers/${o.id}`}>
                            <strong>{o.displayName}</strong>
                          </Link>
                          {o.isIngestionStub ? <div className="mw-admin-caption">создан автосбором</div> : null}
                          <div className="mw-admin-mt-8">
                            <Link className="mw-admin-btn mw-admin-btn--ghost" href={`/organizers/${o.id}`}>
                              Открыть
                            </Link>
                          </div>
                        </td>
                        <td>
                          <AdminStatusBadge tone={verificationTone(o.verificationStatus)}>
                            {getOrganizerVerificationStatusLabel(o.verificationStatus)}
                          </AdminStatusBadge>
                        </td>
                        <td>
                          {o.publishedProgramCount ?? 0} / {o._count?.programs ?? 0}
                        </td>
                        <td>{o._count?.sources ?? 0}</td>
                        <td>{o.autoPublishApprovedAt ? "разрешена" : "нет"}</td>
                        <td className="mw-admin-muted">{o.isIngestionStub ? "заглушка" : o.contactEmail}</td>
                        <td className="mw-admin-muted">{getOrganizerOnboardingStatusLabel(o.onboardingStatus)}</td>
                        <td className="mw-admin-muted">{getOrganizerBillingStatusLabel(o.billingStatus)}</td>
                        <td className="mw-admin-muted">{getOrganizerPrivilegeStatusLabel(o.privilegeStatus)}</td>
                        <td style={{ maxWidth: 420, fontSize: "0.9rem" }}>
                          {score ? `${score.organizerScore.toFixed(1)} (${score.scoreBand})` : "—"}
                          <div style={{ marginTop: 6 }}>
                            <AdminStatusBadge
                              tone="muted"
                              style={{ background: scoreMeta.bg, color: scoreMeta.color, borderColor: "rgba(20,20,20,0.08)" }}
                            >
                              {scoreMeta.label}
                            </AdminStatusBadge>
                          </div>
                          <div className="mw-admin-muted" style={{ marginTop: 6, fontSize: "0.82rem", whiteSpace: "normal" }}>
                            {organizerBreakdown(score)}
                          </div>
                          {hints.length > 0 && (
                            <ul className="mw-admin-muted" style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "0.82rem" }}>
                              {hints.map((h) => (
                                <li key={h}>{h}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td>
                          <AdminStatusBadge
                            tone={
                              priority.label.startsWith("P1")
                                ? "danger"
                                : priority.label.startsWith("P2")
                                  ? "warn"
                                  : "muted"
                            }
                          >
                            {priority.label}
                          </AdminStatusBadge>
                        </td>
                        <td className="mw-admin-muted">{new Date(o.createdAt).toLocaleDateString("ru-RU")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
